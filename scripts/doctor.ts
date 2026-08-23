/**
 * Check this machine's setup and say, in plain English, what is wrong.
 *
 *   npm run doctor
 *
 * Written because somebody following the README hit `invalid x-api-key`
 * and had no way to tell which of six things it was — a placeholder left
 * in the file, a quote picked up on paste, a file in the wrong folder, a
 * server still running with the old value, a key with no credit, or an
 * actually-wrong key. Every one of those has a different fix and they all
 * produced the same 401.
 *
 * It prints the absolute path of every file it looks at, because "where is
 * the env file" is the question underneath most of them. It never prints
 * the key.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanKey, looksLikeAnthropicKey } from "../lib/vision/credentials";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env.local");

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => console.log(`  ✗ ${m}`);
const info = (m: string) => console.log(`    ${m}`);

let problems = 0;
const fail = (m: string, fix: string) => {
  problems++;
  bad(m);
  info(`→ ${fix}`);
};

/** Parse KEY=VALUE lines. Deliberately not a dotenv dependency: this has to
 *  work on a checkout where `npm ci` is the step that failed. */
function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = cleanKey(trimmed.slice(eq + 1));
  }
  return values;
}

async function main() {
  console.log(`\nlandscapeAI setup check`);
  console.log(`Project folder: ${ROOT}\n`);

  console.log("Environment file");
  let env: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) {
    fail(
      `No .env.local at ${ENV_FILE}`,
      "Create it in this folder. The README section 'Running it on your own machine' has the block to paste.",
    );
  } else {
    const raw = readFileSync(ENV_FILE, "utf8");
    ok(`Found ${ENV_FILE}`);
    if (raw.startsWith("{\\rtf")) {
      fail(
        "That file is Rich Text, not plain text — TextEdit saved it in RTF.",
        "Delete it and recreate it, then edit with `nano .env.local` instead.",
      );
    }
    env = parseEnvFile(raw);
  }

  // process.env wins if something was exported in the shell, which is a
  // difference worth knowing about when the file looks right and the app
  // disagrees.
  const fromShell = cleanKey(process.env.ANTHROPIC_API_KEY);
  const fromFile = env.ANTHROPIC_API_KEY ?? "";
  if (fromShell && fromFile && fromShell !== fromFile) {
    info("Note: ANTHROPIC_API_KEY is set in your shell AND in .env.local, and they differ.");
    info("A `next` server started from this shell uses the shell's value.");
  }
  const apiKey = fromFile || fromShell;

  console.log("\nAnthropic API key");
  if (!apiKey) {
    fail(
      "ANTHROPIC_API_KEY is not set.",
      "Without it the app runs, but segmentation shows a labelled demo overlay instead of reading your photo.",
    );
  } else if (/paste|your-key|changeme|xxxxx|[<…]/i.test(apiKey)) {
    fail(
      "ANTHROPIC_API_KEY is still the placeholder from the instructions.",
      "Replace it with a real key from console.anthropic.com, then restart the server.",
    );
  } else {
    ok(`Set — ${apiKey.length} characters`);
    if (!looksLikeAnthropicKey(apiKey)) {
      info("Note: it does not look like an Anthropic key (they start with 'sk-ant-' and are long).");
      info("Fine if you are pointing at a gateway; suspicious if you are not.");
    }
  }

  console.log("\nContractor login (for /dashboard)");
  const email = env.CONTRACTOR_EMAIL ?? process.env.CONTRACTOR_EMAIL ?? "";
  const password = env.CONTRACTOR_PASSWORD ?? process.env.CONTRACTOR_PASSWORD ?? "";
  if (!email || !password) {
    info("Not configured — nobody can sign in to the console. That is the safe default, not an error.");
    info("Set CONTRACTOR_EMAIL and CONTRACTOR_PASSWORD in .env.local to sign in locally.");
  } else if (password.length < 12) {
    fail("CONTRACTOR_PASSWORD is under 12 characters.", "Use a longer one — the app refuses short ones.");
  } else {
    ok(`Set — sign in as ${email}`);
  }

  if (apiKey && !/paste|your-key|changeme/i.test(apiKey)) {
    console.log("\nAsking Anthropic whether the key works");
    const base = (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/+$/, "");
    try {
      const res = await fetch(`${base}/v1/models?limit=1`, {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        ok("The API accepted the key.");
      } else if (res.status === 401 || res.status === 403) {
        fail(
          `The API rejected the key (HTTP ${res.status}).`,
          "The key itself is wrong, revoked, or from another account. Generate a fresh one at console.anthropic.com → API keys.",
        );
      } else if (res.status === 402) {
        fail("The account has no credit (HTTP 402).", "Add billing at console.anthropic.com.");
      } else {
        fail(`Unexpected response from the API (HTTP ${res.status}).`, "Try again shortly.");
      }
    } catch (error) {
      fail(
        `Could not reach ${base} — ${error instanceof Error ? error.message : String(error)}`,
        "Check this machine's network access; a VPN or firewall will do this.",
      );
    }
  }

  console.log("");
  if (problems === 0) {
    console.log("Nothing to fix. Start the app with `npm run build && npm start`.\n");
  } else {
    console.log(`${problems} thing${problems === 1 ? "" : "s"} to fix, listed above.`);
    console.log("After fixing: STOP the running server (Ctrl+C) and start it again —");
    console.log("the key is read once, when the server boots.\n");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
