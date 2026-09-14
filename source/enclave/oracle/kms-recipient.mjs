import { generateKeyPairSync, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** AWS KMS returns CMS encrypted to a fresh attested RSA key. Plaintext data
 * keys never cross the vsock connection or appear in command-line arguments. */
export class KmsRecipientKeys {
  constructor({ attestor, transport, keyArn, releaseId }) {
    this.attestor = attestor; this.transport = transport; this.keyArn = keyArn; this.releaseId = releaseId;
  }
  async call(action, ciphertext) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const document = await this.attestor.attest({
      publicKey: publicKey.export({ type: "spki", format: "der" }), nonce: null,
      userData: createHash("sha256").update(`${this.keyArn}:${this.releaseId}`).digest()
    });
    const response = await this.transport.request(action, { keyArn: this.keyArn, releaseId: this.releaseId,
      attestationB64: Buffer.from(document).toString("base64"), ...(ciphertext ? { ciphertext } : {}) });
    if (response.Plaintext || typeof response.CiphertextForRecipient !== "string") throw new Error("KMS did not return an attestation-protected key");
    const directory = mkdtempSync(join(tmpdir(), "casino-recipient-"));
    try {
      const keyPath = join(directory, "recipient.pem");
      writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
      const plaintext = execFileSync("openssl", ["cms", "-decrypt", "-inform", "DER", "-inkey", keyPath], {
        input: Buffer.from(response.CiphertextForRecipient, "base64"), stdio: ["pipe", "pipe", "pipe"], maxBuffer: 4096
      });
      if (plaintext.length !== 32) { plaintext.fill(0); throw new Error("Invalid decrypted recovery key"); }
      return { plaintext, wrappedKey: response.CiphertextBlob ?? ciphertext };
    } catch { throw new Error("Attested recovery key decryption failed"); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
  generate() { return this.call("kms-generate"); }
  async decrypt(ciphertext) { return (await this.call("kms-decrypt", ciphertext)).plaintext; }
}
