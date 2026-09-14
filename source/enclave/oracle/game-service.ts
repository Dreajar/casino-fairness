import { NsmAttestor } from "./attestor.mjs";
import { randomBytes } from "node:crypto";
import { GameProofOracle } from "./game-proof-oracle.ts";
import { ProgressiveProofOracle } from "./progressive-proof-oracle.ts";
import { isEnclaveProgressiveGameId as isProgressiveGameId } from "./progressive-kernels.ts";
import { LocalSocketTransport } from "../vsock-proxy/transport.mjs";
import { KmsRecipientKeys } from "./kms-recipient.mjs";
import { SealedTicketCodec } from "./sealed-ticket.mjs";

// Replaced by the build tool and covered by the EIF measurement. No environment
// variables or RPCs can supply the release policy or switch to mock attestation.
declare const MEASURED_GAME_POLICY: {
  releaseId: string; rulesHash: string; enabledGameIds: string[];
  maximumWagerMinor: string; maximumPayoutMinor: string;
  recoveryKeyArn?: string;
};
const policy = MEASURED_GAME_POLICY;
const measured = {
  ...policy,
  maximumWagerMinor: BigInt(policy.maximumWagerMinor),
  maximumPayoutMinor: BigInt(policy.maximumPayoutMinor)
};
const singleGames = policy.enabledGameIds.filter((id) => !isProgressiveGameId(id));
const progressiveGames = policy.enabledGameIds.filter(isProgressiveGameId);
const attestor = new NsmAttestor();
const recovery = policy.recoveryKeyArn ? new SealedTicketCodec({
  keyAccess: new KmsRecipientKeys({ attestor,
    transport: new LocalSocketTransport({ socketPath: "/tmp/casino-recovery.sock", timeoutMs: 65000 }),
    keyArn: policy.recoveryKeyArn, releaseId: policy.releaseId }),
  releaseId: policy.releaseId, rulesHash: policy.rulesHash
}) : undefined;
// Both protocols belong to the same enclave boot and gateway route.
const bootId = randomBytes(16).toString("hex");
const oracle = singleGames.length ? new GameProofOracle(attestor, { ...measured, enabledGameIds: singleGames }, Date.now, recovery, bootId) : undefined;
const progressive = progressiveGames.length ? new ProgressiveProofOracle(attestor, { ...measured, enabledGameIds: progressiveGames }, Date.now, recovery, bootId) : undefined;
const transport = new LocalSocketTransport({
  socketPath: "/tmp/replicate-games-oracle.sock", gameProofOracle: oracle, progressiveProofOracle: progressive
});
await transport.start({ allowInProcessFallback: false });
console.log("Measured game oracle listening");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await transport.close();
    process.exit(0);
  });
}
