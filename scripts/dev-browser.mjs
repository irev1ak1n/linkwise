// A small, dependency-light (playwright-core only) driver for a PERSISTENT local Chrome
// profile with LinkWise loaded unpacked — the automation behind `npm run extension:reload`
// and `npm run live:test`. Deliberately not a test framework: a handful of subcommands
// (status/open/reload/smoke), no fixtures, no assertion library, no page-object model.
//
// Why a dedicated profile rather than the user's everyday Chrome: automating someone's main
// browser profile (their real cookies, saved passwords, other extensions) is a much bigger
// blast radius than this workflow needs. This profile lives at .dev-chrome-profile/
// (gitignored, never committed) and is used for nothing but LinkWise development — sign into
// LinkedIn here ONCE (`npm run dev:browser`) and the session persists across every future
// reload/smoke run; nothing here ever touches or reads the user's regular Chrome profile.
//
// Why CDP-attach rather than "launch fresh every time": launching a new Chrome process on
// every `npm run extension:reload` would drop open tabs and be needlessly slow. Instead this
// spawns the real system Chrome ONCE, as its own independent OS process with remote debugging
// enabled, and every later command reconnects to that same running instance over CDP — the
// same protocol chrome://extensions' own "Inspect" links use, nothing exotic.
//
// One unavoidable one-time manual step: current Chrome refuses to register an unpacked
// extension supplied via --load-extension once remote debugging is enabled (confirmed live —
// no error, it just silently doesn't load), and the "Load unpacked" button's native folder
// picker cannot be driven by any automation tool (that's the whole reason it's still a native
// OS dialog rather than a plain <input type=file>). So: the very first time, run
// `npm run dev:browser` once, then close it, open this SAME profile directly
// (`"<chrome path>" --user-data-dir=.dev-chrome-profile chrome://extensions`, no
// --remote-debugging-port) and click "Load unpacked" -> dist yourself. After that one time,
// Chrome remembers the unpacked extension across every future restart (remote-debugging-port
// or not) and `npm run extension:reload` needs no further manual steps, ever.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Forward slashes even on Windows (path.join would give backslashes there) — see
// findChromeExecutable's doc comment for why a backslash-containing spawn argument is unsafe
// in this environment specifically.
function toForwardSlashes(p) {
  return p.replace(/\\/g, "/");
}

const ROOT = toForwardSlashes(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIST_DIR = `${ROOT}/dist`;
const PROFILE_DIR = `${ROOT}/.dev-chrome-profile`;
// Deliberately not the common 9222, to avoid colliding with some other CDP-enabled Chrome the
// user might independently have running (their own everyday browsing, another tool, etc).
const CDP_PORT = 9233;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
// Must match src/linkedin/devTools.ts's RELOAD_REQUEST exactly — that file is the other half
// of this bridge (window.postMessage -> content script -> chrome.runtime.sendMessage ->
// background's chrome.runtime.reload()).
const RELOAD_MESSAGE_TYPE = "__linkwise_dev_reload__";
const OPENER_SELECTOR = '[aria-label="Open or close the LinkWise panel"]';
const PANEL_HOST_ID = "finder-linkwise-panel-host";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Forward slashes only, even on Windows — Windows' own process-creation APIs accept them fine,
 * and it sidesteps a real, confirmed-live quirk: a backslash-containing argument passed to a
 * Windows Node.exe invoked FROM Git Bash / MSYS can get its backslashes silently stripped by
 * MSYS's path-conversion layer before Node ever sees it (this broke `spawn` outright — the
 * path arrived as "C:Program FilesGoogleChromeApplication..." with every backslash gone). */
function findChromeExecutable() {
  if (process.env.LINKWISE_CHROME_PATH) return process.env.LINKWISE_CHROME_PATH;
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    (process.env.LOCALAPPDATA ?? "").replace(/\\/g, "/") + "/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) {
    throw new Error(
      "Could not find a Chrome install. Set LINKWISE_CHROME_PATH to the chrome executable and try again.",
    );
  }
  return found;
}

