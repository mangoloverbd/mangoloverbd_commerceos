import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("products COG input layout", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");

  it("shows COG as text until clicked, then saves the edit on Enter", () => {
    expect(source).toContain("editingCogFor === product.id");
    expect(source).toContain("setEditingCogFor(product.id)");
    expect(source).toContain("setCogEdits(p => ({ ...p, [product.id]: String(product.cog ?? 0) }))");
    expect(source).toContain("onKeyDown={e => e.key === \"Enter\" && saveCog(product)}");
    expect(source).toContain("data-testid={`button-edit-cog-${product.id}`}");
    expect(source).toContain('className="h-8 w-full border-b border-black/25 bg-transparent pl-6 pr-2');
    expect(source).not.toContain('rounded-[8px] bg-black/[0.04] pl-6 pr-2');
  });

  it("keeps product table cost and live badge visually compact", () => {
    expect(source).toContain("[appearance:textfield]");
    expect(source).toContain("[&::-webkit-inner-spin-button]:appearance-none");
    expect(source).toContain("font-mono text-[13px] tabular-nums text-black");
    expect(source).toContain("rounded-[8px] bg-emerald-50");
  });

  it("uses the custom website import icon and 8px variant corners", () => {
    expect(source).toContain("function WebsiteImportIcon()");
    expect(source).toContain('clipPath id="clip0_4418_8228"');
    expect(source).toContain("<WebsiteImportIcon />");
    expect(source).not.toContain("<Globe2 className=\"h-4 w-4 text-black/60\" />");
    expect(source).toContain("items-center gap-1.5 rounded-[8px]");
    expect(source).not.toContain("items-center gap-1.5 rounded-[12px]");
    expect(source).not.toContain("rounded-full border border-dashed");
  });
});
