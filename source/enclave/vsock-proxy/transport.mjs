import { lstatSync, unlinkSync } from "node:fs";
import net from "node:net";

// A sealed-ticket recovery may wait up to 65 seconds for attested KMS.
export const ORACLE_RPC_TIMEOUT_MS = 90_000;

function encodeParams(params) {
  const output = { ...params };
  for (const field of ["nonce", "publicKey"]) {
    if (Buffer.isBuffer(output[field]) || output[field] instanceof Uint8Array) {
      output[`${field}B64`] = Buffer.from(output[field]).toString("base64");
      delete output[field];
    }
  }
  return output;
}

function decodeParams(params = {}) {
  const output = { ...params };
  for (const field of ["nonce", "publicKey"]) {
    const encoded = output[`${field}B64`];
    if (encoded !== undefined) {
      output[field] = Buffer.from(encoded, "base64");
      delete output[`${field}B64`];
    }
  }
  return output;
}

export class LocalSocketTransport {
  /**
   * @param {{ socketPath?: string, oracle?: any, diceProofOracle?: any, gameProofOracle?: any, progressiveProofOracle?: any, maxFrameBytes?: number, timeoutMs?: number }} [options]
   */
  constructor({ socketPath, oracle = null, diceProofOracle = null, gameProofOracle = null, progressiveProofOracle = null, maxFrameBytes = 1024 * 1024, timeoutMs = ORACLE_RPC_TIMEOUT_MS } = {}) {
    if (!socketPath) throw new TypeError("LocalSocketTransport requires socketPath");
    this.socketPath = socketPath;
    this.oracle = oracle;
    this.diceProofOracle = diceProofOracle;
    this.gameProofOracle = gameProofOracle;
    this.progressiveProofOracle = progressiveProofOracle;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("Invalid oracle timeout");
    this.timeoutMs = timeoutMs;
    this.maxFrameBytes = maxFrameBytes;
    this.server = null;
    this.inProcessFallback = false;
    this.requestId = 0;
  }

  async dispatch(action, params) {
    if (action === "progressive-ticket" || action === "progressive-advance" || action === "progressive-health") {
      if (!this.progressiveProofOracle) throw new Error("Local socket has no progressive proof oracle");
      if (action === "progressive-ticket") return this.progressiveProofOracle.createTicket(params);
      if (action === "progressive-advance") return this.progressiveProofOracle.advance(params);
      return this.progressiveProofOracle.health();
    }
    if (action === "game-ticket" || action === "game-play" || action === "game-health") {
      if (!this.gameProofOracle) throw new Error("Local socket has no game proof oracle");
      if (action === "game-ticket") return this.gameProofOracle.createTicket(params);
      if (action === "game-play") return this.gameProofOracle.play(params);
      return this.gameProofOracle.health();
    }
    if (action === "dice-ticket") {
      if (!this.diceProofOracle) throw new Error("Local socket has no Dice proof oracle");
      return this.diceProofOracle.createTicket(params);
    }
    if (action === "dice-play") {
      if (!this.diceProofOracle) throw new Error("Local socket has no Dice proof oracle");
      return this.diceProofOracle.playTicket(params);
    }
    if (action === "dice-health") {
      if (!this.diceProofOracle) throw new Error("Local socket has no Dice proof oracle");
      return this.diceProofOracle.health();
    }
    if (!this.oracle) throw new Error("Local socket has no legacy oracle server");
    if (action === "mint") return this.oracle.mintSession(params);
    if (action === "spin") return this.oracle.compute(params);
    if (action === "reveal") return this.oracle.reveal(params);
    throw new Error(`Unknown oracle action: ${action}`);
  }

