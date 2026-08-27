import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("products COG input layout", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");

  it("shows COG as text until clicked, then saves the edit on Enter", () => {
    expect(source).toContain("editingCogFor === product.id");
    expect(source).toContain("setEditingCogFor(product.id)");
    expect(source).toContain("setCogEdits");
    expect(source).toContain("String(product.cog");
    expect(source).toContain("saveCog(product)");
    expect(source).toContain("data-testid={`button-edit-cog-${product.id}`}");
    expect(source).toContain("border-b border-black/25 bg-transparent");
  });

  it("keeps product table cost and live badge visually compact", () => {
    expect(source).toContain("[appearance:textfield]");
    expect(source).toContain("[&::-webkit-inner-spin-button]:appearance-none");
    expect(source).toContain("font-mono text-[13px]");
    expect(source).toContain("tabular-nums");
  });

  it("uses the custom website import icon and 8px variant corners", () => {
    expect(source).toContain("function WebsiteImportIcon()");
    expect(source).toContain('clipPath id="clip0_4418_8228"');
    expect(source).toContain("<WebsiteImportIcon />");
    expect(source).toContain("rounded-[8px]");
  });
});
