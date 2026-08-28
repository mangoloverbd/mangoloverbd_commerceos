import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = resolve(process.cwd(), "scripts/verify-supabase-project.mjs");
const PROJECT_REF = "ldiktvcavyabivpxfwpn";
const tempRoots: string[] = [];

function createFixture({
  supabaseRef = PROJECT_REF,
  codexRef = PROJECT_REF,
}: {
  supabaseRef?: string;
  codexRef?: string;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "supabase-project-preflight-"));
  tempRoots.push(root);
  mkdirSync(join(root, "supabase"), { recursive: true });
  mkdirSync(join(root, ".codex"), { recursive: true });
  writeFileSync(join(root, "supabase", "config.toml"), `project_id = "${supabaseRef}"\n`);
  writeFileSync(
    join(root, ".codex", "config.toml"),
    `[mcp_servers.supabase]\nurl = "https://mcp.supabase.com/mcp?project_ref=${codexRef}&features=database"\n`,
  );
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        supabase: {
          type: "http",
          url: `https://mcp.supabase.com/mcp?project_ref=${codexRef}&features=database`,
        },
      },
    }),
  );
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Supabase project preflight", () => {
  it("accepts matching project references without printing credentials", () => {
    const root = createFixture();
    const secret = "must-not-appear";

    const output = execFileSync(process.execPath, [SCRIPT_PATH, "--root", root], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
        SUPABASE_SERVICE_ROLE_KEY: secret,
      },
    });

    expect(output).toContain(`Supabase project preflight passed: ${PROJECT_REF}`);
    expect(output).not.toContain(secret);
  });

  it("fails closed when any configured project reference differs", () => {
    const root = createFixture({ codexRef: "wrongprojectref12345" });

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root], {
      encoding: "utf8",
      env: { ...process.env, SUPABASE_URL: `https://${PROJECT_REF}.supabase.co` },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Supabase project reference mismatch");
    expect(result.stderr).toContain(".codex/config.toml");
  });

  it("fails closed when Claude MCP points at another project", () => {
    const root = createFixture();
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          supabase: {
            type: "http",
            url: "https://mcp.supabase.com/mcp?project_ref=wrongprojectref12345&features=database",
          },
        },
      }),
    );

    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root], {
      encoding: "utf8",
      env: { ...process.env, SUPABASE_URL: `https://${PROJECT_REF}.supabase.co` },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Supabase project reference mismatch");
    expect(result.stderr).toContain(".mcp.json");
  });

  it("fails closed when SUPABASE_URL is missing or malformed", () => {
    const root = createFixture();
    const env = { ...process.env };
    delete env.SUPABASE_URL;

    const missing = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root], {
      encoding: "utf8",
      env,
    });
    const malformed = spawnSync(process.execPath, [SCRIPT_PATH, "--root", root], {
      encoding: "utf8",
      env: { ...process.env, SUPABASE_URL: "https://example.com" },
    });

    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("SUPABASE_URL is required");
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain("SUPABASE_URL does not contain a Supabase project reference");
  });
});
