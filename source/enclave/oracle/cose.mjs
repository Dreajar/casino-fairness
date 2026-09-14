import { sign } from "node:crypto";

import { CborTag, decode, encode } from "./cbor.mjs";

export const COSE_ALGORITHM_ES384 = -35;

export function signatureStructure(protectedBytes, payload) {
  return encode(["Signature1", protectedBytes, Buffer.alloc(0), payload]);
}

export function buildCoseSign1(payload, privateKey, { tagged = false } = {}) {
  const payloadBytes = Buffer.from(payload);
  const protectedBytes = encode(new Map([[1, COSE_ALGORITHM_ES384]]));
  const toSign = signatureStructure(protectedBytes, payloadBytes);
  const signature = sign("sha384", toSign, { key: privateKey, dsaEncoding: "ieee-p1363" });
  const value = [protectedBytes, new Map(), payloadBytes, signature];
  return encode(tagged ? new CborTag(18, value) : value);
}

export function parseCoseSign1(input) {
  const decoded = decode(input);
  const value = decoded instanceof CborTag
    ? (decoded.tag === 18 ? decoded.value : (() => { throw new Error(`Unexpected COSE tag ${decoded.tag}`); })())
    : decoded;
  if (!Array.isArray(value) || value.length !== 4) throw new Error("COSE_Sign1 must be an array of four items");
  const [protectedBytes, unprotected, payload, signature] = value;
  if (!Buffer.isBuffer(protectedBytes)) throw new Error("COSE protected header must be bytes");
  if (!(unprotected instanceof Map)) throw new Error("COSE unprotected header must be a map");
  if (!Buffer.isBuffer(payload)) throw new Error("COSE payload must be bytes");
  if (!Buffer.isBuffer(signature) || signature.length !== 96) throw new Error("COSE ES384 signature must be 96 bytes");
  const protectedHeader = decode(protectedBytes);
  if (!(protectedHeader instanceof Map) || protectedHeader.get(1) !== COSE_ALGORITHM_ES384) {
    throw new Error("COSE protected algorithm is not ES384 (-35)");
  }
  return { protectedBytes, protectedHeader, unprotected, payload, signature };
}
