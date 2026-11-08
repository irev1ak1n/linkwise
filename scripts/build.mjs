// Build driver using Vite's JS API directly, since the background worker and content script
// need different configs that one vite.config.ts can't express.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes("--watch");

// Where the extension finds the backend. Unset, it is the local backend; set LINKWISE_API_BASE_URL to the
// deployed (Railway) URL for a production build. Localhost stays allowed so development keeps working.
const LOCAL_API = "http://localhost:8787";
const apiBaseUrl = (process.env.LINKWISE_API_BASE_URL ?? "").trim().replace(/\/+$/, "") || LOCAL_API;
if (apiBaseUrl !== LOCAL_API && !/^https:\/\/[^/\s]+$/.test(apiBaseUrl)) {
  throw new Error(`LINKWISE_API_BASE_URL must be an https origin such as https://your-app.up.railway.app (got "${apiBaseUrl}").`);
}

// Vite's lib mode skips the usual NODE_ENV define. Without it, React's dev/prod switcher tries
// to read process.env, which doesn't exist in a content script or service worker.
function nodeEnvDefine(mode) {
  return { "process.env.NODE_ENV": JSON.stringify(mode), __LINKWISE_API_BASE_URL__: JSON.stringify(apiBaseUrl) };
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
      // A full build starts from an empty folder. In watch mode every rebuild of the content script would
      // empty it again, deleting the images, the pdf worker, and the document parser that are only
      // copied or built once at startup, so the panel's pictures vanished after the first rebuild.
      emptyOutDir: !watch,
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

// Images the panel loads by URL. dist/content is already web-accessible to LinkedIn pages.
function copyAssets() {
  mkdirSync(path.join(root, "dist/content/assets"), { recursive: true });
  for (const name of readdirSync(path.join(root, "src/assets"))) {
    copyFileSync(path.join(root, "src/assets", name), path.join(root, "dist/content/assets", name));
  }
}

function copyManifest() {
  mkdirSync(path.join(root, "dist"), { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
  // The extension may call the backend only at origins it holds permission for.
  if (apiBaseUrl !== LOCAL_API) manifest.host_permissions = [...new Set([...manifest.host_permissions, `${apiBaseUrl}/*`])];
  writeFileSync(path.join(root, "dist/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

await buildBackground();
await buildLinkedInContentScript();
await buildDocumentParsingChunk();
copyAssets();
copyManifest();

console.log(
  watch
    ? "Finder: watching for changes (reload the extension in Chrome after each rebuild)."
    : "Finder: build complete.",
);
