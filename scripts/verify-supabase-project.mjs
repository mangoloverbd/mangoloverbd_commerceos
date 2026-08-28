#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseRoot(argv) {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex === -1) return process.cwd();
  const value = argv[rootIndex + 1];
  if (!value) throw new Error("--root requires a directory path");
  return resolve(value);
}

function parseSupabaseConfigRef(content) {
  const match = content.match(/^\s*project_id\s*=\s*["']([^"']+)["']/m);
  return match?.[1] || null;
}

function parseCodexConfigRef(content) {
  const urlMatch = content.match(/^\s*url\s*=\s*["']([^"']+)["']/m);
  if (!urlMatch) return null;
  try {
    return new URL(urlMatch[1]).searchParams.get("project_ref");
  } catch {
    return null;
  }
}

function parseClaudeMcpRef(content) {
  try {
    const config = JSON.parse(content);
    const value = config?.mcpServers?.supabase?.url;
    if (typeof value !== "string") return null;
    return new URL(value).searchParams.get("project_ref");
  } catch {
    return null;
  }
}

function parseSupabaseUrlRef(value) {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname;
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function main() {
  let root;
  try {
    root = parseRoot(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  if (!process.env.SUPABASE_URL) {
    loadEnv({ path: resolve(root, ".env"), quiet: true });
  }

  if (!process.env.SUPABASE_URL) {
    fail("SUPABASE_URL is required for the Supabase project preflight");
    return;
  }

  const envRef = parseSupabaseUrlRef(process.env.SUPABASE_URL);
  if (!envRef) {
    fail("SUPABASE_URL does not contain a Supabase project reference");
    return;
  }

  const files = [
    {
      label: "supabase/config.toml",
      path: resolve(root, "supabase/config.toml"),
      parse: parseSupabaseConfigRef,
    },
    {
      label: ".codex/config.toml",
      path: resolve(root, ".codex/config.toml"),
      parse: parseCodexConfigRef,
    },
    {
      label: ".mcp.json",
      path: resolve(root, ".mcp.json"),
      parse: parseClaudeMcpRef,
    },
  ];

  const refs = [{ label: "SUPABASE_URL", ref: envRef }];
  for (const file of files) {
    let content;
    try {
      content = await readFile(file.path, "utf8");
    } catch {
      fail(`Required Supabase configuration is missing: ${file.label}`);
      return;
    }
    refs.push({ label: file.label, ref: file.parse(content) });
  }

  const invalid = refs.find(({ ref }) => !ref || !PROJECT_REF_PATTERN.test(ref));
  if (invalid) {
    fail(`Could not read a valid Supabase project reference from ${invalid.label}`);
    return;
  }

  const mismatch = refs.find(({ ref }) => ref !== envRef);
  if (mismatch) {
    fail(
      `Supabase project reference mismatch: ${mismatch.label} points to ${mismatch.ref}, expected ${envRef}`,
    );
    return;
  }

  process.stdout.write(`Supabase project preflight passed: ${envRef}\n`);
}

await main();