async function isDebuggerUp() {
  try {
    const res = await fetch(`${CDP_URL}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Deliberately does NOT pass --load-extension/--disable-extensions-except — confirmed live that
 * current Chrome (152) silently refuses to register an unpacked extension supplied that way
 * once --remote-debugging-port is also present, no error shown, just nothing loads. LinkWise
 * must instead be loaded ONCE via the real "Load unpacked" button while this profile's Chrome
 * is running WITHOUT --remote-debugging-port (see the one-time setup note in CLAUDE.md) —
 * after that one-time registration, Chrome remembers the unpacked extension across restarts
 * and loads it automatically on every future launch, remote-debugging-port or not.
 */
function launchDetachedChrome() {
  mkdirSync(PROFILE_DIR, { recursive: true });
  if (!existsSync(DIST_DIR)) {
    throw new Error(`${DIST_DIR} does not exist yet — run "npm run build" before launching the dev browser.`);
  }
  const chromePath = findChromeExecutable();
  const child = spawn(
    chromePath,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "https://www.linkedin.com/feed/",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref(); // survives after this Node process exits — that's the whole point
}

/** Ensures the dev Chrome is running (launching it if needed) and returns a connected
 * playwright-core Browser attached over CDP. Idempotent and safe to call from every command. */
async function ensureBrowser() {
  if (!(await isDebuggerUp())) {
    console.log("Dev Chrome is not running — launching it now (this window stays open between runs)...");
    launchDetachedChrome();
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(500);
      if (await isDebuggerUp()) break;
    }
    if (!(await isDebuggerUp())) {
      throw new Error("Chrome did not come up on the debugging port in time.");
    }
  }
  return chromium.connectOverCDP(CDP_URL);
}

async function ensureContext(browser) {
  const contexts = browser.contexts();
  return contexts[0] ?? (await browser.newContext());
}

/** Reuses a single LinkedIn tab across runs instead of piling up a new one every time this
 * script is invoked (confirmed live: without this, a dozen `smoke`/`open` calls left a dozen
 * open tabs behind). Closes every OTHER linkedin.com tab it finds first — this is a dev-only
 * profile with no other purpose, so an extra linkedin.com tab is always leftover clutter from a
 * previous run, never something worth preserving. Non-linkedin.com tabs (chrome://extensions,
 * anything the user opened by hand) are left alone. */
async function getPrimaryLinkedInPage(context, url) {
  const linkedInPages = context.pages().filter((p) => p.url().includes("linkedin.com"));
  const [keep, ...extra] = linkedInPages;
  for (const page of extra) await page.close().catch(() => {});

  const target = url ?? "https://www.linkedin.com/feed/";
  if (keep) {
    if (url && keep.url() !== url) await keep.goto(url, { waitUntil: "domcontentloaded" });
    return keep;
  }
  const page = await context.newPage();
  await page.goto(target, { waitUntil: "domcontentloaded" });
  return page;
}

async function cmdStatus() {
  const up = await isDebuggerUp();
  if (!up) {
    console.log("Dev Chrome: not running. `npm run dev:browser` or any other command here will start it.");
    return;
  }
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = await ensureContext(browser);
  console.log(`Dev Chrome: running (profile: ${PROFILE_DIR})`);
  console.log("Open tabs:");
  for (const page of context.pages()) console.log(`  - ${page.url()}`);
  await browser.close(); // detaches only — CDP connections never terminate the real browser
}

async function cmdOpen(url) {
  const browser = await ensureBrowser();
  const context = await ensureContext(browser);
  const page = await getPrimaryLinkedInPage(context, url);
  console.log(`Opened ${page.url()}. The dev Chrome window stays open — sign into LinkedIn here if this is your first run.`);
  await browser.close();
}

/** Triggers the extension's own self-reload bridge (see devTools.ts / background/index.ts) —
 * no chrome://extensions, no manual click, works whether or not a LinkedIn tab was already
 * open. Picks up whatever is currently in dist/, so always run `npm run build` first (or just
 * use `npm run verify`, which does that as part of full verification). */
async function cmdReload() {
  const browser = await ensureBrowser();
  const context = await ensureContext(browser);
  const page = await getPrimaryLinkedInPage(context);
  await page.evaluate((type) => window.postMessage({ type }, "*"), RELOAD_MESSAGE_TYPE);
  console.log("Sent the dev-reload message. Waiting for the extension to restart and re-inject...");
  await sleep(2000);
  console.log("Done — the loaded extension should now be running the latest dist/ build.");
  await browser.close();
}

/**
 * A quick functional smoke check, not a full test suite: opens a page, opens the LinkWise
 * panel, confirms it actually mounts, and reports any console/page errors seen along the way.
 * Pass a real profile URL as the first argument for a deeper check (it also waits briefly for
 * the AI-enhanced-vs-local status line); with no argument it only confirms the opener + panel
 * mount on the LinkedIn feed, which needs no active goal or scan to verify.
 */
async function cmdSmoke(profileUrl) {
  const browser = await ensureBrowser();
  const context = await ensureContext(browser);
  const page = await getPrimaryLinkedInPage(context, profileUrl);

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.waitForTimeout(1500); // let the content script's own settle tick run at least once

  const opener = page.locator(OPENER_SELECTOR);
  const openerCount = await opener.count();
  if (openerCount === 0) {
    console.error("FAIL: LinkWise opener button was not found on the page.");
    console.error("Console/page errors seen:", consoleErrors);
    await browser.close();
    process.exitCode = 1;
    return;
  }

  await opener.click();
  await page.waitForTimeout(500);
  const panelMounted = await page.evaluate(
    (id) => !!document.getElementById(id)?.shadowRoot?.querySelector(".lw-panel"),
    PANEL_HOST_ID,
  );
  if (!panelMounted) {
    console.error("FAIL: the LinkWise panel did not mount after clicking the opener.");
    console.error("Console/page errors seen:", consoleErrors);
    await browser.close();
    process.exitCode = 1;
    return;
  }

  let aiStatus = null;
  if (profileUrl) {
    aiStatus = await page.evaluate((id) => {
      const root = document.getElementById(id)?.shadowRoot;
      const els = root ? Array.from(root.querySelectorAll(".lw-ai-status")) : [];
      return els.map((el) => el.textContent?.trim());
    }, PANEL_HOST_ID);
  }

  const linkwiseErrors = consoleErrors.filter((e) => /linkwise|chrome-extension/i.test(e));
  console.log("PASS: opener found, panel mounted.");
  if (aiStatus) console.log("Current AI status line(s):", aiStatus.length ? aiStatus : "(none yet — still scanning/idle)");
  if (linkwiseErrors.length > 0) {
    console.error("LinkWise-related console errors were seen during the smoke test:");
    for (const e of linkwiseErrors) console.error("  -", e);
    process.exitCode = 1;
  } else {
    console.log("No LinkWise-related console errors seen.");
  }

  await browser.close();
}

const [, , command, arg1] = process.argv;

switch (command) {
  case "status":
    await cmdStatus();
    break;
  case "open":
    await cmdOpen(arg1);
    break;
  case "reload":
    await cmdReload();
    break;
  case "smoke":
    await cmdSmoke(arg1);
    break;
  default:
    console.log("Usage: node scripts/dev-browser.mjs <status|open [url]|reload|smoke [profileUrl]>");
    process.exitCode = 1;
}
