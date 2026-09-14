import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalSocketTransport } from "./transport.mjs";

class RecoveryRpc extends LocalSocketTransport {
  async dispatch(action, params) {
    if (!["kms-generate", "kms-decrypt"].includes(action) || params.keyArn !== process.env.RECOVERY_KEY_ARN ||
      typeof params.attestationB64 !== "string" || params.attestationB64.length > 40000 ||
      !/^[a-zA-Z0-9._-]{1,128}$/.test(params.releaseId)) throw new Error("Invalid recovery request");
    const directory = mkdtempSync(join(tmpdir(), "casino-kms-request-"));
    try {
      const request = { KeyId: process.env.RECOVERY_KEY_ARN,
        EncryptionContext: { Application: "casino-fairness", ReleaseId: params.releaseId },
        Recipient: { KeyEncryptionAlgorithm: "RSAES_OAEP_SHA_256", AttestationDocument: params.attestationB64 },
        ...(action === "kms-generate" ? { KeySpec: "AES_256" } : { CiphertextBlob: params.ciphertext }) };
      const path = join(directory, "request.json");
      writeFileSync(path, JSON.stringify(request), { mode: 0o600 });
      const result = JSON.parse(execFileSync("aws", ["kms", action === "kms-generate" ? "generate-data-key" : "decrypt",
        "--cli-input-json", `file://${path}`, "--region", process.env.AWS_REGION || "us-east-2", "--output", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000, maxBuffer: 1024 * 1024 }));
      if (result.Plaintext || !result.CiphertextForRecipient) throw new Error("KMS returned an unprotected key");
      return { CiphertextForRecipient: result.CiphertextForRecipient, ...(result.CiphertextBlob ? { CiphertextBlob: result.CiphertextBlob } : {}) };
    } catch { throw new Error("Attested KMS operation failed"); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
}
if (!process.env.RECOVERY_KEY_ARN) throw new Error("RECOVERY_KEY_ARN is required");
const rpc = new RecoveryRpc({ socketPath: "/run/casino-fairness/recovery.sock", oracle: {}, timeoutMs: 65000 });
await rpc.start({ allowInProcessFallback: false });
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => rpc.close());
