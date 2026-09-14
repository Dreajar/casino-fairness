import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { canonicalJson } from "../../packages/dice-proof/src/index.mjs";

/** keyAccess must unwrap only inside the measured enclave. The parent and
 * database receive authenticated ciphertext plus the KMS-wrapped data key. */
export class SealedTicketCodec {
  constructor({ keyAccess, releaseId, rulesHash }) {
    this.keyAccess = keyAccess;
    this.aad = Buffer.from(canonicalJson({ protocol: "casino-sealed-ticket-v1", releaseId, rulesHash }));
  }
  async seal(value) {
    const { plaintext, wrappedKey } = await this.keyAccess.generate();
    try {
      if (plaintext.length !== 32) throw new Error("Invalid recovery data key");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", plaintext, iv);
      cipher.setAAD(this.aad);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
      return Buffer.from(JSON.stringify({ version: 1, wrappedKey, iv: iv.toString("base64"),
        ciphertext: encrypted.toString("base64"), tag: cipher.getAuthTag().toString("base64") })).toString("base64");
    } finally { plaintext.fill(0); }
  }
  async open(encoded) {
    if (typeof encoded !== "string" || encoded.length > 65536) throw new Error("Invalid sealed ticket");
    const record = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (record.version !== 1 || typeof record.wrappedKey !== "string") throw new Error("Unknown sealed ticket version");
    const plaintext = await this.keyAccess.decrypt(record.wrappedKey);
    try {
      const iv = Buffer.from(record.iv, "base64"), tag = Buffer.from(record.tag, "base64");
      if (plaintext.length !== 32 || iv.length !== 12 || tag.length !== 16) throw new Error("Invalid recovery cipher parameters");
      const cipher = createDecipheriv("aes-256-gcm", plaintext, iv);
      cipher.setAAD(this.aad); cipher.setAuthTag(tag);
      const bytes = Buffer.concat([cipher.update(Buffer.from(record.ciphertext, "base64")), cipher.final()]);
      try { return JSON.parse(bytes.toString("utf8")); } finally { bytes.fill(0); }
    } finally { plaintext.fill(0); }
  }
}
