import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, symlinkSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build, version } from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const source = resolve(root, "source");
const recipe = JSON.parse(readFileSync(resolve(root, "build-recipes.json")));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
if (version !== recipe.esbuild) throw new Error(`Use esbuild ${recipe.esbuild}`);
for (const [path, expected] of Object.entries(recipe.sources)) {
  if (sha(readFileSync(resolve(source, path))) !== expected) throw new Error(`Source hash mismatch: ${path}`);
}
for (const [from, to] of Object.entries(recipe.links)) {
  const link = resolve(source, from), target = resolve(source, to);
  if (relative(source, link).startsWith("..") || relative(source, target).startsWith("..")) throw new Error("Link outside source");
  mkdirSync(dirname(link), { recursive: true });
  if (existsSync(link)) {
    if (realpathSync(link) !== realpathSync(target)) throw new Error(`Wrong existing dependency: ${from}`);
  } else symlinkSync(process.platform === "win32" ? target : relative(dirname(link), target), link, process.platform === "win32" ? "junction" : "dir");
}
for (const job of recipe.jobs) {
  const result = await build({
    absWorkingDir: source, entryPoints: [job.entry], bundle: true, platform: "node", target: "node24",
    format: "esm", write: false, metafile: true, sourcemap: false, charset: "utf8", treeShaking: true,
    legalComments: job.legalComments, ...(job.define ? { define: job.define } : {})
  });
  const bytes = result.outputFiles[0].contents;
  if (sha(bytes) !== job.sha256) throw new Error(`Rebuild differs: ${job.output}`);
  const destination = resolve(root, "rebuilt", job.output);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  console.log(`MATCH ${job.output}`);
}
console.log("All published bundles reproduced. This does not rebuild the Nitro EIF or contact AWS.");
