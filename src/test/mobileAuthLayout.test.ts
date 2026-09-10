import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile auth layout", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Auth.tsx"), "utf8");

  it("adds mobile-only spacing and touch-target adjustments", () => {
    const authPanel = source.match(/<div className="flex-1 flex flex-col items-center[^>]+>/)?.[0] ?? "";

    expect(source).toContain("max-md:min-h-[100svh]");
    expect(source).toContain("max-md:overflow-y-auto");
    expect(authPanel).toContain("max-md:justify-center");
    expect(source).toContain("max-md:px-4");
    expect(source).toContain("max-md:py-8");
    expect(source).toContain("max-md:p-5");
    expect(source).toContain("max-md:mb-7");
    expect(source).toContain("max-md:h-12");
  });
});
