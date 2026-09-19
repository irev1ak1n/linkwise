// Build driver using Vite's JS API directly, since the background worker and content script
// need different configs that one vite.config.ts can't express.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync, copyFileSync } from "node:fs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes("--watch");

// Vite's lib mode skips the usual NODE_ENV define. Without it, React's dev/prod switcher tries
// to read process.env, which doesn't exist in a content script or service worker.
function nodeEnvDefine(mode) {
  return { "process.env.NODE_ENV": JSON.stringify(mode) };
}

async function buildBackground() {
  await build({
    root,
    configFile: false,
    define: nodeEnvDefine(watch ? "development" : "production"),
    build: {
      outDir: path.join(root, "dist/background"),
      emptyOutDir: true,
      watch: watch ? {} : null,
      lib: {
        entry: path.join(root, "src/background/index.ts"),
        formats: ["es"],
        fileName: () => "index.js",
      },
    },
  });
}

async function buildLinkedInContentScript() {
  // Content scripts can't be ES modules, Chrome loads them as classic scripts.
  // iife format gives us one self-contained file with no external imports.
  await build({
    root,
    configFile: false,
    plugins: [react()],
    define: nodeEnvDefine(watch ? "development" : "production"),
    build: {
      outDir: path.join(root, "dist/content"),
      emptyOutDir: true,
      watch: watch ? {} : null,
      lib: {
        entry: path.join(root, "src/linkedin/content.ts"),
        formats: ["iife"],
        name: "FinderLinkedInContentScript",
        fileName: () => "linkedin.js",
      },
    },
  });
}

async function buildDocumentParsingChunk() {
  // Loaded lazily at runtime (see documents/loadDocumentParser.ts) so the main content script,
  // injected into every LinkedIn page, doesn't pay for pdfjs/mammoth's weight up front.
  // emptyOutDir is false since this shares dist/content with the content script build,
  // which must run first and clear the directory.
  await build({
    root,
    configFile: false,
    define: nodeEnvDefine(watch ? "development" : "production"),
    build: {
      outDir: path.join(root, "dist/content"),
      emptyOutDir: false,
      watch: watch ? {} : null,
      rollupOptions: {
        output: { chunkFileNames: "[name].js" },
      },
      lib: {
        entry: path.join(root, "src/documents/readDocumentText.ts"),
        formats: ["es"],
        fileName: () => "documentParsing.js",
      },
    },
  });

  // pdfjs's worker URL doesn't resolve right under this build, so it falls back to a mode
  // Chrome's extension CSP blocks. Copying the worker file to a known path and pointing
  // workerSrc at it (see readDocumentText.ts) avoids the problem entirely.
  copyFileSync(
    path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
    path.join(root, "dist/content/pdf.worker.min.mjs"),
  );
}

function copyManifest() {
  mkdirSync(path.join(root, "dist"), { recursive: true });
  copyFileSync(path.join(root, "manifest.json"), path.join(root, "dist/manifest.json"));
}

await buildBackground();
await buildLinkedInContentScript();
await buildDocumentParsingChunk();
copyManifest();

console.log(
  watch
    ? "Finder: watching for changes (reload the extension in Chrome after each rebuild)."
    : "Finder: build complete.",
);
