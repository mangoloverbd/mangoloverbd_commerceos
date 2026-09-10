# Merchant Suite Mobile Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Home/orders, order editor, social inbox, products, and customers workflows usable on phone widths while leaving desktop behavior unchanged.

**Architecture:** Add a mobile-only shell navigation component and mobile presentation branches beside the existing desktop presentations. Reuse the existing queries, mutations, domain helpers, and router links; do not add API or database work. The shared mobile breakpoint is the existing `useIsMobile()` threshold (`<768px`), and desktop branches remain unchanged for widths at or above 768px.

**Tech Stack:** React 18, TypeScript, React Router v6, Tailwind CSS, Radix Sheet, Phosphor Icons, Framer Motion, TanStack Query, Vitest, Testing Library.

## Global Constraints

- Mobile behavior activates below `768px` only.
- Existing desktop markup, layout, and interactions remain the source of truth at `768px` and above.
- Do not change backend, database, or API behavior.
- All frontend API calls continue to use `apiFetch()`.
- Reuse existing domain helpers, status labels, mutations, and data queries.
- Keep touch targets at least 44px where practical.
- Provide accessible labels for icon-only controls and navigation.
- Respect reduced-motion preferences for new transitions.
- Prevent horizontal page overflow on covered mobile workflows.

---

## Test fixtures used by the snippets

Before the feature-specific tests, add small local fixture factories in each
test file (or a shared `src/test/mobileFixtures.ts` if the existing test setup
already supports shared fixtures). The factories must return the real domain
shapes used by the components:

```tsx
function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1", order_number: "ML-1000", customer_name: "Test Customer",
    phone: "01700000000", address: "Dhaka", product: "Mango · ×1", quantity: 1,
    price: 850, status: "pending", created_at: "2026-09-11T08:00:00.000Z",
    fraud_checked: false, fraud_data: null, delivery_rate: 100,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1", name: "Test Product", url: null, image_url: null,
    selling_price: 850, cog: 400, stock_quantity: 12, variants: [],
    published: true, ...overrides,
  } as Product;
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "customer-1", name: "Test Customer", phone: "01700000000",
    totalOrders: 1, totalSpent: 850, averageOrderValue: 850, sources: ["manual"],
    primarySource: "manual", riskLevel: "low", segments: [], lifecycleStage: "new",
    campaignSegments: [], lastOrderAt: "2026-09-11T08:00:00.000Z", timeline: [],
    ...overrides,
  } as Customer;
}
```

Each test file must import the production types it uses and use the existing
`render`/router wrapper from `src/test/setup.ts`; if that wrapper is not
available, define `renderWithRouter` locally with `MemoryRouter` and the
component under test. Do not add a production helper solely to satisfy tests.

### Task 1: Add the mobile shell and bottom navigation

**Files:**
- Create: `src/components/MobileBottomNav.tsx`
- Modify: `src/components/DashboardLayout.tsx:1-155`
- Test: `src/test/mobileNavigation.test.tsx`

**Interfaces:**
- `MobileBottomNav` consumes `useLocation()` and `useSidebar()` and produces five labeled controls: Home (`/overview`), Orders (`/`), Inbox (`/inbox/facebook`), Products (`/products`), and More (toggles the existing mobile sidebar Sheet).
- `DashboardLayout` renders `MobileBottomNav` only for mobile presentation and adds mobile-only content clearance for the fixed bar.
- The existing `AppSidebar` remains mounted so the existing sidebar Sheet is the More destination on mobile; its desktop rendering is untouched.

- [ ] **Step 1: Write the failing navigation tests**

```tsx
it("exposes the five mobile destinations with accessible labels", () => {
  renderWithRouter(<MobileBottomNav />, { initialEntries: ["/"] });
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/overview");
  expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox/facebook");
  expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/products");
  expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
});

it("marks the current destination", () => {
  renderWithRouter(<MobileBottomNav />, { initialEntries: ["/products"] });
  expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
});
```

