#!/usr/bin/env node
/**
 * Offline catalogue verifier. This imports the published repository engine source;
 * its trust boundary is therefore this checkout plus Node's built-in crypto, not an
 * independently implemented engine. The protocol spec and golden vectors support a
 * separate implementation that does not share this code.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  isEnabledGameId,
  odinsVaultCostMultiplierForAction,
  quantizeSettlementMultiplier,
  verify
} from "../packages/fairness-core/src/index.ts";

const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const finiteNumber = (value) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

function roundsFrom(value) {
  if (Array.isArray(value)) return value;
  if (record(value) && Array.isArray(value.rounds)) return value.rounds;
  return [value];
}

function printChecks(index, id, checks) {
  console.log(`Round ${index + 1}${id ? ` (${id})` : ""}`);
  for (const [name, passed] of Object.entries(checks)) console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
}

export function verifyFairnessExport(value, { print = false } = {}) {
  const results = roundsFrom(value).map((candidate, index) => {
    const schemaValid =
      record(candidate) &&
      typeof candidate.gameId === "string" &&
      isEnabledGameId(candidate.gameId) &&
      typeof candidate.clientSeed === "string" &&
      Number.isSafeInteger(candidate.nonce) &&
      candidate.nonce >= 0 &&
      typeof candidate.action === "string" &&
      record(candidate.outcome) &&
      typeof candidate.serverSeedHash === "string";
    const wager = record(candidate) ? finiteNumber(candidate.wager) : undefined;
    const payout = record(candidate) ? finiteNumber(candidate.payout) : undefined;
    const multiplier = record(candidate) ? finiteNumber(candidate.multiplier) : undefined;
    const revealed = record(candidate) ? candidate.revealedServerSeed : undefined;
    let checks = {
      schema: schemaValid && wager !== undefined && payout !== undefined && multiplier !== undefined,
      "serverSeed.revealed": typeof revealed === "string" && revealed.length > 0,
      commitment: false,
      outcome: false,
      multiplier: false,
      payout: false
    };
    if (checks.schema && checks["serverSeed.revealed"] && record(candidate) && typeof revealed === "string") {
      const result = verify({
        serverSeed: revealed,
        serverSeedHash: candidate.serverSeedHash,
        gameId: candidate.gameId,
        clientSeed: candidate.clientSeed,
        nonce: candidate.nonce,
        action: candidate.action,
        ...(typeof candidate.fairnessAction === "string" ? { fairnessAction: candidate.fairnessAction } : {}),
        expectedOutcome: candidate.outcome,
        expectedMultiplier: multiplier,
        wager,
        expectedPayout: payout
      });
      const costMultiplier =
        candidate.gameId === "odins-vault" ? odinsVaultCostMultiplierForAction(candidate.action) : 1;
      const computedMultiplier = quantizeSettlementMultiplier(
        candidate.gameId,
        result.computed.multiplier / costMultiplier
      );
      const computedPayout = Math.round(wager * computedMultiplier * 100) / 100;
      checks = {
        ...checks,
        commitment: result.commitmentValid,
        outcome: result.outcomeMatches === true,
        multiplier: multiplier === computedMultiplier,
        payout: payout === computedPayout
      };
    }
    const id = record(candidate) && typeof candidate.id === "string" ? candidate.id : "";
    if (print) printChecks(index, id, checks);
    return { id, ok: Object.values(checks).every(Boolean), checks };
  });
  return { ok: results.length > 0 && results.every((result) => result.ok), rounds: results };
}

function usage() {
  return "Usage: node verifier/verify-fairness.mjs <round-or-history.json>";
}

function main(argv) {
  const inputPath = argv[0];
  if (!inputPath) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  try {
    const value = JSON.parse(readFileSync(inputPath, "utf8"));
    const result = verifyFairnessExport(value, { print: true });
    console.log(`\n${result.ok ? "VERIFIED" : "REJECTED"}: ${result.rounds.length} round${result.rounds.length === 1 ? "" : "s"}`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error("REJECTED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
