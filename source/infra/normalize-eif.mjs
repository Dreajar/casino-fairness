#!/usr/bin/env node

import { closeSync, fstatSync, fsyncSync, openSync, readSync, writeSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EIF_MAGIC = Buffer.from(".eif");
const EIF_HEADER_SIZE = 548;
export const EIF_CRC32_OFFSET = 544;
const EIF_SECTION_HEADER_SIZE = 12;
const EIF_SECTION_METADATA = 5;
const MAX_NUM_SECTIONS = 32;
const SECTION_OFFSETS_OFFSET = 28;
const SECTION_SIZES_OFFSET = 284;
// Docker's layer-path metadata grows with the runtime's layers. Keep a bounded
// parser while permitting the larger manifests emitted by current Nitro CLI.
const MAX_METADATA_SIZE = 64 * 1024;
const IO_BUFFER_SIZE = 1024 * 1024;
const OVERLAY2_ID_PATTERN = /\/overlay2\/[0-9a-f]{64}(?=\/)/g;
const REQUIRED_OVERLAY2_PATHS = ["LowerDir", "MergedDir", "UpperDir", "WorkDir"];

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

function readExactly(fileDescriptor, buffer, position) {
  let bytesRead = 0;
  while (bytesRead < buffer.length) {
    const count = readSync(fileDescriptor, buffer, bytesRead, buffer.length - bytesRead, position + bytesRead);
    if (count === 0) throw new Error(`Unexpected EOF at byte ${position + bytesRead}`);
    bytesRead += count;
  }
}

function updateCrc32(state, buffer, length = buffer.length) {
  let crc = state >>> 0;
  for (let index = 0; index < length; index += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return crc >>> 0;
}

function computeEifCrc32FromDescriptor(fileDescriptor, fileSize) {
  const buffer = Buffer.allocUnsafe(IO_BUFFER_SIZE);
  let state = 0xffffffff;

  const updateRange = (start, end) => {
    let position = start;
    while (position < end) {
      const requested = Math.min(buffer.length, end - position);
      const count = readSync(fileDescriptor, buffer, 0, requested, position);
      if (count === 0) throw new Error(`Unexpected EOF while checksumming byte ${position}`);
      state = updateCrc32(state, buffer, count);
      position += count;
    }
  };

  updateRange(0, EIF_CRC32_OFFSET);
  updateRange(EIF_CRC32_OFFSET + 4, fileSize);
  return (state ^ 0xffffffff) >>> 0;
}

export function computeEifCrc32(eifPath) {
  const fileDescriptor = openSync(eifPath, "r");
  try {
    return computeEifCrc32FromDescriptor(fileDescriptor, fstatSync(fileDescriptor).size);
  } finally {
    closeSync(fileDescriptor);
  }
}

export function sourceEpochBuildTime(sourceDateEpoch) {
  if (!/^\d+$/.test(String(sourceDateEpoch))) {
    throw new Error("SOURCE_DATE_EPOCH must be a non-negative integer");
  }
  const milliseconds = Number(sourceDateEpoch) * 1000;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error("SOURCE_DATE_EPOCH is outside the supported JavaScript date range");
  }
  const iso = new Date(milliseconds).toISOString();
  return iso.replace(/\.\d{3}Z$/, ".000000000+00:00");
}

function canonicalOverlay2Path(path, fieldName) {
  let identifierIndex = 0;
  const normalized = path.replace(OVERLAY2_ID_PATTERN, () => {
    identifierIndex += 1;
    return `/overlay2/${identifierIndex.toString(16).padStart(64, "0")}`;
  });
  if (identifierIndex === 0) {
    throw new Error(`EIF DockerInfo.GraphDriver.Data.${fieldName} has no overlay2 identifiers`);
  }
  return normalized;
}

function replaceUniqueSameWidth(buffer, original, replacement, fieldName) {
  if (Buffer.byteLength(original) !== Buffer.byteLength(replacement)) {
    throw new Error(`Normalized EIF ${fieldName} would change the metadata section size`);
  }
  const originalBytes = Buffer.from(original);
  const offset = buffer.indexOf(originalBytes);
  if (offset < 0 || buffer.indexOf(originalBytes, offset + 1) >= 0) {
    throw new Error(`EIF ${fieldName} must occur exactly once in its metadata bytes`);
  }
  Buffer.from(replacement).copy(buffer, offset);
}

export function normalizeEif(eifPath, sourceDateEpoch, expectedRepoTag) {
  const normalizedBuildTime = sourceEpochBuildTime(sourceDateEpoch);
  const fileDescriptor = openSync(eifPath, "r+");

  try {
    const fileSize = fstatSync(fileDescriptor).size;
    if (fileSize < EIF_HEADER_SIZE) throw new Error("EIF is smaller than its header");

    const header = Buffer.alloc(EIF_HEADER_SIZE);
    readExactly(fileDescriptor, header, 0);
    if (!header.subarray(0, EIF_MAGIC.length).equals(EIF_MAGIC)) {
      throw new Error("EIF magic is invalid");
    }
    if (header.readUInt16BE(4) !== 4) throw new Error("Only EIF version 4 is supported");

    const storedCrc32 = header.readUInt32BE(EIF_CRC32_OFFSET);
    const originalCrc32 = computeEifCrc32FromDescriptor(fileDescriptor, fileSize);
    if (storedCrc32 !== originalCrc32) {
      throw new Error(
        `EIF failed its original CRC-32 check: stored=${storedCrc32.toString(16)} computed=${originalCrc32.toString(16)}`
      );
    }

    const sectionCount = header.readUInt16BE(26);
    if (sectionCount === 0 || sectionCount > MAX_NUM_SECTIONS) {
      throw new Error(`EIF section count is invalid: ${sectionCount}`);
    }

    let metadata;
    for (let index = 0; index < sectionCount; index += 1) {
      const sectionOffset = Number(header.readBigUInt64BE(SECTION_OFFSETS_OFFSET + index * 8));
      const declaredSize = Number(header.readBigUInt64BE(SECTION_SIZES_OFFSET + index * 8));
      if (
        !Number.isSafeInteger(sectionOffset) ||
        !Number.isSafeInteger(declaredSize) ||
        sectionOffset < EIF_HEADER_SIZE ||
        sectionOffset + EIF_SECTION_HEADER_SIZE + declaredSize > fileSize
      ) {
        throw new Error(`EIF section ${index} has invalid bounds`);
      }

      const sectionHeader = Buffer.alloc(EIF_SECTION_HEADER_SIZE);
      readExactly(fileDescriptor, sectionHeader, sectionOffset);
      const sectionType = sectionHeader.readUInt16BE(0);
      const sectionSize = Number(sectionHeader.readBigUInt64BE(4));
      if (sectionSize !== declaredSize) {
        throw new Error(`EIF section ${index} size disagrees with the main header`);
      }
      if (sectionType === EIF_SECTION_METADATA) {
        if (metadata) throw new Error("EIF contains multiple metadata sections");
        if (sectionSize > MAX_METADATA_SIZE) throw new Error("EIF metadata exceeds 65536 bytes");
        metadata = {
          contentOffset: sectionOffset + EIF_SECTION_HEADER_SIZE,
          size: sectionSize
        };
      }
    }
    if (!metadata) throw new Error("EIF metadata section is missing");

    const metadataBytes = Buffer.alloc(metadata.size);
    readExactly(fileDescriptor, metadataBytes, metadata.contentOffset);
    const identity = JSON.parse(metadataBytes.toString("utf8"));
    const originalBuildTime = identity?.BuildMetadata?.BuildTime;
    if (typeof originalBuildTime !== "string") {
      throw new Error("EIF metadata BuildMetadata.BuildTime is missing");
    }
    if (expectedRepoTag !== undefined) {
      const repoTags = identity?.DockerInfo?.RepoTags;
      if (!Array.isArray(repoTags) || repoTags.length !== 1 || repoTags[0] !== expectedRepoTag) {
        throw new Error(`EIF DockerInfo.RepoTags must contain only ${expectedRepoTag}`);
      }
    }
    const graphDriver = identity?.DockerInfo?.GraphDriver;
    if (graphDriver?.Name !== "overlay2" || typeof graphDriver.Data !== "object" || graphDriver.Data === null) {
      throw new Error("EIF DockerInfo.GraphDriver must contain overlay2 path metadata");
    }
    const normalizedGraphDriverPaths = {};
    for (const fieldName of REQUIRED_OVERLAY2_PATHS) {
      const originalPath = graphDriver.Data[fieldName];
      if (typeof originalPath !== "string") {
        throw new Error(`EIF DockerInfo.GraphDriver.Data.${fieldName} is missing`);
      }
      const normalizedPath = canonicalOverlay2Path(originalPath, fieldName);
      replaceUniqueSameWidth(metadataBytes, originalPath, normalizedPath, `GraphDriver.Data.${fieldName}`);
      normalizedGraphDriverPaths[fieldName] = normalizedPath;
    }
    replaceUniqueSameWidth(metadataBytes, originalBuildTime, normalizedBuildTime, "BuildMetadata.BuildTime");
    writeSync(fileDescriptor, metadataBytes, 0, metadataBytes.length, metadata.contentOffset);

    const normalizedCrc32 = computeEifCrc32FromDescriptor(fileDescriptor, fileSize);
    const crcBytes = Buffer.alloc(4);
    crcBytes.writeUInt32BE(normalizedCrc32);
    writeSync(fileDescriptor, crcBytes, 0, crcBytes.length, EIF_CRC32_OFFSET);
    fsyncSync(fileDescriptor);

    const verifiedCrc32 = computeEifCrc32FromDescriptor(fileDescriptor, fileSize);
    if (verifiedCrc32 !== normalizedCrc32) throw new Error("Normalized EIF CRC-32 verification failed");

    return {
      buildTime: normalizedBuildTime,
      crc32: normalizedCrc32.toString(16).padStart(8, "0"),
      originalBuildTime,
      normalizedGraphDriverPathCount: Object.keys(normalizedGraphDriverPaths).length
    };
  } finally {
    closeSync(fileDescriptor);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [eifPath, sourceDateEpoch, expectedRepoTag] = process.argv.slice(2);
  if (!eifPath || sourceDateEpoch === undefined) {
    console.error("Usage: node infra/normalize-eif.mjs <eif-path> <source-date-epoch> [expected-repo-tag]");
    process.exit(2);
  }
  console.log(JSON.stringify(normalizeEif(eifPath, sourceDateEpoch, expectedRepoTag)));
}
