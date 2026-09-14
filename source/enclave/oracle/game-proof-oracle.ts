import { createHash, randomBytes } from "node:crypto";
import { SLOT_PAYOUT_SCALES } from "../../packages/fairness-core/src/slot-payout-scales.ts";
import {
  baccaratPayoutMinor, commitmentFor, maximumMultiplierForAction, isEnabledGameId, outcomeFor,
  quantizeSettlementMultiplier, slotActionCostMultiplier, slotChargedWagerMinor, parsePrismDeckAction
} from "../../packages/fairness-core/src/index.ts";
import {
  canonicalJson, exportP256PublicKey, generateP256SigningKey
} from "../../packages/dice-proof/src/index.mjs";
import { floorMinorByDecimal as multiplyMinorByDecimal } from "../../apps/server/src/payments/money.ts";

export const GAME_PROOF_PROTOCOL = "casino-game-proof-v1";
// These games require persistent, ordered actions; a one-shot outcomeFor call
// cannot attest the interactive game the player actually played.
export const INTERACTIVE_GAMES = new Set([
  "stake-pump", "moles", "rainbet-mines", "chicken-cross", "floor-is-lava",
  "tower", "dragon-tower", "video-poker", "blackjack", "rainbet-war", "thirteen-card-flip"
]);
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown, label: string, length = 128): string => {
  if (typeof value !== "string" || !value.length || value.length > length) throw new Error(`Invalid ${label}`);
  return value;
};
const amount = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,14}$/.test(value)) throw new Error("Invalid wagerMinor");
  return BigInt(value);
};
export interface GameTicketRequest {
  challengeB64: string;
  playerRef: string;
  clubRef: string;
  roundId: string;
  gameId: string;
  wagerMinor: string;
  action: string;
}
export interface GameProofPolicy {
  releaseId: string;
  rulesHash: string;
  enabledGameIds: readonly string[];
  maximumWagerMinor: bigint;
  maximumPayoutMinor: bigint;
}
interface Ticket {
  binding: Record<string, string | number>;
  serverSeed?: string;
  privateKey?: CryptoKey;
  requestHash?: string;
  response?: Promise<GameProofResult>;
}
export interface GameProofResult {
  receipt: Record<string, string | number>;
  receiptSignatureB64: string;
  serverSeed: string;
}

/** Single-stage production protocol kernel. Instantiating this does not enable
 * wagering: DB reservation/receipt verification and a measured release are
 * independently required. No host RNG, seed import, or outcome input exists. */
