import https from "node:https";

/** Backend-to-parent transport. Attestation/signature checks remain mandatory:
 * the parent's TLS certificate is transport authentication, not hardware proof. */
export class PinnedHttpsOracleTransport {
  constructor({ endpoint, certificatePem, timeoutMs = 100000 }) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/rpc")
      throw new Error("Invalid oracle TLS endpoint");
    if (typeof certificatePem !== "string" || !certificatePem.startsWith("-----BEGIN CERTIFICATE-----"))
      throw new Error("Oracle TLS certificate pin required");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("Invalid oracle timeout");
    this.url = url; this.ca = certificatePem; this.timeoutMs = timeoutMs;
  }
  request(action, params) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ action, params });
      const request = https.request(this.url, { method: "POST", ca: this.ca, rejectUnauthorized: true, minVersion: "TLSv1.2",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, response => {
        const chunks = []; let size = 0;
        response.on("data", chunk => { size += chunk.length; if (size > 1024 * 1024) response.destroy(new Error("Oracle response too large")); else chunks.push(chunk); });
        response.on("error", reject);
        response.on("end", () => {
          try {
            if (response.statusCode !== 200) throw new Error("Oracle request failed; wager may require recovery");
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) { reject(error); }
        });
      });
      request.setTimeout(this.timeoutMs, () => request.destroy(new Error("Oracle timed out; wager may require recovery")));
      const deadline = setTimeout(() => request.destroy(new Error("Oracle timed out; wager may require recovery")), this.timeoutMs);
      deadline.unref();
      request.once("close", () => clearTimeout(deadline));
      request.on("error", reject); request.end(body);
    });
  }
  createGameTicket(params) { return this.request("game-ticket", params); }
  playGameTicket(params) { return this.request("game-play", params); }
  gameHealth() { return this.request("game-health", {}); }
  createProgressiveTicket(params) { return this.request("progressive-ticket", params); }
  advanceProgressiveTicket(params) { return this.request("progressive-advance", params); }
  progressiveHealth() { return this.request("progressive-health", {}); }
}
