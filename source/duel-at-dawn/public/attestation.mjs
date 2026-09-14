// Browser-only pieces of Nitro attestation verification. These helpers verify
// the signed COSE document with its embedded leaf key; they deliberately do not
// build or trust an X.509 chain. The offline verifier owns the AWS-root check.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const INDEFINITE = Symbol("cbor-indefinite");
const BREAK = Symbol("cbor-break");

export class CborTag {
  constructor(tag, value) {
    this.tag = tag;
    this.value = value;
  }
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Expected bytes");
}

function concatBytes(parts) {
  const normalized = parts.map(asBytes);
  const output = new Uint8Array(normalized.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of normalized) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function cborHead(major, value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("CBOR length/integer is out of range");
  if (value < 24) return Uint8Array.of((major << 5) | value);
  if (value <= 0xff) return Uint8Array.of((major << 5) | 24, value);
  if (value <= 0xffff) {
    const output = new Uint8Array(3);
    output[0] = (major << 5) | 25;
    new DataView(output.buffer).setUint16(1, value);
    return output;
  }
  if (value <= 0xffffffff) {
    const output = new Uint8Array(5);
    output[0] = (major << 5) | 26;
    new DataView(output.buffer).setUint32(1, value);
    return output;
  }
  const output = new Uint8Array(9);
  output[0] = (major << 5) | 27;
  new DataView(output.buffer).setBigUint64(1, BigInt(value));
  return output;
}

function encodeValue(value) {
  if (value === null) return Uint8Array.of(0xf6);
  if (value === false) return Uint8Array.of(0xf4);
  if (value === true) return Uint8Array.of(0xf5);
  if (Number.isSafeInteger(value)) return cborHead(value >= 0 ? 0 : 1, value >= 0 ? value : -1 - value);
  if (value instanceof Uint8Array || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = asBytes(value);
    return concatBytes([cborHead(2, bytes.length), bytes]);
  }
  if (typeof value === "string") {
    const bytes = textEncoder.encode(value);
    return concatBytes([cborHead(3, bytes.length), bytes]);
  }
  if (Array.isArray(value)) return concatBytes([cborHead(4, value.length), ...value.map(encodeValue)]);
  if (value instanceof Map) {
    return concatBytes([
      cborHead(5, value.size),
      ...[...value].flatMap(([key, item]) => [encodeValue(key), encodeValue(item)])
    ]);
  }
  if (value instanceof CborTag) return concatBytes([cborHead(6, value.tag), encodeValue(value.value)]);
  throw new TypeError(`Unsupported CBOR value: ${typeof value}`);
}

export function encodeCbor(value) {
  return encodeValue(value);
}

class CborDecoder {
  constructor(input) {
    this.input = asBytes(input);
    this.view = new DataView(this.input.buffer, this.input.byteOffset, this.input.byteLength);
    this.offset = 0;
    this.items = 0;
  }

  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.input.length) {
      throw new Error("Truncated CBOR input");
    }
    const value = this.input.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  argument(additional) {
    if (additional < 24) return additional;
    if (additional === 24) return this.take(1)[0];
    if (additional === 25) {
      const offset = this.offset;
      this.take(2);
      return this.view.getUint16(offset);
    }
    if (additional === 26) {
      const offset = this.offset;
      this.take(4);
      return this.view.getUint32(offset);
    }
    if (additional === 27) {
      const offset = this.offset;
      this.take(8);
      const value = this.view.getBigUint64(offset);
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR integer exceeds the supported range");
      return Number(value);
    }
    if (additional === 31) return INDEFINITE;
    throw new Error("Reserved CBOR additional information");
  }

  value(depth = 0) {
    if (depth > 64) throw new Error("CBOR nesting is too deep");
    this.items += 1;
    if (this.items > 100000) throw new Error("CBOR contains too many items");

    const initial = this.take(1)[0];
    const major = initial >> 5;
    const additional = initial & 31;
    if (major === 7) {
      if (additional === 20) return false;
      if (additional === 21) return true;
      if (additional === 22) return null;
      if (additional === 31) return BREAK;
      throw new Error("Unsupported CBOR simple or floating-point value");
    }

    const argument = this.argument(additional);
    const indefinite = argument === INDEFINITE;
    if (major === 0) {
      if (indefinite) throw new Error("Invalid indefinite-length integer");
      return argument;
    }
    if (major === 1) {
      if (indefinite) throw new Error("Invalid indefinite-length integer");
      return -1 - argument;
    }
    // Real AWS Nitro attestation documents use indefinite-length CBOR containers
    // (additional-info 31, 0xff break); support them so in-browser verification
    // works on genuine documents, not just the definite-length mock.
    if (major === 2) {
      if (!indefinite) return this.take(argument);
      const chunks = [];
      for (;;) {
        const chunk = this.value(depth + 1);
        if (chunk === BREAK) break;
        if (!(chunk instanceof Uint8Array)) throw new Error("Indefinite byte string contains a non-byte chunk");
        chunks.push(chunk);
      }
      return concatBytes(chunks);
    }
    if (major === 3) {
      if (!indefinite) return textDecoder.decode(this.take(argument));
      let text = "";
      for (;;) {
        const chunk = this.value(depth + 1);
        if (chunk === BREAK) break;
        if (typeof chunk !== "string") throw new Error("Indefinite text string contains a non-text chunk");
        text += chunk;
      }
      return text;
    }
    if (major === 4) {
      if (!indefinite) return Array.from({ length: argument }, () => this.value(depth + 1));
      const array = [];
      for (;;) {
        const item = this.value(depth + 1);
        if (item === BREAK) break;
        array.push(item);
      }
      return array;
    }
    if (major === 5) {
      const map = new Map();
      if (!indefinite) {
        for (let index = 0; index < argument; index += 1) {
          const key = this.value(depth + 1);
          if (map.has(key)) throw new Error("Duplicate CBOR map key");
          map.set(key, this.value(depth + 1));
        }
        return map;
      }
      for (;;) {
        const key = this.value(depth + 1);
        if (key === BREAK) break;
        const item = this.value(depth + 1);
        if (item === BREAK) throw new Error("Indefinite map has a key without a value");
        if (map.has(key)) throw new Error("Duplicate CBOR map key");
        map.set(key, item);
      }
      return map;
    }
    if (major === 6) {
      if (indefinite) throw new Error("Invalid indefinite-length tag");
      return new CborTag(argument, this.value(depth + 1));
    }
    throw new Error(`Unsupported CBOR major type ${major}`);
  }
}

