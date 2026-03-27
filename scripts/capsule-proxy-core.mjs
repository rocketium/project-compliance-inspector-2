import { MongoClient, ObjectId } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COLLECTION_NAME = "capsules";
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let cachedClient = null;
let cachedDbName = null;
let envLoaded = false;

export const getEnv = (name, fallback = "") =>
  process.env[name]?.trim() || fallback;

const parseEnvFile = (contents) =>
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return null;
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      return key ? [key, value] : null;
    })
    .filter(Boolean);

export const loadNodeEnvFiles = () => {
  if (envLoaded) {
    return;
  }

  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(ROOT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    for (const [key, value] of parseEnvFile(fs.readFileSync(filePath, "utf8"))) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  envLoaded = true;
};

export const toPlainJson = (value) =>
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
  );

export const getMongoDbName = () => {
  if (cachedDbName) {
    return cachedDbName;
  }

  const explicit = getEnv("MONGODB_DB_NAME");
  if (explicit) {
    cachedDbName = explicit;
    return cachedDbName;
  }

  const uri = getEnv("MONGODB_URI");
  if (!uri) {
    cachedDbName = "rocketium_2";
    return cachedDbName;
  }

  try {
    const parsed = new URL(uri);
    const fromPath = parsed.pathname.replace(/^\//, "").trim();
    cachedDbName = fromPath || "rocketium_2";
    return cachedDbName;
  } catch {
    cachedDbName = "rocketium_2";
    return cachedDbName;
  }
};

export const getMongoClient = async () => {
  if (cachedClient) {
    return cachedClient;
  }

  const uri = getEnv("MONGODB_URI");
  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }

  cachedClient = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15000,
  });
  await cachedClient.connect();
  return cachedClient;
};

export const isAuthorized = (headers = {}) => {
  const expected = getEnv("CAPSULE_PROXY_KEY");
  if (!expected) {
    return true;
  }

  const value =
    headers["x-capsule-proxy-key"] ||
    headers["X-Capsule-Proxy-Key"] ||
    headers["x-capsule-proxy-key".toLowerCase()];

  return value === expected;
};

export const lookupCapsule = async (capsuleId) => {
  if (!capsuleId?.trim()) {
    throw new Error("Missing capsuleId");
  }

  const client = await getMongoClient();
  const collection = client.db(getMongoDbName()).collection(COLLECTION_NAME);

  const byCapsuleId = await collection.findOne({ capsuleId });
  if (byCapsuleId) {
    return toPlainJson(byCapsuleId);
  }

  if (ObjectId.isValid(capsuleId)) {
    const byObjectId = await collection.findOne({ _id: new ObjectId(capsuleId) });
    if (byObjectId) {
      return toPlainJson(byObjectId);
    }
  }

  return null;
};

export const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});
