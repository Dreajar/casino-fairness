#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { verifyGameTicket, verifyGameReceipt } from "../packages/dice-proof/src/game-attestation.mjs";
import { verifyProgressiveTicket, verifyProgressiveTranscript } from "../packages/dice-proof/src/progressive-attestation.mjs";
import { replayGameReceipt } from "../packages/dice-proof/src/game-client.mjs";

/** Archived proofs only: do not use this to authorize a new wager. The policy
 * must come from a separately trusted release, never from the proof itself. */
export async function verifyNitroArchive(archive, policy, rootCertPem) {
  const rounds = Array.isArray(archive?.rounds) ? archive.rounds : [archive];
  if (!rounds.length) throw new Error("No rounds supplied");
  const results = [];
  for (const round of rounds) {
    try {
      const { ticket, request } = round;
      if (!request || !ticket || !Number.isSafeInteger(ticket.binding?.issuedAt)) throw new Error("Missing ticket or original request");
      const progressive = ticket.binding.protocolVersion === "casino-progressive-proof-v1";
      const checked = await (progressive ? verifyProgressiveTicket : verifyGameTicket)({
        ticket, expectedRequest: request, challengeB64: request.challengeB64, policy, rootCertPem,
        now: ticket.binding.issuedAt
      });
      if (!checked.ok || !checked.trustedHardware) throw new Error(checked.reason ?? "AWS attestation failed");
      if (progressive) {
        const history = round.completedHistory;
        if (!Array.isArray(history) || !history.length) throw new Error("Complete progressive transcript required");
        const replay = await verifyProgressiveTranscript({ ticket, commands: history.map(row => row.command), results: history.map(row => row.result), policy });
        if (!replay.ok || !replay.terminal) throw new Error(replay.reason ?? "Progressive round is not complete");
      } else {
        const result = round.result ?? round.first;
        if (!result || !round.command) throw new Error("Completed receipt and play command required");
        const receipt = await verifyGameReceipt({ ticket, result, request: round.command, policy });
        if (!receipt.ok) throw new Error(receipt.reason ?? "Receipt failed");
        const replay = replayGameReceipt(result);
        if (!replay.ok) throw new Error(replay.reason ?? "Outcome replay failed");
      }
      results.push({ gameId: request.gameId, ok: true });
    } catch (error) {
      results.push({ gameId: round?.request?.gameId ?? "unknown", ok: false, reason: error.message });
    }
  }
  return { ok: results.every(row => row.ok), rounds: results };
}

async function main() {
  const [proofPath, policyPath] = process.argv.slice(2);
  if (!proofPath || !policyPath) throw new Error("Usage: node verify-nitro.mjs <proof.json> <trusted-policy.json>");
  const archive = JSON.parse(readFileSync(proofPath, "utf8"));
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const rootCertPem = readFileSync(fileURLToPath(new URL("./aws-nitro-root-g1.pem", import.meta.url)), "utf8");
  const result = await verifyNitroArchive(archive, policy, rootCertPem);
  for (const round of result.rounds) console.log(`${round.ok ? "PASS" : "FAIL"}  ${round.gameId}${round.reason ? `: ${round.reason}` : ""}`);
  console.log(`${result.ok ? "VERIFIED" : "REJECTED"}: ${result.rounds.length} archived Nitro round(s). This is not a live service health check.`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => { console.error(`REJECTED: ${error.message}`); process.exitCode = 1; });
}
