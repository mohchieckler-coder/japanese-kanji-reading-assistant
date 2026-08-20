import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src");
const output = join(root, "dist");
const packageMetadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

if (relative(root, output) !== "dist") {
  throw new Error(`Refusing to clear unexpected output directory: ${output}`);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

await build({
  entryPoints: [join(source, "content.js")],
  outfile: join(output, "content.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  alias: {
    async: join(source, "async-shim.cjs"),
    path: join(source, "path-shim.cjs")
  },
  legalComments: "none"
});

await build({
  entryPoints: [join(source, "background.js")],
  outfile: join(output, "background.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  legalComments: "none"
});

for (const file of [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "options.html",
  "options.css",
  "options-i18n.js",
  "options.js"
]) {
  cpSync(join(source, file), join(output, file));
}

cpSync(join(root, "node_modules", "kuromoji", "dict"), join(output, "dict"), {
  recursive: true
});
cpSync(join(source, "icons"), join(output, "icons"), {
  recursive: true
});
cpSync(join(root, "THIRD_PARTY_NOTICES.md"), join(output, "THIRD_PARTY_NOTICES.md"));
cpSync(join(root, "third_party_licenses"), join(output, "third_party_licenses"), {
  recursive: true
});

const manifestPath = join(output, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = packageMetadata.version;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const file of ["content.js", "popup.js"]) {
  const versionedPath = join(output, file);
  const versionedSource = readFileSync(versionedPath, "utf8");
  if (!versionedSource.includes("__EXTENSION_VERSION__")) {
    throw new Error(`${file} build-version placeholder is missing`);
  }
  writeFileSync(
    versionedPath,
    versionedSource.replaceAll("__EXTENSION_VERSION__", packageMetadata.version)
  );
}

console.log(`Extension built at ${output}`);
