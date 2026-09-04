# Warehouse Add-Products Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Add products" dialog on the warehouse detail page that assigns unassigned products to the warehouse via the existing bulk-assign API.

**Architecture:** New `AddProductsDialog` component under `src/components/warehouse/` following the existing `WarehouseDialog` overlay/focus/toast patterns; a toolbar button in `src/pages/WarehouseDetail.tsx` opens it. No API or schema changes.

**Tech Stack:** React 18, TypeScript, TanStack Query (not needed — local fetch on open), Tailwind, Framer Motion, Phosphor (`weight="light"`), Vitest + Testing Library.

## Global Constraints

- Use `apiFetch()` from `src/lib/api.ts` for every authenticated request.
- Keep the fixed Mango Lover BD workspace guard server-side; never send or accept an organization identifier in these UI flows.
- Use Phosphor icons with `weight="light"`.
- Use the existing system font, tokens, controls, and `#FAFAF8`; add no fonts, shadows, or design tokens.
- Respect `useReducedMotion` and preserve keyboard and narrow-screen access.
- Do not change warehouse APIs, schema, inventory transfers, analytics, storefront code, or reference-page styling.

---

### Task 1: AddProductsDialog component

**Files:**
- Create: `src/components/warehouse/AddProductsDialog.tsx`
- Test: `src/test/addProductsDialog.test.tsx`

**Interfaces:**
- Consumes: `apiFetch()` from `@/lib/api`; `GET /api/products` returns `{ products: Array<{ id: string; name: string; selling_price: number | null; stock_quantity: number | null; warehouse_id: string | null }> }`; `POST /api/products/bulk-assign-warehouse` accepts `{ product_ids: string[], warehouse_id: string }` and returns `{ updated: number }` on success or `{ error: string }` on failure.
- Produces: `AddProductsDialog({ open, warehouseId, warehouseName, onClose, onAssigned })` where `onAssigned: () => Promise<unknown> | void`. Eligible list = products with `warehouse_id !== warehouseId`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddProductsDialog } from "@/components/warehouse/AddProductsDialog";

const apiFetch = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({ toast }));

const products = [
  { id: "p1", name: "Sundarbans Honey", selling_price: 800, stock_quantity: 12, warehouse_id: null },
  { id: "p2", name: "Chia Seed", selling_price: 650, stock_quantity: 7, warehouse_id: "other-warehouse" },
  { id: "p3", name: "Already Here", selling_price: 500, stock_quantity: 3, warehouse_id: "main" },
];

function renderDialog() {
  return render(
    <AddProductsDialog open warehouseId="main" warehouseName="Main Warehouse" onClose={vi.fn()} onAssigned={vi.fn()} />,
  );
}

