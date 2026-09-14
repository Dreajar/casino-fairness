import https from "node:https";
import { readFileSync } from "node:fs";
import { LocalSocketTransport } from "./transport.mjs";
const transport = new LocalSocketTransport({ socketPath: process.env.ORACLE_SOCKET || "/run/casino-fairness/oracle.sock" });
const actions = new Set(["game-ticket", "game-play", "game-health", "progressive-ticket", "progressive-advance", "progressive-health"]);
const server = https.createServer({ key: readFileSync(process.env.ORACLE_TLS_KEY), cert: readFileSync(process.env.ORACLE_TLS_CERT), minVersion: "TLSv1.2" }, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST" || req.url !== "/rpc") { res.writeHead(404); res.end('{}'); return; }
  let input = ""; let size = 0;
  req.setEncoding("utf8");
  req.on("error", () => res.destroy());
  req.on("data", chunk => {
    size += Buffer.byteLength(chunk);
    if (size > 1024 * 1024) { res.writeHead(413); res.end('{}'); req.destroy(); }
    else input += chunk;
  });
  req.on("end", async () => {
    try {
      const { action, params } = JSON.parse(input);
      if (!actions.has(action)) { res.writeHead(400); res.end('{}'); return; }
      const result = await transport.request(action, params);
      res.end(JSON.stringify(result));
    } catch { res.writeHead(502); res.end(JSON.stringify({ error: "Oracle unavailable; preserve the original wager for recovery" })); }
  });
});
server.requestTimeout = 100000; server.headersTimeout = 10000;
server.maxConnections = 256;
server.listen(Number(process.env.PORT || 9443), "0.0.0.0");
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => server.close());