export function decodeCbor(input) {
  const decoder = new CborDecoder(input);
  const value = decoder.value();
  if (decoder.offset !== decoder.input.length) throw new Error("Trailing data after CBOR value");
  return value;
}

export function parseCoseSign1(input) {
  const decoded = decodeCbor(input);
  const value = decoded instanceof CborTag
    ? (decoded.tag === 18 ? decoded.value : (() => { throw new Error(`Unexpected COSE tag ${decoded.tag}`); })())
    : decoded;
  if (!Array.isArray(value) || value.length !== 4) throw new Error("COSE_Sign1 must be an array of four items");
  const [protectedBytes, unprotected, payload, signature] = value;
  if (!(protectedBytes instanceof Uint8Array)) throw new Error("COSE protected header must be bytes");
  if (!(unprotected instanceof Map)) throw new Error("COSE unprotected header must be a map");
  if (!(payload instanceof Uint8Array)) throw new Error("COSE payload must be bytes");
  if (!(signature instanceof Uint8Array) || signature.length !== 96) {
    throw new Error("COSE ES384 signature must be 96 bytes");
  }
  const protectedHeader = decodeCbor(protectedBytes);
  if (!(protectedHeader instanceof Map) || protectedHeader.get(1) !== -35) {
    throw new Error("COSE protected algorithm is not ES384 (-35)");
  }
  return { protectedBytes, protectedHeader, unprotected, payload, signature };
}

export function buildSignatureStructure(protectedBytes, payload) {
  return encodeCbor(["Signature1", asBytes(protectedBytes), new Uint8Array(), asBytes(payload)]);
}

function derElement(input, offset) {
  const bytes = asBytes(input);
  const start = offset;
  if (!Number.isInteger(offset) || offset < 0 || offset + 2 > bytes.length) throw new Error("Truncated DER element");
  const tag = bytes[offset++];
  let length = bytes[offset++];
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || offset + count > bytes.length) throw new Error("Invalid DER length");
    length = 0;
    for (let index = 0; index < count; index += 1) length = (length * 256) + bytes[offset++];
  }
  const contentStart = offset;
  const end = contentStart + length;
  if (end > bytes.length) throw new Error("Truncated DER content");
  return { tag, start, contentStart, end };
}