Mock `useSidebar()` with `toggleSidebar: vi.fn()` for the More test and use the repository’s existing router/test setup rather than introducing a new test dependency.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/test/mobileNavigation.test.tsx`

Expected: FAIL because `MobileBottomNav` does not exist yet.

- [ ] **Step 3: Implement the mobile-only navigation**

Use Phosphor Icons with `weight="light"`, semantic `Link` elements, a `button` for More, `aria-label`s, `aria-current="page"`, and a class boundary such as `md:hidden`. Apply `padding-bottom: env(safe-area-inset-bottom)` to the bar and keep each control at least 44px high. Use the existing `useSidebar().toggleSidebar()` instead of creating a second menu state.

In `DashboardLayout`, keep the current `AppSidebar`, header, and main desktop classes unchanged. Add the mobile navigation after `SidebarInset` content and add only `md:hidden`/`max-md:` classes to provide bottom clearance and phone-safe shell spacing. Do not alter the existing desktop header height, margins, sidebar, or main content styles.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run src/test/mobileNavigation.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the shell**

```bash
git add src/components/MobileBottomNav.tsx src/components/DashboardLayout.tsx src/test/mobileNavigation.test.tsx
git commit -m "feat: add mobile merchant navigation"
```

### Task 2: Add mobile order cards without changing the desktop table

**Files:**
- Create: `src/components/MobileOrderCards.tsx`
- Modify: `src/components/OrdersTable.tsx:202-211, 1044-1137`
- Modify: `src/pages/Dashboard.tsx` around the existing order controls and `OrdersTable` call near line 1111
- Test: `src/test/mobileOrderCards.test.tsx`

**Interfaces:**
- `MobileOrderCards` accepts `{ orders, loading, selectedIds, onToggleSelection, onToggleSelectAll, onOpenOrder, renderActions }`, where `renderActions(order)` returns the existing per-order action controls. It renders loading, empty, and populated states.
- `OrdersTable` keeps all current desktop table behavior and delegates only the `<768px` presentation to `MobileOrderCards`, passing the same internal handlers and per-order action UI used by the table for fraud, status, courier, print, note, delete, Excel, and selection actions.

- [ ] **Step 1: Write failing card tests**

```tsx
it("renders the mobile order summary and opens the order", async () => {
  const user = userEvent.setup();
  const order = makeOrder({ order_number: "ML-1001", customer_name: "Mango Buyer", price: 1250, status: "confirmed" });
  const onOpenOrder = vi.fn();

  render(<MobileOrderCards orders={[order]} loading={false} selectedIds={new Set()} onToggleSelection={vi.fn()} onToggleSelectAll={vi.fn()} onOpenOrder={onOpenOrder} renderActions={() => null} />);
  expect(screen.getByText("#ML-1001")).toBeInTheDocument();
  expect(screen.getByText("Mango Buyer")).toBeInTheDocument();
  expect(screen.getByText(/৳1,250/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /open order #ML-1001/i }));
  expect(onOpenOrder).toHaveBeenCalledWith(order.id);
});

it("keeps selection separate from opening the order", async () => {
  const user = userEvent.setup();
  const onSelectionChange = vi.fn();
  const order = makeOrder();
  render(<MobileOrderCards orders={[order]} loading={false} selectedIds={new Set()} onToggleSelection={onSelectionChange} onToggleSelectAll={vi.fn()} onOpenOrder={vi.fn()} renderActions={() => null} />);
  await user.click(screen.getByRole("checkbox", { name: /select order/i }));
  expect(onSelectionChange).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/test/mobileOrderCards.test.tsx`

Expected: FAIL because the component and test fixture helper are not implemented.

- [ ] **Step 3: Implement the card presentation**

Reuse `productSummary`, `displayStatusLabel`, courier status helpers, and currency formatting from the existing order component or extract only pure helpers into `src/lib/orderMobileDisplay.ts` with tests. Each card must expose order number/date, customer name/phone, product summary, total using `৳`, order status, fraud state, courier/fulfillment state, a 44px selection control, and a clearly labeled open-order button. Keep mutation buttons in a compact overflow/action area so fraud checks, status updates, courier dispatch, notes, delete, print, and Excel actions remain available.

The card root must not be a nested interactive element. Use a labeled button for opening and separate buttons/checkboxes for actions. Keep the existing `<Table>` branch intact and render the mobile branch only when `useIsMobile()` is true; desktop must continue to receive exactly the existing table branch.

- [ ] **Step 4: Stack filters and bulk actions on mobile**

Add only mobile-scoped classes around the Dashboard order controls so search, date range, status filter, warehouse filter, pagination, and action controls use full width and wrap vertically. Put selected-order bulk actions behind an accessible mobile action sheet/menu; preserve their current callbacks and selected IDs. Keep the desktop flex/grid classes as-is for `md` and larger widths.

- [ ] **Step 5: Run focused tests and the existing order tests**

Run: `npx vitest run src/test/mobileOrderCards.test.tsx src/test/dashboardBulkStatus.test.tsx src/test/dashboardOrderStatusFilter.test.tsx src/test/orderRoutingWiring.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit order mobile presentation**

```bash
git add src/components/MobileOrderCards.tsx src/components/OrdersTable.tsx src/pages/Dashboard.tsx src/test/mobileOrderCards.test.tsx
git commit -m "feat: add mobile order cards"
```

### Task 3: Make products and customers card-based on mobile

**Files:**
- Create: `src/components/MobileProductCards.tsx`
- Create: `src/components/MobileCustomerCards.tsx`
- Modify: `src/pages/Products.tsx:558-758`
- Modify: `src/components/CustomerDataTable.tsx:100-225`
- Test: `src/test/mobileCatalogCards.test.tsx`

**Interfaces:**
- `MobileProductCards` consumes the already filtered/sorted `Product[]` page and existing callbacks (`onEditProduct`, selection, COG/publish/delete/warehouse mutation callbacks) so filtering, pagination, and mutations remain owned by `ProductsDataTable`.
- `MobileCustomerCards` consumes the existing sorted `Customer[]` and `onSelect(customer)` callback. It exposes the same customer selection behavior as the desktop table.

- [ ] **Step 1: Write failing product/customer card tests**

```tsx
it("shows product name, stock, price, and edit action on mobile", async () => {
  const user = userEvent.setup();
  const onEditProduct = vi.fn();
  render(<MobileProductCards products={[makeProduct({ name: "Alphonso Mango", stock_quantity: 12, selling_price: 850 })]} onEditProduct={onEditProduct} selectedProductIds={new Set()} onToggleSelection={vi.fn()} renderActions={() => null} />);
  expect(screen.getByText("Alphonso Mango")).toBeInTheDocument();
  expect(screen.getByText(/৳850/)).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /edit alphonso mango/i }));
  expect(onEditProduct).toHaveBeenCalled();
});

it("selects a customer card using the existing callback", async () => {
  const user = userEvent.setup();
  const customer = makeCustomer({ name: "Nusrat Jahan", totalOrders: 3, totalSpent: 2400 });
  const onSelect = vi.fn();
  render(<MobileCustomerCards customers={[customer]} onSelect={onSelect} />);
  await user.click(screen.getByRole("button", { name: /open customer nusrat jahan/i }));
  expect(onSelect).toHaveBeenCalledWith(customer);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/test/mobileCatalogCards.test.tsx`

Expected: FAIL because the mobile card components do not exist.

- [ ] **Step 3: Implement mobile product cards**

Map the same filtered `table.getRowModel().rows` used by the desktop table into cards. Show product image/name, published state, price, stock/variant summary, margin/COG where available, and an overflow menu for edit, delete, draft/publish, warehouse assignment, and other existing row actions. Keep search, stock filter, add product, selection, and pagination controls available with mobile-only stacking classes. Do not alter the table branch at `md` and above.

- [ ] **Step 4: Implement mobile customer cards**

Keep the existing `sorted` calculation and desktop `Table` branch. Add a mobile branch that shows avatar/name/phone, source, lifecycle, order count, total spent, and risk. Make the entire card a labeled button or provide one labeled open button, avoiding nested interactive controls. Preserve loading and empty states.

- [ ] **Step 5: Run focused and existing catalog/customer tests**

Run: `npx vitest run src/test/mobileCatalogCards.test.tsx src/test/customersPageRouting.test.ts src/test/customers.test.ts src/test/productBranding.test.ts src/test/productsWarehouseColumn.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit catalog and customer mobile presentations**

```bash
git add src/components/MobileProductCards.tsx src/components/MobileCustomerCards.tsx src/pages/Products.tsx src/components/CustomerDataTable.tsx src/test/mobileCatalogCards.test.tsx
git commit -m "feat: add mobile product and customer cards"
```

### Task 4: Finish the order editor and social inbox mobile ergonomics

**Files:**
- Modify: `src/pages/OrderDetail.tsx:345-369`
- Modify: `src/components/order-editor/CustomerPanel.tsx`
- Modify: `src/components/order-editor/CatalogPanel.tsx`
- Modify: `src/components/order-editor/CartPanel.tsx`
- Modify: `src/pages/SocialInbox.tsx:314-613`
- Test: `src/test/mobileWorkflowLayout.test.tsx`

**Interfaces:**
- Existing editor panel props and save/mutation callbacks stay unchanged.
- Existing `SocialInbox` state machine (`mobileView: "list" | "chat"`) remains the master-detail contract; this task only improves phone sizing, focus, and bottom-nav clearance.

- [ ] **Step 1: Write failing layout behavior tests**

```tsx
it("keeps order editor controls in mobile reading order", () => {
  render(<OrderDetail />, { route: "/orders/order-1" });
  const workspace = screen.getByTestId("order-editor-workspace");
  expect(workspace).toHaveAttribute("data-mobile-layout", "single-column");
  expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
});

it("returns from a mobile inbox chat to the conversation list", async () => {
  const user = userEvent.setup();
  render(<SocialInbox platform="facebook" />);
  await user.click(await screen.findByTestId("button-conversation-conversation-1"));
  await user.click(screen.getByRole("button", { name: /back to conversations/i }));
  expect(screen.getByTestId("input-search-conversations")).toBeVisible();
});
```

Use the existing mocked API/test setup. If full page rendering requires unavailable auth or network context, test the stable `data-testid` and component-level layout contracts instead of adding test-only production behavior.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/test/mobileWorkflowLayout.test.tsx`

Expected: FAIL because the mobile layout contract and accessible back label are not present.

- [ ] **Step 3: Make the order editor a phone-safe single column**

Keep the existing editor toolbar and panel components, but add mobile-only spacing, minimum widths, and section separation. Ensure the catalog search/input and cart controls fit at 360px, numeric controls do not force horizontal overflow, the sticky toolbar does not cover content, and the save/cancel controls remain reachable after the notes section. Add `data-mobile-layout="single-column"` to the existing workspace without changing its desktop grid behavior.

- [ ] **Step 4: Make the social inbox chat safe above bottom navigation**

Retain the existing list/chat conditional rendering. Give the mobile back button an accessible label such as `Back to conversations`, increase its hit area to at least 44px, keep the composer above the fixed bottom nav using mobile-only bottom padding, and use `min-h-0`/safe overflow on message and conversation containers. Keep the desktop two-panel layout and all polling/reply/toggle/delete behavior unchanged.

- [ ] **Step 5: Run focused inbox/editor tests**

Run: `npx vitest run src/test/mobileWorkflowLayout.test.tsx src/test/order-detail.test.ts src/test/customerPanel.test.tsx src/test/cartPanel.test.tsx src/test/orderRoutingWiring.test.ts src/test/inboxVariantCapture.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit editor and inbox mobile ergonomics**

```bash
git add src/pages/OrderDetail.tsx src/components/order-editor/CustomerPanel.tsx src/components/order-editor/CatalogPanel.tsx src/components/order-editor/CartPanel.tsx src/pages/SocialInbox.tsx src/test/mobileWorkflowLayout.test.tsx
git commit -m "feat: optimize mobile order and inbox workflows"
```

### Task 5: Verify mobile-only behavior and regression safety

**Files:**
- Modify: only files from Tasks 1-4 if verification finds a defect
- Test: `src/test/mobileWorkflowLayout.test.tsx` and the existing test suite

- [ ] **Step 1: Run lint, tests, and production build**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all commands exit successfully.

- [ ] **Step 2: Start the local server and verify phone widths**

Run the existing dev command with the available local port, then inspect the priority routes at approximately 360px, 390px, and 430px:

```text
/
/overview
/orders/<existing-order-id>
/inbox/facebook
/inbox/instagram
/inbox/whatsapp
/products
/customers
```

Check that the bottom bar does not cover content, cards have no horizontal page overflow, all buttons are reachable, inbox composer remains visible, and order/product/customer actions still work.

- [ ] **Step 3: Verify desktop remains unchanged**

Inspect the same routes at widths 768px and 1280px. Confirm the desktop sidebar/table/two-panel inbox/grid editor continue rendering and no mobile bottom navigation is visible. Use `git diff` to confirm all new layout rules are scoped with `md:hidden`, `max-md:`, or an equivalent mobile-only branch.

- [ ] **Step 4: Commit any verification-only corrections**

```bash
git add src test
git commit -m "fix: polish mobile workflow verification findings"
```
