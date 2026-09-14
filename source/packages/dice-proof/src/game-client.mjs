import { verifyGameTicket, verifyGameReceipt } from "./game-attestation.mjs";
import { canonicalJson, bytesToBase64 } from "./index.mjs";
import {
  isEnabledGameId, verify, quantizeSettlementMultiplier, slotActionCostMultiplier,
  slotChargedWagerMinor
} from "../../fairness-core/src/index.ts";

/** Independent deterministic replay, in addition to the receipt signature.
 * Integer payment verification belongs to verifyGameReceipt; the legacy replay
 * API's half-up dollar calculation must not be used for Nitro settlement. */
export function replayGameReceipt(result) {
  try {
    const { receipt, serverSeed } = result;
    if (!isEnabledGameId(receipt.gameId)) throw new Error("Unknown game");
    const replay = verify({
      serverSeed, serverSeedHash: receipt.serverSeedHash, gameId: receipt.gameId,
      clientSeed: receipt.clientSeed, nonce: 0, action: receipt.action,
      expectedOutcome: JSON.parse(receipt.outcomeJson)
    });
    if (!replay.commitmentValid || !replay.outcomeMatches) throw new Error("Game replay mismatch");
    const multiplier = quantizeSettlementMultiplier(receipt.gameId,
      replay.computed.multiplier / slotActionCostMultiplier(receipt.gameId, receipt.action));
    if (String(multiplier) !== receipt.multiplier) throw new Error("Replayed multiplier mismatch");
    if (slotChargedWagerMinor(BigInt(receipt.wagerMinor), receipt.gameId, receipt.action).toString() !== receipt.chargedWagerMinor)
      throw new Error("Replayed charge mismatch");
    return { ok: true };
  } catch (error) { return { ok: false, reason: error.message }; }
}

function units(value, precision) {
  if (typeof value !== "string" || !new RegExp(`^(0|[1-9][0-9]*)(?:\\.[0-9]{1,${precision}})?$`).test(value)) throw new Error("Invalid settlement decimal");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, "0"));
}
const sortedJson = value => JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child)
  ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);

export function verifyGameSettlement(settlement, result) {
  const r = result.receipt;
  for (const [key, expected] of Object.entries({ requestId: r.requestId, roundId: r.roundId,
    gameId: r.gameId, clubId: r.clubRef, action: r.action, serverSeedHash: r.serverSeedHash,
    proofProtocol: "casino-game-proof-v1", payoutRounding: "floor-minor-v1" })) {
    if (settlement[key] !== expected) throw new Error(`Settlement mismatch: ${key}`);
  }
  if (units(settlement.wager, 8) !== BigInt(r.chargedWagerMinor) || units(settlement.payout, 8) !== BigInt(r.payoutMinor)
    || units(settlement.multiplier, 4) !== units(r.multiplier, 4)
    || sortedJson(settlement.outcome) !== sortedJson(JSON.parse(r.outcomeJson))) throw new Error("Settlement differs from verified result");
}

/** Browser-side handshake. The trust policy is compiled/independently pinned,
 * never obtained from requestTicket. Storage must finish before submitWager;
 * failures retain the exact ticket and client seed for recovery, not a reroll. */
export class VerifiedGameClient {
  constructor({ policy, rootCertPem, requestTicket, submitWager, savePrepared, allowMockForTests = false }) {
    if (policy.mode !== "aws" && !allowMockForTests) throw new Error("AWS trust policy required");
    this.policy = Object.freeze({ ...policy, enabledGameIds: Object.freeze([...policy.enabledGameIds]), pcrs: Object.freeze({ ...policy.pcrs }) });
    this.rootCertPem = rootCertPem;
    this.requestTicket = requestTicket;
    this.submitWager = submitWager;
    this.savePrepared = savePrepared;
    this.allowMockForTests = allowMockForTests;
    this.prepared = new WeakSet();
  }

  async prepare(identity, requestId = identity.roundId) {
    if (typeof requestId !== "string" || !requestId || requestId.length > 128) throw new Error("Invalid wager request ID");
    const request = Object.freeze({ ...identity, challengeB64: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))) });
    const ticket = structuredClone(await this.requestTicket(request));
    const checked = await verifyGameTicket({ ticket, expectedRequest: request, challengeB64: request.challengeB64,
      policy: this.policy, rootCertPem: this.rootCertPem, allowMock: this.allowMockForTests });
    if (!checked.ok) throw new Error(`Ticket rejected: ${checked.reason}`);
    // The client's unpredictable contribution exists only AFTER verification.
    const clientSeed = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    const prepared = Object.freeze({ request, ticket: Object.freeze({ ...ticket, binding: Object.freeze(ticket.binding) }),
      play: Object.freeze({ ticketId: ticket.binding.ticketId, requestId, clientSeed }) });
    await this.savePrepared(prepared);
    this.prepared.add(prepared);
    return prepared;
  }

  async restore(saved) {
    const prepared = structuredClone(saved);
    const { request, ticket, play } = prepared;
    const checked = await verifyGameTicket({ ticket, expectedRequest: request, challengeB64: request.challengeB64,
      policy: this.policy, rootCertPem: this.rootCertPem, allowMock: this.allowMockForTests,
      now: Number(ticket.binding.issuedAt) });
    if (!checked.ok || play.ticketId !== ticket.binding.ticketId || typeof play.requestId !== "string" || !play.requestId || play.requestId.length > 128 || !/^[a-f0-9]{64}$/.test(play.clientSeed))
      throw new Error("Invalid saved wager");
    Object.freeze(request); Object.freeze(ticket.binding); Object.freeze(ticket); Object.freeze(play); Object.freeze(prepared);
    this.prepared.add(prepared);
    return prepared;
  }

  async play(prepared) {
    if (!this.prepared.has(prepared)) throw new Error("Prepare or restore the wager before submitting it");
    const response = await this.submitWager(prepared);
    const checked = await verifyGameReceipt({ ticket: prepared.ticket, result: response.result, request: prepared.play, policy: this.policy });
    if (!checked.ok) throw new Error(`Receipt rejected: ${checked.reason}`);
    const replay = replayGameReceipt(response.result);
    if (!replay.ok) throw new Error(`Receipt rejected: ${replay.reason}`);
    if (response.settlement) verifyGameSettlement(response.settlement, response.result);
    if (response.ticket && canonicalJson(response.ticket.binding) !== canonicalJson(prepared.ticket.binding)) throw new Error("Response substituted another ticket");
    return response;
  }
}
