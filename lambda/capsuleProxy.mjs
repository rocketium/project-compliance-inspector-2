import { isAuthorized, json, lookupCapsule } from "../scripts/capsule-proxy-core.mjs";

export const handler = async (event) => {
  try {
    if (event.requestContext?.http?.method !== "GET") {
      return json(405, { error: "Method not allowed" });
    }

    if (!isAuthorized(event.headers || {})) {
      return json(401, { error: "Unauthorized" });
    }

    const capsuleId = String(
      event.pathParameters?.capsuleId ||
        event.queryStringParameters?.capsuleId ||
        ""
    ).trim();

    if (!capsuleId) {
      return json(400, { error: "Missing capsuleId" });
    }

    const capsule = await lookupCapsule(capsuleId);
    if (!capsule) {
      return json(404, { success: false, error: "Capsule not found" });
    }

    return json(200, { success: true, capsule });
  } catch (error) {
    return json(500, {
      success: false,
      error: error?.message || "Capsule lookup failed",
    });
  }
};
