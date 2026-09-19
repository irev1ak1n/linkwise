// Drives a persistent local Chrome profile with LinkWise loaded unpacked, used by
// npm run extension:reload and npm run live:test.
//
// Uses its own Chrome profile (.dev-chrome-profile/, gitignored) instead of the user's real
// one, so it never touches their cookies or other extensions.
//
// Reconnects over CDP to one long-running Chrome instance instead of launching a fresh one
// each time, so open tabs survive between runs.
//
// One-time manual step: Chrome won't auto-load an unpacked extension once remote debugging is
// on. Run npm run dev:browser once, close it, reopen this same profile without
// --remote-debugging-port and click "Load unpacked" yourself. After that, Chrome remembers it.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Forward slashes even on Windows, see findChromeExecutable for why backslashes break here.
function toForwardSlashes(p) {
  return p.replace(/\\/g, "/");
}

const ROOT = toForwardSlashes(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIST_DIR = `${ROOT}/dist`;
const PROFILE_DIR = `${ROOT}/.dev-chrome-profile`;
// Not the common 9222, to avoid colliding with some other CDP-enabled Chrome.
const CDP_PORT = 9233;
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
// Must match src/linkedin/devTools.ts's RELOAD_REQUEST exactly.
const RELOAD_MESSAGE_TYPE = "__linkwise_dev_reload__";
const OPENER_SELECTOR = '[aria-label="Open or close the LinkWise panel"]';
const PANEL_HOST_ID = "finder-linkwise-panel-host";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Forward slashes only. Git Bash strips backslashes from spawn args before Node sees them,
// which broke this outright.
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

// No --load-extension flag here. Chrome silently ignores it once remote debugging is on, so
// the extension has to be loaded once by hand instead (see the file header).
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
  child.unref(); // keeps running after this script exits
}

// Launches Chrome if it's not already running and returns a connected browser.
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

// Reuses one LinkedIn tab across runs instead of piling up new ones. Closes any other
// linkedin.com tabs first, leaves other tabs (like chrome://extensions) alone.
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
  await browser.close(); // just detaches, doesn't close the real browser
}

async function cmdOpen(url) {
  const browser = await ensureBrowser();
  const context = await ensureContext(browser);
  const page = await getPrimaryLinkedInPage(context, url);
  console.log(`Opened ${page.url()}. The dev Chrome window stays open — sign into LinkedIn here if this is your first run.`);
  await browser.close();
}

// Triggers the extension's self-reload bridge. Run npm run build first so it picks up dist/.
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

// Quick smoke check: opens a page, opens the panel, confirms it mounts, reports console errors.
// Pass a profile URL for a deeper check including the AI status line.
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
