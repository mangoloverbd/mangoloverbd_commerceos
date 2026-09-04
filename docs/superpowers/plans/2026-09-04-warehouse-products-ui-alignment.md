# Warehouse Products-Style UI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor warehouse list, detail, and dialog surfaces so they visually and behaviorally match the existing Products page.

**Architecture:** Keep all existing warehouse APIs and query boundaries. Add small warehouse-only presentation helpers, then rebuild the list and detail screens with the same page shell, metric cards, compact toolbar, responsive tables, controls, and operational states used by Products; restyle the shared dialog using established customer overlay patterns.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, React Router v6, Tailwind CSS, Framer Motion, Phosphor Icons, shadcn/Base UI components, Vitest, Testing Library.

## Global Constraints

- Products is the primary visual reference; Customers supplies overlay patterns and Inbox Orders supplies dense operational feedback.
- Use `apiFetch()` for every authenticated request.
- Keep the fixed Mango Lover BD workspace guard server-side; never send or accept an organization identifier in these UI flows.
- Use Phosphor icons with `weight="light"`.
- Use the existing system font, tokens, controls, and `#FAFAF8`; add no fonts, shadows, or design tokens.
- Respect `useReducedMotion` and preserve keyboard and narrow-screen access.
- Do not change warehouse APIs, schema, inventory transfers, analytics, storefront code, or reference-page styling.

---

### Task 1: Warehouse presentation primitives and dialog

**Files:**
- Create: `src/components/warehouse/WarehouseMetric.tsx`
- Modify: `src/components/WarehouseDialog.tsx`
- Test: `src/test/warehouseDialog.test.tsx`

**Interfaces:**
- Consumes: `Warehouse` from `src/hooks/useWarehouses.ts`, `apiFetch`, shared toast and Base UI controls.
- Produces: `WarehouseMetric({ label, value, detail, icon })` and the existing `WarehouseDialog({ open, warehouse, onClose, onSaved })` contract.

- [ ] **Step 1: Write failing dialog and metric tests**

```tsx
it("renders the Products-style warehouse metric", () => {
  render(<WarehouseMetric label="Warehouses" value={3} detail="Active locations" icon={<Warehouse weight="light" />} />);
  expect(screen.getByText("Warehouses")).toHaveClass("uppercase", "tracking-wider");
  expect(screen.getByText("3")).toHaveClass("text-2xl", "tabular-nums");
});

it("submits a create payload and disables save while pending", async () => {
  let resolveRequest!: () => void;
  apiFetch.mockReturnValue(new Promise<Response>((resolve) => { resolveRequest = () => resolve(new Response("{}", { status: 200 })); }));
  renderDialog({ warehouse: null });
  await user.type(screen.getByLabelText("Warehouse name"), "North Hub");
  await user.click(screen.getByRole("button", { name: "Save warehouse" }));
  expect(screen.getByRole("button", { name: "Saving warehouse" })).toBeDisabled();
  resolveRequest();
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/warehouses", expect.objectContaining({ method: "POST" })));
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npx vitest run src/test/warehouseDialog.test.tsx`

Expected: FAIL because `WarehouseMetric` does not exist and the current dialog lacks the shared controls and accessible labels.

- [ ] **Step 3: Add the metric primitive**

```tsx
export function WarehouseMetric({ label, value, detail, icon }: WarehouseMetricProps) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-black/[0.04] p-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-black/50">{label}</p>
        <span className="text-black/35">{icon}</span>
      </div>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-black">{value}</p>
      <p className="mt-0.5 truncate text-[12px] text-black/40">{detail}</p>
    </div>
  );
}
```

- [ ] **Step 4: Restyle the dialog without changing its API behavior**

Use `AnimatePresence`, `motion`, and `useReducedMotion`; apply the customer overlay backdrop (`fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]`) and a `max-w-lg rounded-[24px] bg-[#FAFAF8]` panel. Use project `Input`, `Checkbox`, `Button`, `RichButton`, and `Spinner` components. Add `aria-label="Warehouse name"`, accessible close/save labels, Escape and outside-pointer close, autofocus on name, and preserve values on request failure.

