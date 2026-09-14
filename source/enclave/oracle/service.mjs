import { NsmAttestor } from "./attestor.mjs";
import { DiceProofOracle } from "./dice-proof-oracle.mjs";
import { FairnessOracle } from "./oracle.mjs";
import { LocalSocketTransport } from "../vsock-proxy/transport.mjs";

// Production oracle process inside the enclave. The Rust helper services
// /dev/nsm ioctls and entrypoint.sh exposes this Unix socket over AF_VSOCK.
const attestor = new NsmAttestor();
const oracle = new FairnessOracle({ attestor });
const diceProofOracle = new DiceProofOracle({ attestor });
const transport = new LocalSocketTransport({
  socketPath: process.env.ORACLE_SOCKET || "/tmp/replicate-games-oracle.sock",
  oracle,
  diceProofOracle
});

await transport.start({ allowInProcessFallback: false });
console.log("Fairness oracle is listening for the enclave vsock bridge");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await transport.close();
    process.exit(0);
  });
}