describe("add products dialog", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/products") return { ok: true, json: async () => ({ products }) };
      return { ok: true, json: async () => ({}) };
    });
  });

  it("lists only products not assigned to this warehouse and filters by search", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(await screen.findByText("Sundarbans Honey")).toBeInTheDocument();
    expect(screen.getByText("Chia Seed")).toBeInTheDocument();
    expect(screen.queryByText("Already Here")).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search products" }), "chia");
    expect(screen.queryByText("Sundarbans Honey")).not.toBeInTheDocument();
    expect(screen.getByText("Chia Seed")).toBeInTheDocument();
  });

  it("assigns selected products and closes on success", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAssigned = vi.fn();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/products") return { ok: true, json: async () => ({ products }) };
      if (url === "/api/products/bulk-assign-warehouse" && init?.method === "POST") {
        return { ok: true, json: async () => ({ updated: 2 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(
      <AddProductsDialog open warehouseId="main" warehouseName="Main Warehouse" onClose={onClose} onAssigned={onAssigned} />,
    );
    await user.click(await screen.findByRole("checkbox", { name: /Sundarbans Honey/ }));
    await user.click(screen.getByRole("checkbox", { name: /Chia Seed/ }));
    await user.click(screen.getByRole("button", { name: "Assign 2 products" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/bulk-assign-warehouse",
      expect.objectContaining({ method: "POST" }),
    ));
    const call = apiFetch.mock.calls.find(([url]) => url === "/api/products/bulk-assign-warehouse");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ product_ids: ["p1", "p2"], warehouse_id: "main" });
    expect(onAssigned).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and reports API errors", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/products") return { ok: true, json: async () => ({ products }) };
      if (url === "/api/products/bulk-assign-warehouse") {
        return { ok: false, json: async () => ({ error: "Warehouse not found" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(
      <AddProductsDialog open warehouseId="main" warehouseName="Main Warehouse" onClose={onClose} onAssigned={vi.fn()} />,
    );
    await user.click(await screen.findByRole("checkbox", { name: /Sundarbans Honey/ }));
    await user.click(screen.getByRole("button", { name: "Assign 1 product" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Warehouse not found"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Sundarbans Honey/ })).toBeChecked();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/addProductsDialog.test.tsx`
Expected: FAIL with "Failed to resolve import @/components/warehouse/AddProductsDialog"

- [ ] **Step 3: Write minimal implementation**

Create `src/components/warehouse/AddProductsDialog.tsx`. Mirror `src/components/WarehouseDialog.tsx` overlay structure exactly: `AnimatePresence` + backdrop `motion.div` with class `fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]`, pointer-down outside close, Escape close (disabled while assigning), panel `max-h-[88vh] w-full max-w-lg overflow-hidden rounded-[24px] border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15`, header with `role="dialog" aria-modal="true" aria-labelledby="add-products-dialog-title"`.

Component contract:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Package, Plus, X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RichButton } from "@/components/ui/rich-button";
import { Spinner } from "@/components/ui/ios-spinner";

type PickerProduct = {
  id: string;
  name: string;
  selling_price: number | null;
  stock_quantity: number | null;
  warehouse_id: string | null;
};

export function AddProductsDialog({ open, warehouseId, warehouseName, onClose, onAssigned }: {
  open: boolean;
  warehouseId: string;
  warehouseName: string;
  onClose: () => void;
  onAssigned: () => Promise<unknown> | void;
}) {
  const reduce = useReducedMotion();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<PickerProduct[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected([]);
    setProducts(null);
    setLoadError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch("/api/products");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Failed to load products");
        if (!cancelled) setProducts(Array.isArray(body?.products) ? body.products : []);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to load products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !assigning) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [assigning, onClose, open]);

  const eligible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (products ?? [])
      .filter((product) => product.warehouse_id !== warehouseId)
      .filter((product) => !query || product.name.toLowerCase().includes(query));
  }, [products, search, warehouseId]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function assign() {
    if (selected.length === 0 || assigning) return;
    setAssigning(true);
    try {
      const response = await apiFetch("/api/products/bulk-assign-warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: selected, warehouse_id: warehouseId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Failed to assign products");
      await onAssigned();
      toast.success(selected.length === 1 ? "Product assigned" : `${selected.length} products assigned`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign products");
    } finally {
      setAssigning(false);
    }
  }

  // ... render per Task 1 Step 3 render block below
}
```

Render block (inside `return`, replacing the `// ... render` comment). Use these exact accessible names so the tests pass:

```tsx
return (
  <AnimatePresence>
    {open ? (
      <motion.div
        key="add-products-dialog-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.2 }}
        className="fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget && !assigning) onClose();
        }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-products-dialog-title"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97, filter: "blur(4px)" }}
          transition={{ duration: reduce ? 0.12 : 0.24, ease: "easeOut" }}
          className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-[24px] border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15"
        >
          <div className="flex items-center justify-between border-b border-black/[0.08] bg-white px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.05] text-black/60">
                <Package size={20} weight="light" />
              </span>
              <div>
                <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/35">Add to {warehouseName}</p>
                <h2 id="add-products-dialog-title" className="mt-0.5 text-[20px] font-bold tracking-tight text-black">
                  Add products
                </h2>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={assigning} aria-label="Close add products dialog" className="flex h-9 w-9 items-center justify-center rounded-xl text-black/35 transition-colors hover:bg-black/[0.04] hover:text-black disabled:opacity-40">
              <X size={18} weight="light" />
            </button>
          </div>

          <div className="max-h-[calc(88vh-82px)] overflow-y-auto p-5">
            <Input ref={searchRef} role="searchbox" aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products…" className="h-10 rounded-[12px] border-black/10 bg-white px-3 text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-black/20" />
            <div className="mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-black/40"><Spinner className="mr-2" /><span className="text-[13px]">Loading products…</span></div>
              ) : loadError ? (
                <div className="py-10 text-center">
                  <p className="text-[13px] font-medium text-black">{loadError}</p>
                  <button type="button" onClick={() => { setLoadError(null); setLoading(true); void apiFetch("/api/products").then((r) => r.json().catch(() => ({}))).then((body) => setProducts(Array.isArray(body?.products) ? body.products : [])).catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Failed to load products")).finally(() => setLoading(false)); }} className="mt-2 text-[12px] font-medium underline underline-offset-4">Try again</button>
                </div>
              ) : eligible.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-black/45">All products are already assigned here.</p>
              ) : (
                <ul className="space-y-2">
                  {eligible.map((product) => (
                    <li key={product.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/[0.06] bg-white p-3">
                        <Checkbox checked={selected.includes(product.id)} onCheckedChange={() => toggle(product.id)} aria-label={product.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-black">{product.name}</span>
                          <span className="mt-0.5 block text-[11px] text-black/40">
                            {product.selling_price == null ? "Price not set" : `৳${product.selling_price.toLocaleString()}`} · {product.stock_quantity ?? 0} in stock
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-black/[0.06] pt-4">
              <Button type="button" variant="ghost" onClick={onClose} disabled={assigning} className="h-10 rounded-xl px-4 text-[12px] font-medium">Cancel</Button>
              <RichButton type="button" onClick={() => void assign()} disabled={assigning || selected.length === 0} aria-label={assigning ? "Assigning products" : selected.length === 0 ? "Assign products" : `Assign ${selected.length} product${selected.length === 1 ? "" : "s"}`} className="h-10 min-w-[132px] justify-center rounded-xl bg-black px-4 text-[12px] text-white hover:bg-black">
                {assigning ? <><Spinner className="mr-2 text-white" />Assigning…</> : <><Plus size={14} weight="light" />{selected.length === 0 ? "Assign products" : `Assign ${selected.length} product${selected.length === 1 ? "" : "s"}`}</>}
              </RichButton>
            </div>
          </div>
        </motion.div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);
```

Notes:
- `Input` from `@/components/ui/input` forwards `role` and `aria-label`; `Checkbox` from `@/components/ui/checkbox` forwards `aria-label` (same usage as `WarehouseDialog.tsx:143`).
- The retry button reuses the same fetch shape; keep it inline as written.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/addProductsDialog.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/warehouse/AddProductsDialog.tsx src/test/addProductsDialog.test.tsx
git commit -m "feat: add warehouse add-products dialog"
```

---

### Task 2: Wire the picker into WarehouseDetail

**Files:**
- Modify: `src/pages/WarehouseDetail.tsx`
- Test: `src/test/warehouseDetailPage.test.tsx` (extend)

**Interfaces:**
- Consumes: `AddProductsDialog` from `@/components/warehouse/AddProductsDialog` with props `{ open, warehouseId, warehouseName, onClose, onAssigned }`.
- Produces: unchanged page contract plus an "Add products" button (`aria-label="Add products"`) in the inventory header and the dialog mounted at the page root.

- [ ] **Step 1: Write the failing test**

Append to the existing `describe("warehouse detail")` block in `src/test/warehouseDetailPage.test.tsx`:

```tsx
it("opens the add-products picker and assigns the selection", async () => {
  const user = userEvent.setup();
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/warehouses/main") return { ok: true, json: async () => detail };
    if (url === "/api/orders?warehouse_id=main") return { ok: true, json: async () => ({ orders: [] }) };
    if (url === "/api/products") {
      return {
        ok: true,
        json: async () => ({ products: [{ id: "new-one", name: "New Mango", selling_price: 900, stock_quantity: 5, warehouse_id: null }] }),
      };
    }
    if (url === "/api/products/bulk-assign-warehouse" && init?.method === "POST") {
      return { ok: true, json: async () => ({ updated: 1 }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  renderDetail();
  await screen.findByRole("heading", { name: "Main Warehouse" });
  await user.click(screen.getByRole("button", { name: "Add products" }));
  await user.click(await screen.findByRole("checkbox", { name: /New Mango/ }));
  await user.click(screen.getByRole("button", { name: "Assign 1 product" }));
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
    "/api/products/bulk-assign-warehouse",
    expect.objectContaining({ method: "POST" }),
  ));
  const call = apiFetch.mock.calls.find(([url]) => url === "/api/products/bulk-assign-warehouse");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ product_ids: ["new-one"], warehouse_id: "main" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/warehouseDetailPage.test.tsx`
Expected: FAIL with "Unable to find an accessible element with the role button and name Add products"

- [ ] **Step 3: Write minimal implementation**

In `src/pages/WarehouseDetail.tsx`:
1. Add import: `import { AddProductsDialog } from "@/components/warehouse/AddProductsDialog";` alongside the existing `WarehouseMetric` import (line 19).
2. Add state next to `editOpen` (line 54): `const [addOpen, setAddOpen] = useState(false);`
3. In the inventory section header (lines 151–155), add the button after the count pill:

```tsx
<div className="flex items-center gap-2 border-b border-[color:var(--color-separator-border)] px-5 py-4">
  <Package size={17} weight="light" className="text-black/60" />
  <h2 className="text-[14px] font-semibold text-black">Inventory at this warehouse</h2>
  <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-black/60">{data.products.length}</span>
  <span className="flex-1" />
  <RichButton type="button" onClick={() => setAddOpen(true)} aria-label="Add products" className="h-8 rounded-lg px-2.5 text-[11px]">
    <Plus size={14} weight="light" /> Add products
  </RichButton>
</div>
```

4. Add `Plus` to the existing Phosphor import (lines 5–15).
5. Mount the dialog next to the existing `WarehouseDialog` at the page root (after line 189):

```tsx
<AddProductsDialog
  open={addOpen}
  warehouseId={data.warehouse.id}
  warehouseName={data.warehouse.name}
  onClose={() => setAddOpen(false)}
  onAssigned={async () => {
    await Promise.all([detail.refetch(), queryClient.invalidateQueries({ queryKey: [WAREHOUSES_QUERY_KEY] })]);
  }}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/warehouseDetailPage.test.tsx src/test/addProductsDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/WarehouseDetail.tsx src/test/warehouseDetailPage.test.tsx
git commit -m "feat: wire add-products picker into warehouse detail"
```

---

### Task 3: Regression verification

**Files:** none (verification only).

- [ ] **Step 1: Run warehouse and product-adjacent tests**

Run:
```bash
npx vitest run src/test/addProductsDialog.test.tsx src/test/warehouseDetailPage.test.tsx src/test/warehouseDialog.test.tsx src/test/warehousePageRouting.test.tsx src/test/useWarehouses.test.tsx src/test/warehouseApiRoutes.test.ts src/test/warehouseDetailApi.test.ts src/test/productsWarehouseColumn.test.tsx src/test/productWeightForm.test.tsx src/test/orderRoutingWiring.test.ts
```
Expected: PASS, except the known pre-existing failure `warehouseDialog.test.tsx > renders a compact Products-style metric` (expects `tracking-wider`; component uses `tracking-[0.3em]`). That failure exists on `main` before this plan and must not be "fixed" inside this plan.

- [ ] **Step 2: Run lint and build**

Run: `npm run lint && npm run build`
Expected: ESLint exits zero; Vite build succeeds.

- [ ] **Step 3: Inspect the diff**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; changed files are only `src/components/warehouse/AddProductsDialog.tsx`, `src/test/addProductsDialog.test.tsx`, `src/pages/WarehouseDetail.tsx`, `src/test/warehouseDetailPage.test.tsx`.
