import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("database migration boundary", () => {
  it("does not run schema DDL or call the Management API at application startup", async () => {
    const server = await readFile(resolve(process.cwd(), "server/index.js"), "utf8");

    expect(server).not.toContain("api.supabase.com/v1/projects/");
    expect(server).not.toContain('app.post("/api/db-setup"');
    expect(server).not.toContain('app.get("/api/db-setup-sql"');
    expect(server).not.toMatch(/await migrate[A-Z][A-Za-z]+\(\)/);
    expect(server).not.toMatch(/migrate[A-Z][A-Za-z]+\(\)\.catch/);
  });
});
