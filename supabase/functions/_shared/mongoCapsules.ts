const CAPSULE_EXPORT_URL =
  "https://api.rocketium.com/api/v1/canvas/exported-capsules";
const CAPSULE_BATCH_SIZE = 50;

interface CapsuleAuth {
  userId: string;
  sessionId: string;
}

const PROJECTION = {
  canvasData: 1,
  savedCustomDimensions: 1,
  capsuleId: 1,
  outputFormat: 1,
  name: 1,
};

const normalizeCapsuleDocument = (doc: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;

const parseCapsulePayload = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object"
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.capsules,
    record.data,
    record.results,
    record.exportedCapsules,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object"
      );
    }
  }

  return [];
};

const getCapsuleDocumentKeys = (doc: Record<string, unknown>) =>
  [doc.capsuleId, doc._id, doc.id]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim());

const fetchCapsuleBatch = async (
  capsuleIds: string[],
  auth: CapsuleAuth
): Promise<Record<string, unknown>[]> => {
  if (capsuleIds.length === 0) {
    return [];
  }

  const response = await fetch(CAPSULE_EXPORT_URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      origin: "https://rocketium.com",
      referer: "https://rocketium.com/",
      requestid: crypto.randomUUID(),
      sessionid: auth.sessionId,
      userid: auth.userId,
    },
    body: JSON.stringify({
      capsuleIds,
      projection: PROJECTION,
    }),
  });

  if (!response.ok) {
    throw new Error(`Capsule export lookup failed (${response.status})`);
  }

  const payload = await response.json();
  return parseCapsulePayload(payload);
};

export const loadCapsuleDocuments = async (
  capsuleIds: string[],
  auth: CapsuleAuth
): Promise<Map<string, Record<string, unknown>>> => {
  const normalizedIds = Array.from(
    new Set(capsuleIds.map((item) => item.trim()).filter(Boolean))
  );
  const capsules = new Map<string, Record<string, unknown>>();

  for (let index = 0; index < normalizedIds.length; index += CAPSULE_BATCH_SIZE) {
    const batch = normalizedIds.slice(index, index + CAPSULE_BATCH_SIZE);
    const docs = await fetchCapsuleBatch(batch, auth);
    docs.forEach((doc) => {
      const normalized = normalizeCapsuleDocument(doc);
      getCapsuleDocumentKeys(doc).forEach((docId) => {
        capsules.set(docId, normalized);
      });
    });
  }

  return capsules;
};

export const loadCapsuleDocument = async (
  capsuleId: string,
  auth: CapsuleAuth
): Promise<Record<string, unknown> | null> => {
  const docs = await loadCapsuleDocuments([capsuleId], auth);
  return docs.get(capsuleId) || null;
};
