import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { build, version } = createRequire(require.resolve("tsx"))("esbuild");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function buildGameService(policy, outputDirectory = resolve(root, "enclave/dist")) {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(policy.releaseId)) throw new Error("Invalid measured release ID");
  for (const field of ["maximumWagerMinor", "maximumPayoutMinor"]) {
    if (typeof policy[field] !== "string" || !/^[1-9][0-9]{0,14}$/.test(policy[field])) throw new Error(`Invalid ${field}`);
  }
  if (!Array.isArray(policy.enabledGameIds) || !policy.enabledGameIds.length || policy.enabledGameIds.some((id) => typeof id !== "string")) throw new Error("Explicit game allowlist required");
  if (policy.recoveryKeyArn !== undefined && !/^arn:aws:kms:us-east-2:[0-9]{12}:key\/[a-f0-9-]{36}$/.test(policy.recoveryKeyArn)) throw new Error("Invalid measured recovery KMS key");
  const normalized = {
    releaseId: policy.releaseId, enabledGameIds: [...new Set(policy.enabledGameIds)].sort(),
    maximumWagerMinor: policy.maximumWagerMinor, maximumPayoutMinor: policy.maximumPayoutMinor,
    ...(policy.recoveryKeyArn ? { recoveryKeyArn: policy.recoveryKeyArn } : {})
  };
  const options = {
    absWorkingDir: root, entryPoints: ["enclave/oracle/game-service.ts"], bundle: true,
    platform: "node", target: "node24", format: "esm", write: false, metafile: true,
    sourcemap: false, legalComments: "none", charset: "utf8", treeShaking: true,
    define: { MEASURED_GAME_POLICY: JSON.stringify({ ...normalized, rulesHash: "0".repeat(64) }) }
  };
  const initial = await build(options);
  const inputs = Object.keys(initial.metafile.inputs).filter((path) => path !== "<define:MEASURED_GAME_POLICY>").sort().map((path) => {
    const absolute = resolve(root, path);
    if (relative(root, absolute).startsWith("..")) throw new Error("Build dependency outside repository");
    return [path.replaceAll("\\", "/"), hash(readFileSync(absolute))];
  });
  // Include build recipe and lockfile as well as the transitively bundled math.
  for (const path of ["enclave/build-game-service.mjs", "pnpm-lock.yaml"]) inputs.push([path, hash(readFileSync(resolve(root, path)))]);
  inputs.sort(([a], [b]) => a.localeCompare(b, "en"));
  const rulesHash = hash(JSON.stringify({ policy: normalized, esbuild: version, inputs }));
  const measuredPolicy = { ...normalized, rulesHash };
  const result = await build({ ...options, define: { MEASURED_GAME_POLICY: JSON.stringify(measuredPolicy) } });
  if (result.outputFiles.length !== 1) throw new Error("Expected one self-contained oracle bundle");
  const bytes = result.outputFiles[0].contents;
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "game-service.mjs"), bytes);
  const manifest = { policy: measuredPolicy, esbuild: version, inputs: Object.fromEntries(inputs), bundleSha256: hash(bytes) };
  writeFileSync(resolve(outputDirectory, "game-build.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: node enclave/build-game-service.mjs <policy.json> [output-directory]");
  console.log(JSON.stringify(await buildGameService(JSON.parse(readFileSync(process.argv[2], "utf8")), process.argv[3]), null, 2));
}
