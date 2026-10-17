// Attach the reapple payload to the NetEase Cloud Music page, and keep the component switches in
// step with ~/.reapple/config.json.
//
// Two things are kept deliberately separate:
//
//   1. The payload version (STAGE_VERSION). A bump means the build itself changed, so the whole
//      payload is torn down and re-armed. That is expensive and must not happen on a timer.
//   2. The settings hash. A settings edit changes nothing about the build, so it takes the cheap
//      path: push the new object onto window.__reappleConfig and let the payload re-read it.
//
// Conflating the two is the obvious mistake and it is the one that bites: if a config-only edit
// forced a rebuild, flipping one switch would drop every event handler and MutationObserver and
// rebuild the whole page, and if a rebuild were allowed to skip on a matching version, then editing
// config.json would silently do nothing at all until the next release.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const home = process.env.REAPPLE_HOME || path.join(os.homedir(), ".reapple");
const port = Number(process.env.REAPPLE_PORT || 9333);

const payloadPath = process.env.REAPPLE_PAYLOAD || path.join(home, "stage.js");
const configPath = process.env.REAPPLE_CONFIG || path.join(home, "config.json");

function readPayload() {
  for (const candidate of [payloadPath, path.join(dir, "..", "payload", "stage.js")]) {
    try { return { source: fs.readFileSync(candidate, "utf8"), from: candidate }; } catch {}
  }
  throw new Error(`no payload at ${payloadPath}`);
}

function readConfig() {
  // A missing or malformed config is not fatal. The payload defaults every switch to on, so a user
  // whose file got truncated gets the full replica rather than a blank Now Playing page and a
  // support issue. The warning is printed, so the failure is visible without being fatal.
  let config = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed;
  } catch (error) {
    if (error.code !== "ENOENT") console.error(`reapple: ${configPath} unreadable (${error.message}); using defaults`);
  }
  return config;
}

const { source, from: payloadFrom } = readPayload();
const config = readConfig();

// Normalise before hashing so that key order and whitespace -- the two things a hand-edited file
// changes most -- do not read as a settings change and trigger a pointless reload.
const configKey = crypto.createHash("sha256")
  .update(JSON.stringify(config, Object.keys(config).sort()))
  .digest("hex")
  .slice(0, 16);

// The payload declares its version once in STAGE_VERSION and assigns the marker from it, so accept
// either the constant declaration or a literal marker assignment.
const expected = source.match(/STAGE_VERSION\s*=\s*["']([^"']+)["']/)?.[1]
  ?? source.match(/window\.__kabiStage\s*=\s*["']([^"']+)["']/)?.[1];
if (!expected) throw new Error("missing stage version marker");

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`json/list ${response.status}`);
  return response.json();
}

function send(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 8000);
    function onMessage(event) {
      const data = JSON.parse(event.data);
      if (data.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    }
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const targets = await listTargets();
const pages = targets.filter((item) => item.type === "page" && item.webSocketDebuggerUrl);
if (!pages.length) {
  console.error("reapple: NetEase exposes no page target");
  process.exit(1);
}

// What the page last saw, so a settings-only change is distinguishable from a no-op run.
const statePath = path.join(home, "state.json");

for (const page of pages) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`socket ${page.url}`)), { once: true });
  });
  await send(ws, 1, "Runtime.enable", {});

  const seen = await send(ws, 2, "Runtime.evaluate", {
    expression: "({version: window.__kabiStage || '', settings: window.__reappleSettingsKey || ''})",
    returnByValue: true
  });
  const live = (seen.result && seen.result.value) || {};
  const settingsChanged = live.settings !== configKey;

  if (live.version === expected) {
    if (settingsChanged) {
      // Cheap path: no teardown, no re-arm. The payload re-reads the switches on its next tick and
      // the master switch runs a full build when it comes back on.
      await send(ws, 3, "Runtime.evaluate", {
        expression: `(() => { window.__reappleConfig = ${JSON.stringify(config)};` +
                    ` window.__reappleSettingsKey = ${JSON.stringify(configKey)};` +
                    ` return window.__kabiReconfigure ? !!window.__kabiReconfigure() : null; })()`,
        returnByValue: true
      });
      console.log(JSON.stringify({ url: page.url, mark: expected, reconfigured: true }));
    } else {
      console.log(JSON.stringify({ url: page.url, mark: expected, skipped: true }));
    }
    ws.close();
    continue;
  }

  // Dispose the previous event-driven stage before crossing versions (including rollback).
  await send(ws, 18, "Runtime.evaluate", { expression: "window.__kabiStageDispose?.()", returnByValue: true });
  await send(ws, 19, "Page.enable", {});
  // Purge every armed registration on this target, not just the one this injector recorded.
  // Registrations live on the page target and outlive the CDP session that added them, so any
  // build injected before a version bump stays armed and re-fires on every new document --
  // running after this one and rebuilding shared DOM out of its own markup. That is how an older
  // <img>-based backdrop generator kept reappearing over the canvas mesh. Unknown identifiers are
  // a no-op, so sweeping a range is safe.
  for (let candidate = 1; candidate <= 48; candidate++) {
    try { await send(ws, 20, "Page.removeScriptToEvaluateOnNewDocument", { identifier: String(candidate) }); }
    catch { /* not armed; the sweep is what establishes which ones are */ }
  }
  const installed = await send(ws, 3, "Page.addScriptToEvaluateOnNewDocument", { source });

  // The config must exist before the payload's first line runs, because the payload reads it
  // synchronously at boot to decide whether it may claim html.kabi-on at all. Splicing it in front
  // of the payload is the only way to guarantee that ordering on both the new-document path and the
  // direct-eval path below.
  const preamble =
    `window.__reappleConfig = ${JSON.stringify(config)};\n` +
    `window.__reappleSettingsKey = ${JSON.stringify(configKey)};\n`;
  const booted = preamble + source;

  await send(ws, 4, "Runtime.evaluate", { expression: booted, returnByValue: true });
  const mark = await send(ws, 5, "Runtime.evaluate", {
    expression: "window.__kabiStage || ''", returnByValue: true
  });
  console.log(JSON.stringify({
    url: page.url, title: page.title, identifier: installed && installed.identifier,
    mark: mark.result && mark.result.value, payload: payloadFrom
  }));
  ws.close();
}

try {
  fs.writeFileSync(statePath, JSON.stringify({ version: expected, settings: configKey, at: new Date().toISOString() }, null, 2));
} catch {}