function oidString(input, element) {
  if (element.tag !== 0x06 || element.contentStart === element.end) throw new Error("Invalid DER object identifier");
  const bytes = asBytes(input).subarray(element.contentStart, element.end);
  const nodes = [Math.min(2, Math.floor(bytes[0] / 40)), 0];
  nodes[1] = bytes[0] - (nodes[0] * 40);
  let value = 0;
  for (const byte of bytes.subarray(1)) {
    value = (value * 128) + (byte & 0x7f);
    if (!(byte & 0x80)) {
      nodes.push(value);
      value = 0;
    }
  }
  if (value !== 0 || (bytes.at(-1) & 0x80)) throw new Error("Truncated DER object identifier");
  return nodes.join(".");
}

export function extractSubjectPublicKeyInfo(certificateDer) {
  const bytes = asBytes(certificateDer);
  const certificate = derElement(bytes, 0);
  if (certificate.tag !== 0x30 || certificate.end !== bytes.length) throw new Error("Certificate must be one DER sequence");
  const tbs = derElement(bytes, certificate.contentStart);
  if (tbs.tag !== 0x30) throw new Error("Certificate TBSCertificate is invalid");
  let offset = tbs.contentStart;
  let field = derElement(bytes, offset);
  if (field.tag === 0xa0) {
    offset = field.end;
    field = derElement(bytes, offset);
  }
  // serialNumber, signature, issuer, validity, subject precede subjectPublicKeyInfo.
  for (let index = 0; index < 5; index += 1) {
    offset = field.end;
    field = derElement(bytes, offset);
  }
  const spki = field;
  if (spki.tag !== 0x30 || spki.end > tbs.end) throw new Error("Certificate subjectPublicKeyInfo is invalid");

  const algorithm = derElement(bytes, spki.contentStart);
  if (algorithm.tag !== 0x30) throw new Error("Certificate public-key algorithm is invalid");
  const keyAlgorithm = derElement(bytes, algorithm.contentStart);
  const namedCurve = derElement(bytes, keyAlgorithm.end);
  if (oidString(bytes, keyAlgorithm) !== "1.2.840.10045.2.1" || oidString(bytes, namedCurve) !== "1.3.132.0.34") {
    throw new Error("Attestation leaf key is not ECDSA P-384");
  }
  return bytes.slice(spki.start, spki.end);
}

function requireBytes(value, name) {
  if (!(value instanceof Uint8Array)) throw new Error(`Attestation ${name} must be bytes`);
  return value;
}

export function decodeAttestation(input) {
  const cose = parseCoseSign1(input);
  const payload = decodeCbor(cose.payload);
  if (!(payload instanceof Map)) throw new Error("Attestation payload must be a map");
  const pcrs = payload.get("pcrs");
  const cabundle = payload.get("cabundle");
  if (!(pcrs instanceof Map)) throw new Error("Attestation pcrs must be a map");
  if (!Array.isArray(cabundle) || cabundle.some((certificate) => !(certificate instanceof Uint8Array))) {
    throw new Error("Attestation cabundle must be an array of certificates");
  }
  const document = {
    moduleId: payload.get("module_id"),
    timestamp: payload.get("timestamp"),
    digest: payload.get("digest"),
    pcrs,
    certificate: requireBytes(payload.get("certificate"), "certificate"),
    cabundle,
    publicKey: payload.get("public_key"),
    userData: requireBytes(payload.get("user_data"), "user_data"),
    nonce: payload.get("nonce")
  };
  if (typeof document.moduleId !== "string") throw new Error("Attestation module_id must be text");
  if (!Number.isSafeInteger(document.timestamp) || document.timestamp < 0) throw new Error("Attestation timestamp must be an integer");
  if (document.digest !== "SHA384") throw new Error("Attestation digest is not SHA384");
  if (document.publicKey !== null && !(document.publicKey instanceof Uint8Array)) {
    throw new Error("Attestation public_key must be bytes or null");
  }
  return { cose, payload, document };
}

export async function verifyLeafSignature(parsedAttestation, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("SubtleCrypto is unavailable");
  const { cose, document } = parsedAttestation.cose ? parsedAttestation : decodeAttestation(parsedAttestation);
  const spki = extractSubjectPublicKeyInfo(document.certificate);
  const key = await subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-384" }, false, ["verify"]);
  return subtle.verify(
    { name: "ECDSA", hash: "SHA-384" },
    key,
    cose.signature,
    buildSignatureStructure(cose.protectedBytes, cose.payload)
  );
}

export function bytesToHex(input) {
  return Array.from(asBytes(input), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bytesFromBase64(value) {
  if (typeof value !== "string") throw new TypeError("Attestation must be base64 text");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