  async start({ unref = false, allowInProcessFallback = true } = {}) {
    if (this.server) return;
    if (!this.oracle && !this.diceProofOracle && !this.gameProofOracle && !this.progressiveProofOracle) throw new Error("Starting LocalSocketTransport requires an oracle");
    try {
      const existing = lstatSync(this.socketPath);
      if (!existing.isSocket()) throw new Error(`Refusing to replace non-socket path ${this.socketPath}`);
      unlinkSync(this.socketPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    this.server = net.createServer((socket) => {
      let input = "";
      let dispatched = false;
      socket.setEncoding("utf8");
      socket.setTimeout(this.timeoutMs, () => socket.destroy());
      socket.on("error", () => {});
      socket.on("data", (chunk) => {
        if (dispatched) return;
        input += chunk;
        if (Buffer.byteLength(input) > this.maxFrameBytes) {
          socket.destroy(new Error("Oracle request is too large"));
          return;
        }
        const newline = input.indexOf("\n");
        if (newline === -1) return;
        dispatched = true;
        const frame = input.slice(0, newline);
        input = input.slice(newline + 1);
        Promise.resolve()
          .then(() => JSON.parse(frame))
          .then(async ({ id, action, params }) => ({ id, ok: true, result: await this.dispatch(action, decodeParams(params)) }))
          .catch((error) => ({ ok: false, error: error.message }))
          .then((response) => socket.end(`${JSON.stringify(response)}\n`));
      });
    });
    try {
      await new Promise((resolve, reject) => {
        this.server.once("error", reject);
        this.server.listen(this.socketPath, () => {
          this.server.off("error", reject);
          resolve();
        });
      });
    } catch (error) {
      this.server = null;
      if (!allowInProcessFallback || !["EPERM", "EACCES"].includes(error.code)) throw error;
      // Some managed CI sandboxes forbid AF_UNIX bind. This local-only fallback
      // keeps the interface testable; it is never used by VsockTransport.
      this.inProcessFallback = true;
      return;
    }
    if (unref) this.server.unref();
  }

  request(action, params = {}) {
    if (this.inProcessFallback) return Promise.resolve(this.dispatch(action, decodeParams(encodeParams(params))));
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      let input = "";
      socket.setEncoding("utf8");
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error("Oracle request timed out; outcome may require recovery")));
      const deadline = setTimeout(() => socket.destroy(new Error("Oracle request timed out; outcome may require recovery")), this.timeoutMs);
      deadline.unref();
      socket.once("close", () => clearTimeout(deadline));
      socket.once("connect", () => socket.write(`${JSON.stringify({ id, action, params: encodeParams(params) })}\n`));
      socket.on("data", (chunk) => {
        input += chunk;
        if (Buffer.byteLength(input) > this.maxFrameBytes) socket.destroy(new Error("Oracle response is too large"));
      });
      socket.once("error", reject);
      socket.once("close", () => reject(new Error("Oracle connection closed; outcome may require recovery")));
      socket.once("end", () => {
        try {
          const response = JSON.parse(input.trim());
          if (!response.ok) reject(new Error(response.error || "Oracle request failed"));
          else if (response.id !== id) reject(new Error("Oracle response ID mismatch"));
          else resolve(response.result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  mint(params) {
    return this.request("mint", params);
  }

  spin(params) {
    return this.request("spin", params);
  }

  reveal(params) {
    return this.request("reveal", params);
  }

  createDiceTicket(params) {
    return this.request("dice-ticket", params);
  }

  playDiceTicket(params) {
    return this.request("dice-play", params);
  }

  diceHealth() {
    return this.request("dice-health", {});
  }

  createGameTicket(params) { return this.request("game-ticket", params); }
  playGameTicket(params) { return this.request("game-play", params); }
  gameHealth() { return this.request("game-health", {}); }
  createProgressiveTicket(params) { return this.request("progressive-ticket", params); }
  advanceProgressiveTicket(params) { return this.request("progressive-advance", params); }
  progressiveHealth() { return this.request("progressive-health", {}); }

  async close() {
    if (!this.server) {
      this.inProcessFallback = false;
      return;
    }
    const server = this.server;
    this.server = null;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      const existing = lstatSync(this.socketPath);
      if (existing.isSocket()) unlinkSync(this.socketPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export class VsockTransport {
  /** @param {{ cid?: number, port?: number, socketPath?: string, timeoutMs?: number }} [options] */
  constructor({ cid = 16, port = 5000, socketPath, timeoutMs = ORACLE_RPC_TIMEOUT_MS } = {}) {
    this.cid = cid;
    this.port = port;
    // node:net has no AF_VSOCK address support. On an enclave host, socat owns
    // the AF_VSOCK connection and exposes this ordinary Unix client socket.
    this.client = socketPath ? new LocalSocketTransport({ socketPath, timeoutMs }) : null;
  }

  request(action, params) {
    if (!this.client) {
      throw new Error("VsockTransport requires an enclave host socketPath bridged to AF_VSOCK");
    }
    return this.client.request(action, params);
  }

  mint(params) { return this.request("mint", params); }
  spin(params) { return this.request("spin", params); }
  reveal(params) { return this.request("reveal", params); }
  createDiceTicket(params) { return this.request("dice-ticket", params); }
  playDiceTicket(params) { return this.request("dice-play", params); }
  diceHealth() { return this.request("dice-health", {}); }
  createGameTicket(params) { return this.request("game-ticket", params); }
  playGameTicket(params) { return this.request("game-play", params); }
  gameHealth() { return this.request("game-health", {}); }
  createProgressiveTicket(params) { return this.request("progressive-ticket", params); }
  advanceProgressiveTicket(params) { return this.request("progressive-advance", params); }
  progressiveHealth() { return this.request("progressive-health", {}); }

  close() {
    return this.client?.close();
  }
}