export class GameProofOracle {
  readonly #restoring = new Map<string, Promise<Ticket>>();
  readonly #tickets = new Map<string, Ticket>();
  readonly #rounds = new Map<string, string>();
  readonly #bootId: string;
  constructor(
    private readonly attestor: { attest(input: { userData: Buffer; nonce: Buffer; publicKey: Uint8Array }): Uint8Array | Promise<Uint8Array> },
    private readonly policy: GameProofPolicy,
    private readonly clock = Date.now,
    private readonly recovery?: { seal(value: unknown): Promise<string>; open(value: string): Promise<any> },
    bootId = randomBytes(16).toString("hex")
  ) {
    if (!/^[a-f0-9]{32}$/.test(bootId)) throw new Error("Invalid enclave boot identity");
    this.#bootId = bootId;
    text(policy.releaseId, "releaseId");
    if (!/^[a-f0-9]{64}$/.test(policy.rulesHash)) throw new Error("Invalid rules hash");
    if (policy.enabledGameIds.some((id) => !isEnabledGameId(id) || INTERACTIVE_GAMES.has(id))) throw new Error("Policy contains an unsupported single-stage game");
    if (!policy.enabledGameIds.length || new Set(policy.enabledGameIds).size !== policy.enabledGameIds.length) throw new Error("Invalid enabled game policy");
    if (typeof policy.maximumWagerMinor !== "bigint" || policy.maximumWagerMinor <= 0n || policy.maximumWagerMinor > 999999999999999n || typeof policy.maximumPayoutMinor !== "bigint" || policy.maximumPayoutMinor <= 0n || policy.maximumPayoutMinor > 999999999999999999n) throw new Error("Invalid release monetary limits");
    // The caller cannot change the rules of an already attested boot.
    this.policy = Object.freeze({ ...policy, enabledGameIds: Object.freeze([...policy.enabledGameIds]) });
  }
  health() {
    return {
      usdScale: 8, protocolVersion: GAME_PROOF_PROTOCOL, releaseId: this.policy.releaseId, rulesHash: this.policy.rulesHash,
      bootId: this.#bootId, enabledGameIds: [...this.policy.enabledGameIds],
      maximumWagerMinor: this.policy.maximumWagerMinor.toString(), maximumPayoutMinor: this.policy.maximumPayoutMinor.toString(),
      // Routing hints only: a health response is not hardware evidence.
      capacityRemaining: 100_000 - this.#rounds.size
    };
  }
  async createTicket(request: GameTicketRequest) {
    const gameId = text(request.gameId, "gameId");
    if (!isEnabledGameId(gameId) || !this.policy.enabledGameIds.includes(gameId)) throw new Error("Game has no approved enclave kernel");
    const challenge = Buffer.from(text(request.challengeB64, "challenge"), "base64");
    if (challenge.length !== 32 || challenge.toString("base64") !== request.challengeB64) throw new Error("Invalid challenge encoding");
    const wager = amount(request.wagerMinor);
    if (wager > this.policy.maximumWagerMinor) throw new Error("Wager exceeds release policy");
    text(request.action, "action", 1024);
    if (gameId === "prism-deck") parsePrismDeckAction(request.action);
    const charged = slotChargedWagerMinor(wager, gameId, request.action);
    if (SLOT_PAYOUT_SCALES[gameId] && charged > 10_000_000_000n) throw new Error("Total slot wager exceeds $100.00");
    if (charged <= 0n || charged > this.policy.maximumWagerMinor) throw new Error("Charged wager exceeds release policy");
    const maximumPayout = multiplyMinorByDecimal(charged, String(maximumMultiplierForAction(gameId, request.action)));
    if (maximumPayout > this.policy.maximumPayoutMinor) throw new Error("Maximum possible payout exceeds release policy");
    // Exercise the engine's action parser before attestation/fund reservation.
    // This public fixed stream is unrelated to the later random ticket seed;
    // its payout is discarded and is never used to decide wager eligibility.
    outcomeFor("casino-action-validation-v1", { gameId, action: request.action, clientSeed: "public-validation", nonce: 0 });
    text(request.roundId, "roundId"); text(request.playerRef, "playerRef"); text(request.clubRef, "clubRef");
    const roundKey = canonicalJson([request.playerRef, request.clubRef, request.roundId]);
    // Never reissue an expired/lost round under a fresh seed on the same boot.
    if (this.#rounds.has(roundKey)) throw new Error("Round already has a ticket");
    if (this.#rounds.size >= 100_000) throw new Error("Oracle capacity reached; drain before replacing");
    this.#rounds.set(roundKey, "pending");
    const now = this.clock();
    const serverSeed = randomBytes(32).toString("hex");
    const ticketId = randomBytes(16).toString("hex");
    const keys = this.recovery
      ? await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
      : await generateP256SigningKey();
    const publicKey = await exportP256PublicKey(keys.publicKey);
    const binding: Record<string, string | number> = {
      usdScale: 8,
      protocolVersion: GAME_PROOF_PROTOCOL, releaseId: this.policy.releaseId, rulesHash: this.policy.rulesHash,
      bootId: this.#bootId, ticketId, roundId: request.roundId, playerRef: request.playerRef, clubRef: request.clubRef,
      gameId, wagerMinor: request.wagerMinor, chargedWagerMinor: charged.toString(), action: request.action, sequence: 0,
      payoutRounding: "floor-minor-v1",
      serverSeedHash: commitmentFor(serverSeed), publicKeySha256: sha(publicKey), issuedAt: now, expiresAt: now + 300_000
    };
    let recoveryB64: string | undefined;
    if (this.recovery) {
      binding.recoveryProtocol = "sealed-ticket-v1";
      const keyBytes = new Uint8Array(await globalThis.crypto.subtle.exportKey("pkcs8", keys.privateKey));
      try { recoveryB64 = await this.recovery.seal({ binding, serverSeed, privateKeyB64: Buffer.from(keyBytes).toString("base64") }); }
      finally { keyBytes.fill(0); }
      binding.recoverySha256 = sha(recoveryB64);
    }
    const attestation = await this.attestor.attest({ userData: Buffer.from(sha(canonicalJson(binding)), "hex"), nonce: challenge, publicKey });
    this.#tickets.set(ticketId, { binding, serverSeed, privateKey: keys.privateKey });
    this.#rounds.set(roundKey, ticketId);
    return { binding, attestationB64: Buffer.from(attestation).toString("base64"), publicKeySpkiB64: Buffer.from(publicKey).toString("base64"), ...(recoveryB64 ? { recoveryB64 } : {}) };
  }
  async play(request: { ticketId: string; requestId: string; clientSeed: string; recoveryB64?: string }): Promise<GameProofResult> {
    const ticketId = text(request.ticketId, "ticketId");
    let ticket = this.#tickets.get(ticketId);
    if (!ticket && this.recovery && request.recoveryB64) {
      let restoring = this.#restoring.get(ticketId);
      if (!restoring) {
        restoring = this.#restoreTicket(ticketId, request.recoveryB64);
        this.#restoring.set(ticketId, restoring);
      }
      try { ticket = await restoring; } finally { this.#restoring.delete(ticketId); }
    }
    if (!ticket) throw new Error("Ticket unavailable; do not resubmit this round to another enclave");
    if (request.recoveryB64 && sha(request.recoveryB64) !== ticket.binding.recoverySha256) throw new Error("Recovery ticket mismatch");
    text(request.requestId, "requestId");
    if (!/^[a-f0-9]{64}$/.test(request.clientSeed)) throw new Error("Client seed must be 32 bytes generated after commitment verification");
    const hash = sha(canonicalJson({ ticketId: request.ticketId, requestId: request.requestId, clientSeed: request.clientSeed }));
    if (ticket.response) {
      if (ticket.requestHash !== hash) throw new Error("Ticket idempotency conflict");
      return ticket.response;
    }
    // Expiry controls NEW monetary acceptance in the browser/coordinator.
    // A sealed accepted wager remains executable after restart or a long outage.
    if (!ticket.binding.recoveryProtocol && this.clock() > Number(ticket.binding.expiresAt)) throw new Error("Ticket expired");
    ticket.requestHash = hash;
    ticket.response = this.#complete(ticket, request);
    return ticket.response;
  }
  async #restoreTicket(ticketId: string, recoveryB64: string): Promise<Ticket> {
    const recovered = await this.recovery!.open(recoveryB64);
    const binding = recovered.binding;
    if (binding?.ticketId !== ticketId || binding.releaseId !== this.policy.releaseId || binding.rulesHash !== this.policy.rulesHash ||
      binding.recoveryProtocol !== "sealed-ticket-v1" || !this.policy.enabledGameIds.includes(binding.gameId) ||
      typeof recovered.serverSeed !== "string" || !/^[a-f0-9]{64}$/.test(recovered.serverSeed) || commitmentFor(recovered.serverSeed) !== binding.serverSeedHash)
      throw new Error("Sealed ticket identity mismatch");
    const privateKey = await globalThis.crypto.subtle.importKey("pkcs8", Buffer.from(recovered.privateKeyB64, "base64"), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const ticket: Ticket = { binding: { ...binding, recoverySha256: sha(recoveryB64) }, serverSeed: recovered.serverSeed, privateKey };
    this.#tickets.set(ticketId, ticket);
    return ticket;
  }
  async #complete(ticket: Ticket, request: { requestId: string; clientSeed: string }): Promise<GameProofResult> {
    const gameId = String(ticket.binding.gameId);
    if (!isEnabledGameId(gameId)) throw new Error("Invalid game");
    const seed = ticket.serverSeed!;
    const action = String(ticket.binding.action);
    const wager = amount(ticket.binding.wagerMinor);
    const chargedWagerMinor = slotChargedWagerMinor(wager, gameId, action);
    const resolved = outcomeFor(seed, { gameId, clientSeed: request.clientSeed, nonce: 0, action });
    const multiplier = String(quantizeSettlementMultiplier(gameId, resolved.multiplier / slotActionCostMultiplier(gameId, action)));
    const payout = gameId === "baccarat" && action.startsWith("bets:v2:")
      ? baccaratPayoutMinor(resolved.outcome, chargedWagerMinor, "floor-minor-v1")
      : multiplyMinorByDecimal(chargedWagerMinor, multiplier);
    if (payout > this.policy.maximumPayoutMinor) throw new Error("Payout exceeds measured release exposure policy");
    const receipt = {
      ...ticket.binding, requestId: request.requestId, clientSeed: request.clientSeed,
      chargedWagerMinor: chargedWagerMinor.toString(), payoutMinor: payout.toString(), multiplier,
      // Outcome JSON is an opaque signed byte string; monetary values are kept
      // separately as integers. Do not canonicalize floats using the Dice JCS subset.
      outcomeJson: JSON.stringify(resolved.outcome), completedAt: this.clock()
    };
    const signature = await globalThis.crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, ticket.privateKey!, new TextEncoder().encode(canonicalJson(receipt))
    );
    const receiptSignatureB64 = Buffer.from(signature).toString("base64");
    delete ticket.privateKey; delete ticket.serverSeed;
    return { receipt, receiptSignatureB64, serverSeed: seed };
  }
}
