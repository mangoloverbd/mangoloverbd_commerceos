import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const rootDir = process.cwd();
const oldBrand = ["Arc", " Lab"].join("");
const searchableExtensions = new Set([
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".ts",
  ".tsx",
]);
const ignoredDirs = new Set([".git", "dist", "node_modules"]);

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (ignoredDirs.has(entry)) return [];

    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) return collectFiles(fullPath);
    if (!stats.isFile()) return [];

    const extension = entry.slice(entry.lastIndexOf("."));
    return searchableExtensions.has(extension) ? [fullPath] : [];
  });
}

describe("product branding", () => {
  test("does not contain old product brand references", () => {
    const offenders = collectFiles(rootDir).filter((file) => {
      const content = readFileSync(file, "utf8");
      return content.includes(oldBrand);
    });

    expect(offenders.map((file) => relative(rootDir, file))).toEqual([]);
  });
});
