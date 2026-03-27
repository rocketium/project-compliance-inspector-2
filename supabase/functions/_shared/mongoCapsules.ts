import { MongoClient, ObjectId } from "npm:mongodb@6.16.0";

const COLLECTION_NAME = "capsules";

let cachedClient: MongoClient | null = null;
let cachedDbName: string | null = null;

const getMongoDbName = (uri: string) => {
  if (cachedDbName) {
    return cachedDbName;
  }

  const explicitDbName = Deno.env.get("MONGODB_DB_NAME")?.trim();
  if (explicitDbName) {
    cachedDbName = explicitDbName;
    return cachedDbName;
  }

  try {
    const parsed = new URL(uri);
    const pathDbName = parsed.pathname.replace(/^\//, "").trim();
    if (pathDbName) {
      cachedDbName = pathDbName;
      return cachedDbName;
    }
  } catch {
    // Fall through to the default database name below.
  }

  cachedDbName = "rocketium_2";
  return cachedDbName;
};

const toPlainJson = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, currentValue) => {
      if (
        currentValue &&
        typeof currentValue === "object" &&
        currentValue.constructor?.name === "ObjectId"
      ) {
        return currentValue.toString();
      }

      return currentValue;
    })
  ) as Record<string, unknown>;

const normalizeCapsuleDocument = (doc: Record<string, unknown>) =>
  toPlainJson(doc);

const loadCapsuleFromProxy = async (capsuleId: string) => {
  const baseUrl = Deno.env.get("CAPSULE_LOOKUP_BASE_URL")?.trim();
  if (!baseUrl) {
    return null;
  }

  const proxyToken = Deno.env.get("CAPSULE_LOOKUP_TOKEN")?.trim();
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/capsules/${encodeURIComponent(capsuleId)}`,
    {
      headers: proxyToken ? { "x-capsule-proxy-key": proxyToken } : undefined,
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Capsule proxy lookup failed (${response.status})`);
  }

  const payload = await response.json();
  const capsule =
    payload?.capsule && typeof payload.capsule === "object"
      ? payload.capsule
      : payload && typeof payload === "object"
      ? payload
      : null;

  return capsule ? (capsule as Record<string, unknown>) : null;
};

const getMongoClient = async () => {
  if (cachedClient) {
    return cachedClient;
  }

  const uri = Deno.env.get("MONGODB_URI");
  if (!uri) {
    throw new Error("Missing MONGODB_URI environment variable");
  }

  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client;
};

export const loadCapsuleDocument = async (
  capsuleId: string
): Promise<Record<string, unknown> | null> => {
  const proxyHit = await loadCapsuleFromProxy(capsuleId);
  if (proxyHit) {
    return normalizeCapsuleDocument(proxyHit);
  }

  const uri = Deno.env.get("MONGODB_URI");
  if (!uri) {
    return null;
  }

  const client = await getMongoClient();
  const collection = client
    .db(getMongoDbName(uri))
    .collection(COLLECTION_NAME);

  const byCapsuleId = await collection.findOne({ capsuleId });
  if (byCapsuleId) {
    return normalizeCapsuleDocument(byCapsuleId as Record<string, unknown>);
  }

  if (ObjectId.isValid(capsuleId)) {
    const byObjectId = await collection.findOne({ _id: new ObjectId(capsuleId) });
    if (byObjectId) {
      return normalizeCapsuleDocument(byObjectId as Record<string, unknown>);
    }
  }

  return null;
};
