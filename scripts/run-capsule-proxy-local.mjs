import http from "node:http";
import {
  isAuthorized,
  json,
  lookupCapsule,
  getEnv,
  loadNodeEnvFiles,
} from "./capsule-proxy-core.mjs";

loadNodeEnvFiles();

const port = Number(getEnv("CAPSULE_PROXY_PORT", "8787"));

const send = (res, response) => {
  res.writeHead(response.statusCode, response.headers);
  res.end(response.body);
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      return send(res, json(200, { ok: true }));
    }

    if (req.method !== "GET") {
      return send(res, json(405, { error: "Method not allowed" }));
    }

    if (!isAuthorized(req.headers)) {
      return send(res, json(401, { error: "Unauthorized" }));
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const match = url.pathname.match(/^\/api\/capsules\/([^/]+)$/);
    if (!match) {
      return send(res, json(404, { error: "Not found" }));
    }

    const capsuleId = decodeURIComponent(match[1] || "").trim();
    if (!capsuleId) {
      return send(res, json(400, { error: "Missing capsuleId" }));
    }

    const capsule = await lookupCapsule(capsuleId);
    if (!capsule) {
      return send(res, json(404, { success: false, error: "Capsule not found" }));
    }

    return send(res, json(200, { success: true, capsule }));
  } catch (error) {
    return send(
      res,
      json(500, {
        success: false,
        error: error?.message || "Capsule lookup failed",
      })
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Capsule proxy listening on http://127.0.0.1:${port}`);
});
