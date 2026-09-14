// Minimal CBOR for the Nitro attestation and COSE_Sign1 shapes.
// Supported: integers, byte/text strings, arrays, maps, tags, booleans, and null.
// Decoding also accepts indefinite-length byte/text strings, arrays, and maps
// (major-type additional-info 31, terminated by the 0xff break), because real
// AWS Nitro attestation documents encode some containers that way even though
// our encoder only ever emits the canonical definite-length form.

const INDEFINITE = Symbol("cbor-indefinite");
const BREAK = Symbol("cbor-break");

export class CborTag {
  constructor(tag, value) {
    this.tag = tag;
    this.value = value;
  }
}

function head(major, value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("CBOR length/integer is out of range");
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value <= 0xff) return Buffer.from([(major << 5) | 24, value]);
  if (value <= 0xffff) {
    const output = Buffer.allocUnsafe(3);
    output[0] = (major << 5) | 25;
    output.writeUInt16BE(value, 1);
    return output;
  }
  if (value <= 0xffffffff) {
    const output = Buffer.allocUnsafe(5);
    output[0] = (major << 5) | 26;
    output.writeUInt32BE(value, 1);
    return output;
  }
  const output = Buffer.allocUnsafe(9);
  output[0] = (major << 5) | 27;
  output.writeBigUInt64BE(BigInt(value), 1);
  return output;
}

function encodeValue(value) {
  if (value === null) return Buffer.from([0xf6]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);

  if (Number.isSafeInteger(value)) {
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (typeof value === "bigint") {
    const unsigned = value >= 0n ? value : -1n - value;
    if (unsigned > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError("CBOR bigint exceeds the supported range");
    return value >= 0n ? head(0, Number(unsigned)) : head(1, Number(unsigned));
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([head(2, bytes.length), bytes]);
  }
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([head(4, value.length), ...value.map(encodeValue)]);
  }
  if (value instanceof Map) {
    const entries = [...value.entries()];
    return Buffer.concat([
      head(5, entries.length),
      ...entries.flatMap(([key, item]) => [encodeValue(key), encodeValue(item)])
    ]);
  }
  if (value instanceof CborTag) {
    return Buffer.concat([head(6, value.tag), encodeValue(value.value)]);
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return encodeValue(new Map(Object.entries(value)));
  }
  throw new TypeError(`Unsupported CBOR value: ${typeof value}`);
}

export function encode(value) {
  return encodeValue(value);
}

class Decoder {
  constructor(input) {
    this.input = Buffer.from(input);
    this.offset = 0;
    this.items = 0;
  }

  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.input.length) {
      throw new Error("Truncated CBOR input");
    }
    const value = this.input.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  argument(additional) {
    if (additional < 24) return additional;
    if (additional === 24) return this.take(1)[0];
    if (additional === 25) return this.take(2).readUInt16BE(0);
    if (additional === 26) return this.take(4).readUInt32BE(0);
    if (additional === 27) {
      const value = this.take(8).readBigUInt64BE(0);
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
    if (major === 2) {
      if (!indefinite) return Buffer.from(this.take(argument));
      const chunks = [];
      for (;;) {
        const chunk = this.value(depth + 1);
        if (chunk === BREAK) break;
        if (!Buffer.isBuffer(chunk)) throw new Error("Indefinite byte string contains a non-byte chunk");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    if (major === 3) {
      if (!indefinite) return this.take(argument).toString("utf8");
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

export function decode(input) {
  const decoder = new Decoder(input);
  const value = decoder.value();
  if (decoder.offset !== decoder.input.length) throw new Error("Trailing data after CBOR value");
  return value;
}