- [ ] **Step 5: Run the focused test**

Run: `npx vitest run src/test/warehouseDialog.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the dialog unit**

```bash
git add src/components/warehouse/WarehouseMetric.tsx src/components/WarehouseDialog.tsx src/test/warehouseDialog.test.tsx
git commit -m "refactor: align warehouse dialog with product UI"
```

### Task 2: Products-style warehouse list

**Files:**
- Modify: `src/pages/Warehouses.tsx`
- Replace: `src/test/warehousePageRouting.test.ts` with route plus behavior coverage

**Interfaces:**
- Consumes: `useWarehouses()`, `WarehouseMetric`, `WarehouseDialog`, `apiFetch`, `useNavigate()`.
- Produces: the existing default `Warehouses` page with searchable warehouse rows and unchanged CRUD endpoints.

- [ ] **Step 1: Write failing list behavior tests**

```tsx
it("renders Products-style metrics and filters warehouses", async () => {
  renderWarehouses();
  expect(await screen.findByText("Warehouse directory")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  await user.type(screen.getByTestId("input-search-warehouses"), "north");
  expect(screen.getByText("North Hub")).toBeInTheDocument();
  expect(screen.queryByText("Main Warehouse")).not.toBeInTheDocument();
});

it("protects the default warehouse and navigates from another row", async () => {
  renderWarehouses();
  expect(await screen.findByLabelText("Delete Main Warehouse")).toBeDisabled();
  await user.click(screen.getByTestId("row-warehouse-north"));
  expect(navigate).toHaveBeenCalledWith("/warehouses/north");
});
```

- [ ] **Step 2: Run the list tests and confirm failure**

Run: `npx vitest run src/test/warehousePageRouting.test.ts`

Expected: FAIL because metrics, search, styled controls, and accessible actions are absent.

- [ ] **Step 3: Rebuild the page shell and summary row**

Use the Products outer shell exactly: `min-h-full`, system-font wrapper, then `min-h-full space-y-5 bg-white p-1 lg:p-2`. Compute total warehouses, total assigned products, default name, and contact-complete count with `useMemo`; render four `WarehouseMetric` components in `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`.

- [ ] **Step 4: Add toolbar, search, table, and states**

Build a `rounded-2xl bg-white` table surface with a separator toolbar. Add title “Warehouse directory”, result count pill, `Input` with `data-testid="input-search-warehouses"`, and `RichButton` labelled “New Warehouse”. Filter name, address, contact person, and phone case-insensitively. Render Products-style header/rows, textual Default/Active pills, keyboard row navigation, disabled default deletion, skeleton loading rows, distinct repository-empty and search-empty states, and horizontal overflow on small screens.

- [ ] **Step 5: Run the list tests**

Run: `npx vitest run src/test/warehousePageRouting.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the list unit**

```bash
git add src/pages/Warehouses.tsx src/test/warehousePageRouting.test.ts
git commit -m "refactor: match warehouse list to products page"
```

### Task 3: Products-style warehouse detail

**Files:**
- Modify: `src/pages/WarehouseDetail.tsx`
- Replace: `src/test/warehouseDetailPage.test.ts` with behavior coverage

**Interfaces:**
- Consumes: `GET /api/warehouses/:id`, `GET /api/orders?warehouse_id=:id`, `POST /api/products/bulk-assign-warehouse`, `WarehouseMetric`, `WarehouseDialog`, and `OrdersTable`.
- Produces: the existing default `WarehouseDetail` page with Products-style metrics and inventory table.

- [ ] **Step 1: Write failing detail behavior tests**

```tsx
it("renders warehouse identity, metrics, and the shared orders table", async () => {
  renderDetail();
  expect(await screen.findByRole("heading", { name: "Main Warehouse" })).toBeInTheDocument();
  expect(screen.getByText("Products assigned")).toBeInTheDocument();
  expect(screen.getByTestId("warehouse-products-table")).toBeInTheDocument();
  expect(ordersTable).toHaveBeenCalled();
});

it("removes only explicitly assigned products", async () => {
  renderDetail();
  expect(await screen.findByLabelText("Remove Explicit Mango from warehouse")).toBeEnabled();
  expect(screen.queryByLabelText("Remove Fallback Mango from warehouse")).not.toBeInTheDocument();
  await user.click(screen.getByLabelText("Remove Explicit Mango from warehouse"));
  expect(apiFetch).toHaveBeenCalledWith("/api/products/bulk-assign-warehouse", expect.objectContaining({ method: "POST" }));
});
```

- [ ] **Step 2: Run the detail tests and confirm failure**

Run: `npx vitest run src/test/warehouseDetailPage.test.ts`

Expected: FAIL because the current detail screen uses plain stacked rows and exposes removal for fallback products.

- [ ] **Step 3: Rebuild identity, state, and metrics**

Use the Products page shell and system font. Render a compact back button, warehouse icon/name, Default/Active pill, address and contact metadata, and `RichButton` edit action. Render three `WarehouseMetric` cards for product count, total stock, and published count. Use `Spinner` and centered descriptive text for loading, query error, and missing warehouse states.

- [ ] **Step 4: Replace stacked products with a responsive inventory table**

Add `data-testid="warehouse-products-table"` and columns for Product, Assignment, Weight, Stock, Publication, and Actions. Use restrained pills for Explicit/Default fallback and Published/Draft. Show “No weight” visibly. Only render the remove button when `assigned_explicitly === true`; disable it during mutation, parse API error text, toast failures, and refetch detail after success.

- [ ] **Step 5: Preserve the shared orders table and dialog**

Keep `<OrdersTable orders={...} loading={...} onStatusUpdate={...} onOrderUpdate={...} />`, wrap it in the same rounded operational surface, and continue invalidating `[WAREHOUSES_QUERY_KEY]` after dialog saves.

- [ ] **Step 6: Run detail tests**

Run: `npx vitest run src/test/warehouseDetailPage.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the detail unit**

```bash
git add src/pages/WarehouseDetail.tsx src/test/warehouseDetailPage.test.ts
git commit -m "refactor: align warehouse detail with inventory UI"
```

### Task 4: Accessibility and regression verification

**Files:**
- Modify if required by failures: `src/pages/Warehouses.tsx`
- Modify if required by failures: `src/pages/WarehouseDetail.tsx`
- Modify if required by failures: `src/components/WarehouseDialog.tsx`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified warehouse UI with no API or schema changes.

- [ ] **Step 1: Run all warehouse and product-adjacent tests**

Run:

```bash
npx vitest run src/test/warehouseDialog.test.tsx src/test/warehousePageRouting.test.ts src/test/warehouseDetailPage.test.ts src/test/useWarehouses.test.tsx src/test/warehouseApiRoutes.test.ts src/test/warehouseDetailApi.test.ts src/test/productsWarehouseColumn.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the project regression suite excluding the sandbox-only local PostgreSQL test**

Run: `npx vitest run --exclude src/test/order-items.test.ts`

Expected: PASS. The excluded suite requires System V shared memory, which the current workspace sandbox denies.

- [ ] **Step 3: Run lint and build**

Run: `npm run lint && npm run build`

Expected: ESLint exits zero with only the repository's existing warnings; Vite build succeeds.

- [ ] **Step 4: Inspect the diff**

Run: `git diff --check && git diff -- src/pages/Warehouses.tsx src/pages/WarehouseDetail.tsx src/components/WarehouseDialog.tsx src/components/warehouse/WarehouseMetric.tsx`

Expected: no whitespace errors; the diff contains UI/test changes only and no API or schema changes.

- [ ] **Step 5: Commit verification fixes if any**

```bash
git add src/pages/Warehouses.tsx src/pages/WarehouseDetail.tsx src/components/WarehouseDialog.tsx src/components/warehouse/WarehouseMetric.tsx src/test/warehouseDialog.test.tsx src/test/warehousePageRouting.test.ts src/test/warehouseDetailPage.test.ts
git commit -m "test: verify warehouse UI alignment"
```
