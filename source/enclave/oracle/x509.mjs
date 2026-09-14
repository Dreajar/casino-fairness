import { sign } from "node:crypto";

function lengthBytes(length) {
  if (length < 128) return Buffer.from([length]);
  const bytes = [];
  for (let value = length; value > 0; value >>>= 8) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag, ...parts) {
  const body = Buffer.concat(parts.map((part) => Buffer.from(part)));
  return Buffer.concat([Buffer.from([tag]), lengthBytes(body.length), body]);
}

const sequence = (...parts) => der(0x30, ...parts);
const set = (...parts) => der(0x31, ...parts);
const octetString = (value) => der(0x04, value);
const utf8String = (value) => der(0x0c, Buffer.from(value, "utf8"));
const bool = (value) => der(0x01, Buffer.from([value ? 0xff : 0x00]));
const bitString = (value, unused = 0) => der(0x03, Buffer.from([unused]), value);

function integer(value) {
  let bytes;
  if (Buffer.isBuffer(value)) bytes = Buffer.from(value);
  else {
    let hex = BigInt(value).toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    bytes = Buffer.from(hex, "hex");
  }
  while (bytes.length > 1 && bytes[0] === 0 && (bytes[1] & 0x80) === 0) bytes = bytes.subarray(1);
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return der(0x02, bytes);
}

function oid(value) {
  const nodes = value.split(".").map(Number);
  const bytes = [nodes[0] * 40 + nodes[1]];
  for (const node of nodes.slice(2)) {
    const encoded = [node & 0x7f];
    for (let remaining = Math.floor(node / 128); remaining > 0; remaining = Math.floor(remaining / 128)) {
      encoded.unshift(0x80 | (remaining & 0x7f));
    }
    bytes.push(...encoded);
  }
  return der(0x06, Buffer.from(bytes));
}

function name(commonName) {
  return sequence(set(sequence(oid("2.5.4.3"), utf8String(commonName))));
}

function time(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw new TypeError("Invalid certificate time");
  const iso = value.toISOString();
  const year = value.getUTCFullYear();
  const body = year >= 1950 && year < 2050
    ? `${String(year).slice(2)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`
    : `${String(year).padStart(4, "0")}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return der(year >= 1950 && year < 2050 ? 0x17 : 0x18, Buffer.from(body, "ascii"));
}

const ecdsaSha384 = sequence(oid("1.2.840.10045.4.3.3"));

function extension(id, critical, value) {
  return sequence(oid(id), ...(critical ? [bool(true)] : []), octetString(value));
}

let nextSerial = 1;

// Node can parse and verify certificates but cannot issue them. This deliberately
// small DER issuer creates only the fields the local mock PKI needs.
export function mkCert({
  subject,
  subjectPublicKey,
  issuer = subject,
  issuerPrivateKey,
  isCa = false,
  notBefore,
  notAfter,
  serialNumber = nextSerial++
}) {
  const spki = subjectPublicKey.export({ type: "spki", format: "der" });
  const basicConstraints = isCa ? sequence(bool(true)) : sequence();
  const keyUsage = isCa
    ? bitString(Buffer.from([0x06]), 1)
    : bitString(Buffer.from([0x80]), 7);
  const extensions = sequence(
    extension("2.5.29.19", true, basicConstraints),
    extension("2.5.29.15", true, keyUsage)
  );
  const tbs = sequence(
    der(0xa0, integer(2)),
    integer(serialNumber),
    ecdsaSha384,
    name(issuer),
    sequence(time(notBefore), time(notAfter)),
    name(subject),
    spki,
    der(0xa3, extensions)
  );
  const signature = sign("sha384", tbs, issuerPrivateKey);
  return sequence(tbs, ecdsaSha384, bitString(signature));
}

export function derToPem(derCertificate) {
  const base64 = Buffer.from(derCertificate).toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`;
}
