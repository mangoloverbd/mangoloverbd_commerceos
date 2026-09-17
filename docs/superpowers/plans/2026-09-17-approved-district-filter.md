# Approved District Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Approved-tab district filter dropdown that counts approved orders per জেলা and auto-resolves unknown addresses with AI that learns.

**Architecture:** Pure matcher lib (`src/lib/bdDistricts.ts`) runs the dropdown instantly with zero cost. A new backend route resolves only unseen unknown addresses via the existing `aiChatCompletion` helper (`server/index.js:118`) and learns into an org-scoped `app_settings` JSON map (same precedent as `billing_invoices`, `server/index.js:1998`). Dashboard auto-fires resolution once per new address set; order rows are never written.

**Tech Stack:** React 18 + TypeScript (strict), Vitest, Express (ESM), OpenAI-compatible `aiChatCompletion`, `app_settings` JSON storage.

## Global Constraints

- Every new route that reads or writes user data MUST use the current Mango Lover BD workspace and preserve the `org_id` guard in all relevant queries.
- Always guard new API endpoints with auth: `getToken(req)` → `getUser(token)` → `if (!user) return 401`.
- Always use `apiFetch()` from `src/lib/api.ts` for frontend API calls.
- Never accept a tenant or organization id from the client.
- Never commit `.env` or secrets.
- Unknown weights/districts render as `—` / `Unknown`, never fabricated.
- TypeScript strict — no `any` without a documented comment.

---

## File Structure

- Create `src/lib/bdDistricts.ts` — 64-district table (EN variants + BN), area→district aliases, `detectDistrict()`. Pure, no imports.
- Create `src/test/bdDistricts.test.ts` — matcher unit tests.
- Modify `server/index.js` (Orders domain section, near `GET /api/orders` at line ~5800) — `GET /api/orders/district-aliases` + `POST /api/orders/resolve-districts`.
- Create `src/test/approvedDistrictFilter.test.ts` — server-source assertions + Dashboard-source wiring assertions (follows `src/test/printStatusWiring.test.ts` pattern).
- Modify `src/pages/Dashboard.tsx` — district state, dropdown, auto-resolve effect, filtering.
- Modify `AGENTS.md` + `CLAUDE.md` — document optional `DISTRICT_MODEL`.

---

### Task 1: District matcher lib + unit tests

**Files:**
- Create: `src/lib/bdDistricts.ts`
- Test: `src/test/bdDistricts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BD_DISTRICTS`, `detectDistrict(address, learnedAliases?)` consumed by Task 3; `DISTRICT_UNKNOWN_SENTINEL` consumed by Tasks 2–3.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { BD_DISTRICTS, detectDistrict } from "@/lib/bdDistricts";

describe("detectDistrict", () => {
  it("matches English and Bengali district names", () => {
    expect(detectDistrict("House 12, Road 5, Dhanmondi, Dhaka")).toBe("Dhaka");
    expect(detectDistrict("বাসা ৩, গাজীপুর")).toBe("Gazipur");
    expect(detectDistrict("Chittagong GEC Circle")).toBe("Chattogram");
  });

  it("maps areas to districts even when the district is not written", () => {
    expect(detectDistrict("House 7, Dhanmondi")).toBe("Dhaka");
    expect(detectDistrict("Tongi, Station Road")).toBe("Gazipur");
  });

  it("prefers learned aliases and returns null when unknown", () => {
    expect(detectDistrict("Somewhere New", { "somewhere new": "Sylhet" })).toBe("Sylhet");
    expect(detectDistrict("Somewhere New", { "somewhere new": null })).toBe(null);
    expect(detectDistrict("")).toBe(null);
    expect(detectDistrict(null)).toBe(null);
  });

  it("covers all 64 districts", () => {
    expect(BD_DISTRICTS).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/bdDistricts.test.ts`
Expected: FAIL with "Failed to resolve import @/lib/bdDistricts"

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bdDistricts.ts` with exactly this content:

```ts
export interface BdDistrict {
  name: string;
  match: string[];
}

export const DISTRICT_UNKNOWN_SENTINEL = "__unknown__";

export const BD_DISTRICTS: BdDistrict[] = [
  { name: "Bagerhat", match: ["bagerhat", "বাগেরহাট"] },
  { name: "Bandarban", match: ["bandarban", "বান্দরবান"] },
  { name: "Barguna", match: ["barguna", "বরগুনা"] },
  { name: "Barishal", match: ["barishal", "barisal", "বরিশাল"] },
  { name: "Bhola", match: ["bhola", "ভোলা"] },
  { name: "Bogura", match: ["bogura", "bogra", "বগুড়া"] },
  { name: "Brahmanbaria", match: ["brahmanbaria", "ব্রাহ্মণবাড়িয়া"] },
  { name: "Chandpur", match: ["chandpur", "চাঁদপুর"] },
  { name: "Chattogram", match: ["chattogram", "chittagong", "চট্টগ্রাম"] },
  { name: "Chuadanga", match: ["chuadanga", "চুয়াডাঙ্গা"] },
  { name: "Cox's Bazar", match: ["cox's bazar", "coxs bazar", "cox bazar", "কক্সবাজার"] },
  { name: "Cumilla", match: ["cumilla", "comilla", "কুমিল্লা"] },
  { name: "Dhaka", match: ["dhaka", "ঢাকা"] },
  { name: "Dinajpur", match: ["dinajpur", "দিনাজপুর"] },
  { name: "Faridpur", match: ["faridpur", "ফরিদপুর"] },
  { name: "Feni", match: ["feni", "ফেনী"] },
  { name: "Gaibandha", match: ["gaibandha", "গাইবান্ধা"] },
  { name: "Gazipur", match: ["gazipur", "গাজীপুর"] },
  { name: "Gopalganj", match: ["gopalganj", "গোপালগঞ্জ"] },
  { name: "Habiganj", match: ["habiganj", "হবিগঞ্জ"] },
  { name: "Jamalpur", match: ["jamalpur", "জামালপুর"] },
  { name: "Jashore", match: ["jashore", "jessore", "যশোর"] },
  { name: "Jhalokati", match: ["jhalokati", "ঝালকাঠি"] },
  { name: "Jhenaidah", match: ["jhenaidah", "ঝিনাইদহ"] },
  { name: "Joypurhat", match: ["joypurhat", "জয়পুরহাট"] },
  { name: "Khagrachari", match: ["khagrachari", "খাগড়াছড়ি"] },
  { name: "Khulna", match: ["khulna", "খুলনা"] },
  { name: "Kishoreganj", match: ["kishoreganj", "কিশোরগঞ্জ"] },
  { name: "Kurigram", match: ["kurigram", "কুড়িগ্রাম"] },
  { name: "Kushtia", match: ["kushtia", "কুষ্টিয়া"] },
  { name: "Lakshmipur", match: ["lakshmipur", "লক্ষ্মীপুর"] },
  { name: "Lalmonirhat", match: ["lalmonirhat", "লালমনিরহাট"] },
  { name: "Madaripur", match: ["madaripur", "মাদারীপুর"] },
  { name: "Magura", match: ["magura", "মাগুরা"] },
  { name: "Manikganj", match: ["manikganj", "মানিকগঞ্জ"] },
  { name: "Meherpur", match: ["meherpur", "মেহেরপুর"] },
  { name: "Moulvibazar", match: ["moulvibazar", "মৌলভীবাজার"] },
  { name: "Munshiganj", match: ["munshiganj", "মুন্সিগঞ্জ"] },
  { name: "Mymensingh", match: ["mymensingh", "ময়মনসিংহ"] },
  { name: "Naogaon", match: ["naogaon", "নওগাঁ"] },
  { name: "Narail", match: ["narail", "নড়াইল"] },
  { name: "Narayanganj", match: ["narayanganj", "নারায়ণগঞ্জ"] },
  { name: "Narsingdi", match: ["narsingdi", "নরসিংদী"] },
  { name: "Natore", match: ["natore", "নাটোর"] },
  { name: "Netrokona", match: ["netrokona", "নেত্রকোণা"] },
  { name: "Nilphamari", match: ["nilphamari", "নীলফামারী"] },
  { name: "Noakhali", match: ["noakhali", "নোয়াখালী"] },
  { name: "Pabna", match: ["pabna", "পাবনা"] },
  { name: "Panchagarh", match: ["panchagarh", "পঞ্চগড়"] },
  { name: "Patuakhali", match: ["patuakhali", "পটুয়াখালী"] },
  { name: "Pirojpur", match: ["pirojpur", "পিরোজপুর"] },
  { name: "Rajbari", match: ["rajbari", "রাজবাড়ী"] },
  { name: "Rajshahi", match: ["rajshahi", "রাজশাহী"] },
  { name: "Rangamati", match: ["rangamati", "রাঙ্গামাটি"] },
  { name: "Rangpur", match: ["rangpur", "রংপুর"] },
  { name: "Satkhira", match: ["satkhira", "সাতক্ষীরা"] },
  { name: "Shariatpur", match: ["shariatpur", "শরীয়তপুর"] },
  { name: "Sherpur", match: ["sherpur", "শেরপুর"] },
  { name: "Sirajganj", match: ["sirajganj", "সিরাজগঞ্জ"] },
  { name: "Sunamganj", match: ["sunamganj", "সুনামগঞ্জ"] },
  { name: "Sylhet", match: ["sylhet", "সিলেট"] },
  { name: "Tangail", match: ["tangail", "টাঙ্গাইল"] },
  { name: "Thakurgaon", match: ["thakurgaon", "ঠাকুরগাঁও"] },
];

const DISTRICT_AREA_ALIASES: Record<string, string> = {
  dhanmondi: "Dhaka",
  gulshan: "Dhaka",
  banani: "Dhaka",
  mirpur: "Dhaka",
  mohammadpur: "Dhaka",
  uttara: "Dhaka",
  badda: "Dhaka",
  khilgaon: "Dhaka",
  motijheel: "Dhaka",
  paltan: "Dhaka",
  farmgate: "Dhaka",
  shahbagh: "Dhaka",
  tejgaon: "Dhaka",
  rampura: "Dhaka",
  bashundhara: "Dhaka",
  mohakhali: "Dhaka",
  banasree: "Dhaka",
  jatrabari: "Dhaka",
  demra: "Dhaka",
  keraniganj: "Dhaka",
  savar: "Dhaka",
  dhamrai: "Dhaka",
  ashulia: "Dhaka",
  shantinagar: "Dhaka",
  malibagh: "Dhaka",
  moghbazar: "Dhaka",
  tongi: "Gazipur",
  kaliakair: "Gazipur",
  sreepur: "Gazipur",
  sonargaon: "Narayanganj",
  rupganj: "Narayanganj",
  araihazar: "Narayanganj",
  agrabad: "Chattogram",
  gec: "Chattogram",
  halishahar: "Chattogram",
  hathazari: "Chattogram",
  patiya: "Chattogram",
  zindabazar: "Sylhet",
  ambarkhana: "Sylhet",
};

export function normalizeAddress(value: string | null | undefined): string {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function detectDistrict(
  address: string | null | undefined,
  learnedAliases: Record<string, string | null> = {},
): string | null {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  if (Object.hasOwn(learnedAliases, normalized)) return learnedAliases[normalized];
  for (const district of BD_DISTRICTS) {
    if (district.match.some((variant) => normalized.includes(variant))) return district.name;
  }
  for (const [area, districtName] of Object.entries(DISTRICT_AREA_ALIASES)) {
    if (normalized.includes(area)) return districtName;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/bdDistricts.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/bdDistricts.ts src/test/bdDistricts.test.ts
git commit -m "feat: add bangladesh district matcher"
```

---

### Task 2: District alias API routes (learn + serve)

**Files:**
- Modify: `server/index.js` (Orders domain section, after `GET /api/orders` at line ~5853)
- Test: `src/test/approvedDistrictFilter.test.ts`

**Interfaces:**
- Consumes: `getOrgSettings`/`saveOrgSettings` (`server/index.js:1365/1481`), `aiChatCompletion` (`server/index.js:118`), `BD_DISTRICTS` names (hardcode the 64-name allowlist in the prompt builder from the same list; server mirrors the names, it does not import the TS lib).
- Produces: `GET /api/orders/district-aliases` → `{ aliases: Record<string, string | null> }` and `POST /api/orders/resolve-districts` `{ addresses: string[] }` → `{ resolved: Record<string, string | null> }` consumed by Task 3.

**Route contract (exact):**
- Both routes: `getToken(req)` → `getUser(token)` → 401 when no user; `getUserOrg(supabase, user.id)` → `orgId`. No org id from client.
- Alias storage key: `district_aliases` via `getOrgSettings(orgId, ["district_aliases"])`, parsed with `JSON.parse(raw || "{}")` in try/catch (corrupt → `{}`).
- DB value uses the sentinel `"__unknown__"` for negative-cached addresses; both routes translate the sentinel to `null` for the client.
- POST validation: `addresses` must be an array; keep only non-empty strings; normalize (`toLowerCase`, collapse whitespace, trim); dedupe; slice to 50. Empty-after-clean → `{ resolved: {} }`.
- Cache-first: split into known (in map) vs new. Known resolve immediately from the map.
- AI only for new addresses and only when `AI_API_KEY` is set; otherwise new addresses return `null` without caching.
- One `aiChatCompletion` call: model `process.env.DISTRICT_MODEL || AI_DEFAULT_MODEL`, `temperature: 0`, `max_tokens: 2000`, system prompt `You map Bangladeshi delivery addresses to districts. Reply with ONLY a JSON object mapping each input address string to exactly one of these 64 districts: <comma-joined names>. Use "unknown" unless you are confident.` plus user content `JSON.stringify(newAddresses)`.
- If the response is not ok and signals a model problem (status 404 or body contains `model_not_found` or `does not exist`), retry once with model `"gpt-4o-mini"`. Other failures → return known + `null` for new addresses without caching anything.
- Parse defensively: read `choices[0].message.content`, extract the first `{...}` span, `JSON.parse` in try/catch; parse failure → no caching.
- Accept only answers matching a district name case-insensitively (map to canonical name) or `"unknown"` (→ negative-cache sentinel). Anything else → unresolved, not cached.
- Merge into the map preserving insertion order; cap at 500 entries by dropping the oldest; `saveOrgSettings(orgId, { district_aliases: JSON.stringify(map) })`.
- Never read or write the `orders` table in either route.

- [ ] **Step 1: Write the failing test**

Create `src/test/approvedDistrictFilter.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("district alias API", () => {
  it("serves and learns district aliases behind auth with org guards", () => {
    const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

    expect(server).toContain('app.get("/api/orders/district-aliases"');
    expect(server).toContain('app.post("/api/orders/resolve-districts"');
    const getStart = server.indexOf('app.get("/api/orders/district-aliases"');
    const postStart = server.indexOf('app.post("/api/orders/resolve-districts"');
    expect(server.slice(getStart, postStart)).toContain("getUser(getToken(req))");
    expect(server.slice(postStart)).toContain("getUser(getToken(req))");
    expect(server.slice(postStart)).toContain("getUserOrg(supabase, user.id)");
    expect(server).toContain("district_aliases");
    expect(server).toContain("process.env.DISTRICT_MODEL");
    expect(server).toContain('"gpt-4o-mini"');
    expect(server).toContain("__unknown__");
    const postEnd = (() => {
      const rest = server.slice(postStart + 50);
      const next = rest.search(/\napp\.(get|post|patch|put|delete)\("/);
      return next === -1 ? server.length : postStart + 50 + next;
    })();
    const postBody = server.slice(postStart, postEnd);
    expect(postBody).toContain("slice(0, 50)");
    expect(postBody).not.toContain('from("orders")');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/approvedDistrictFilter.test.ts`
Expected: FAIL — `app.get("/api/orders/district-aliases"` not found

- [ ] **Step 3: Write minimal implementation**

Insert after the `GET /api/orders` route handler (which ends at `server/index.js:5853`) exactly:

```js
const DISTRICT_NAMES = ["Bagerhat","Bandarban","Barguna","Barishal","Bhola","Bogura","Brahmanbaria","Chandpur","Chapai Nawabganj","Chattogram","Chuadanga","Cox's Bazar","Cumilla","Dhaka","Dinajpur","Faridpur","Feni","Gaibandha","Gazipur","Gopalganj","Habiganj","Jamalpur","Jashore","Jhalokati","Jhenaidah","Joypurhat","Khagrachari","Khulna","Kishoreganj","Kurigram","Kushtia","Lakshmipur","Lalmonirhat","Madaripur","Magura","Manikganj","Meherpur","Moulvibazar","Munshiganj","Mymensingh","Naogaon","Narail","Narayanganj","Narsingdi","Natore","Netrokona","Nilphamari","Noakhali","Pabna","Panchagarh","Patuakhali","Pirojpur","Rajbari","Rajshahi","Rangamati","Rangpur","Satkhira","Shariatpur","Sherpur","Sirajganj","Sunamganj","Sylhet","Tangail","Thakurgaon"];
const DISTRICT_UNKNOWN_SENTINEL = "__unknown__";
const DISTRICT_ALIAS_LIMIT = 500;
const DISTRICT_RESOLVE_LIMIT = 50;

function normalizeDistrictAddress(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseDistrictAliasMap(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toClientDistrictAliasMap(stored) {
  const map = {};
  for (const [key, value] of Object.entries(stored)) {
    map[key] = value === DISTRICT_UNKNOWN_SENTINEL ? null : value;
  }
  return map;
}

function evictOldestDistrictAliases(map) {
  const keys = Object.keys(map);
  if (keys.length <= DISTRICT_ALIAS_LIMIT) return map;
  const trimmed = {};
  for (const key of keys.slice(keys.length - DISTRICT_ALIAS_LIMIT)) trimmed[key] = map[key];
  return trimmed;
}

async function resolveDistrictsWithAI(addresses) {
  const models = [];
  if (process.env.DISTRICT_MODEL) models.push(process.env.DISTRICT_MODEL);
  if (AI_DEFAULT_MODEL && !models.includes(AI_DEFAULT_MODEL)) models.push(AI_DEFAULT_MODEL);
  if (!models.includes("gpt-4o-mini")) models.push("gpt-4o-mini");
  const prompt = `You map Bangladeshi delivery addresses to districts. Reply with ONLY a JSON object mapping each input address string to exactly one of these 64 districts: ${DISTRICT_NAMES.join(", ")}. Use "unknown" unless you are confident.`;
  let lastNonModelError = null;
  for (const model of models) {
    const response = await aiChatCompletion({
      model,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify(addresses) },
      ],
    });
    if (response.ok) return response;
    const body = await response.text().catch(() => "");
    const isModelError = response.status === 404 || /model_not_found|does not exist|invalid model/i.test(body);
    if (!isModelError) {
      lastNonModelError = { status: response.status, body };
      break;
    }
  }
  return lastNonModelError;
}

app.get("/api/orders/district-aliases", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const settings = await getOrgSettings(orgId, ["district_aliases"]);
    const stored = parseDistrictAliasMap(settings.district_aliases);
    return res.json({ aliases: toClientDistrictAliasMap(stored) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders/resolve-districts", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const rawAddresses = Array.isArray(req.body?.addresses) ? req.body.addresses : null;
    if (!rawAddresses) return res.status(400).json({ error: "addresses must be an array" });
    const addresses = [...new Set(
      rawAddresses.map(normalizeDistrictAddress).filter(Boolean),
    )].slice(0, 50);
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const settings = await getOrgSettings(orgId, ["district_aliases"]);
    let stored = parseDistrictAliasMap(settings.district_aliases);
    const resolved = {};
    const fresh = [];
    for (const address of addresses) {
      if (Object.hasOwn(stored, address)) {
        resolved[address] = stored[address] === DISTRICT_UNKNOWN_SENTINEL ? null : stored[address];
      } else {
        fresh.push(address);
      }
    }
    if (fresh.length && AI_API_KEY) {
      const aiResponse = await resolveDistrictsWithAI(fresh);
      if (aiResponse && aiResponse.ok) {
        const payload = await aiResponse.json().catch(() => null);
        const content = payload?.choices?.[0]?.message?.content || "";
        let answers = null;
        try {
          answers = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
        } catch {
          answers = null;
        }
        if (answers && typeof answers === "object") {
          const canonical = new Map(DISTRICT_NAMES.map((name) => [name.toLowerCase(), name]));
          for (const address of fresh) {
            const answer = typeof answers[address] === "string" ? answers[address].trim() : "";
            if (answer.toLowerCase() === "unknown") {
              stored[address] = DISTRICT_UNKNOWN_SENTINEL;
              resolved[address] = null;
            } else if (canonical.has(answer.toLowerCase())) {
              stored[address] = canonical.get(answer.toLowerCase());
              resolved[address] = stored[address];
            } else {
              resolved[address] = null;
            }
          }
          stored = evictOldestDistrictAliases(stored);
          await saveOrgSettings(orgId, { district_aliases: JSON.stringify(stored) });
        } else {
          for (const address of fresh) resolved[address] = null;
        }
      } else {
        for (const address of fresh) resolved[address] = null;
      }
    } else {
      for (const address of fresh) resolved[address] = null;
    }
    return res.json({ resolved });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

Note: `AI_API_KEY` and `AI_DEFAULT_MODEL` are module-scope consts already defined at `server/index.js:101-111`; the new code only reads them. `DISTRICT_NAMES` duplicates the TS list deliberately — the server cannot import the TS lib.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/approvedDistrictFilter.test.ts src/test/bdDistricts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/approvedDistrictFilter.test.ts
git commit -m "feat: add district alias learn-and-serve routes"
```

---

### Task 3: Dashboard Approved district dropdown + auto-resolve

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Test: `src/test/approvedDistrictFilter.test.ts` (append wiring block)

**Interfaces:**
- Consumes: `detectDistrict` + `normalizeAddress` from Task 1; `GET /api/orders/district-aliases` + `POST /api/orders/resolve-districts` from Task 2; `apiFetch`, existing `Select`/`SelectItem`, `filteredOrders`, `activeOrderStatusFilter`, `fulfillmentTab` tab-change handler.
- Produces: visible district filter; no downstream consumers.

**Behavior spec (exact):**
- State (next to other toolbar state): `const [districtFilter, setDistrictFilter] = useState("all");` `const [learnedAliases, setLearnedAliases] = useState<Record<string, string | null>>({});` `const [detectingDistricts, setDetectingDistricts] = useState(false);` plus refs `const districtResolveSentRef = useRef<Set<string>>(new Set());` `const learnedAliasesRef = useRef<Record<string, string | null>>({});` `const aliasesLoadedRef = useRef(false);`
- Helper in module scope or component: `const districtOf = (order: Order) => detectDistrict(order.address, learnedAliases);`
- Counts memo from `filteredOrders` (which is already Approved+search+warehouse scoped when the tab is approved): build `Array<{ name: string; count: number }>` for districts with count > 0 sorted by count desc, plus unknown count. Options: `All districts (N)`, each district, `Unknown (M)` last; value `"all"` / district name / `"__unknown__"`.
- `districtFilteredOrders` memo: applies only when `activeOrderStatusFilter === "approved"` and `districtFilter !== "all"` (match name or null-for-unknown); otherwise returns `filteredOrders` unchanged.
- `visibleOrders` and `OrderTablePagination totalItems` switch from `filteredOrders` to `districtFilteredOrders`.
- Tab-change handler (`OrderStatusSegmentedControl onChange`) adds `setDistrictFilter("all");`.
- Dropdown JSX in `dashboard-order-actions`, rendered only when `!isAbandonedQueue && activeOrderStatusFilter === "approved"`, `data-testid="select-district-filter"`, `selectedKey={districtFilter}`, disabled while `detectingDistricts` with label `Detecting…` in the All option.
- Auto-resolve effect (placed after the `filteredOrders` memo):

```tsx
useEffect(() => {
  if (activeOrderStatusFilter !== "approved" || isAbandonedQueue) return;
  let cancelled = false;
  const run = async () => {
    try {
      if (!aliasesLoadedRef.current) {
        const aliasRes = await apiFetch("/api/orders/district-aliases");
        if (!aliasRes.ok) return;
        const aliasData = await aliasRes.json();
        if (cancelled) return;
        aliasesLoadedRef.current = true;
        const merged: Record<string, string | null> = { ...(aliasData.aliases || {}) };
        learnedAliasesRef.current = merged;
        setLearnedAliases(merged);
      }
      const merged = learnedAliasesRef.current;
      const unseen = [...new Set(
        filteredOrders
          .map((order) => normalizeAddress(order.address))
          .filter((key) => key && !Object.hasOwn(merged, key) && !districtResolveSentRef.current.has(key)),
      )].slice(0, 50);
      if (!unseen.length) return;
      unseen.forEach((key) => districtResolveSentRef.current.add(key));
      setDetectingDistricts(true);
      const resolveRes = await apiFetch("/api/orders/resolve-districts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: unseen }),
      });
      if (!resolveRes.ok || cancelled) return;
      const resolveData = await resolveRes.json();
      const next = { ...learnedAliasesRef.current, ...(resolveData.resolved || {}) };
      learnedAliasesRef.current = next;
      if (!cancelled) setLearnedAliases(next);
    } catch {
      // Detection is best-effort; the dropdown works on the built-in map.
    } finally {
      if (!cancelled) setDetectingDistricts(false);
    }
  };
  void run();
  return () => { cancelled = true; };
}, [activeOrderStatusFilter, isAbandonedQueue, filteredOrders]);
```

`learnedAliasesRef` mirrors the state for use inside the effect without retriggering it; `aliasesLoadedRef` keeps the GET to once per session while unseen-address checks still run per data change (each run is a no-op when `unseen` is empty).

- [ ] **Step 1: Write the failing wiring test**

Append to `src/test/approvedDistrictFilter.test.ts`:

```ts
describe("approved district filter wiring", () => {
  it("renders a district filter only for Approved and auto-resolves unknowns", () => {
    const dashboardSource = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

    expect(dashboardSource).toContain('data-testid="select-district-filter"');
    expect(dashboardSource).toContain('activeOrderStatusFilter === "approved"');
    expect(dashboardSource).toContain('from "@/lib/bdDistricts"');
    expect(dashboardSource).toContain('"/api/orders/district-aliases"');
    expect(dashboardSource).toContain('"/api/orders/resolve-districts"');
    expect(dashboardSource).toContain('setDistrictFilter("all")');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/approvedDistrictFilter.test.ts`
Expected: FAIL — `select-district-filter` not found

- [ ] **Step 3: Implement Dashboard changes exactly as specified above**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/test/approvedDistrictFilter.test.ts src/test/bdDistricts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/test/approvedDistrictFilter.test.ts AGENTS.md CLAUDE.md
git commit -m "feat: add approved district filter with auto resolve"
```

**Docs edit (part of Step 3 commit):** in `AGENTS.md`, after line 46 (`AI_MODEL=...`), insert `DISTRICT_MODEL=gpt-5.4-mini   # district auto-detect model; falls back to gpt-4o-mini`. In `CLAUDE.md`, after line 42 (`STOREFRONT_GIT_REPO=...`), insert `DISTRICT_MODEL=            # optional: district auto-detect model (default gpt-4o-mini fallback chain)`.

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Manual QA in the browser (localhost:5002)**

1. Dashboard → Approved tab → district dropdown visible with counts + Unknown last.
2. Pick a district → table + pagination filter; counts compose with search.
3. An unknown address auto-resolves within seconds (dropdown counts shift, no button, no toast spam).
4. Switch tabs → dropdown hidden; back to Approved → selection reset to All.
5. Other tabs unaffected; Inbox Orders untouched.

- [ ] **Step 5: Commit any fixes separately; do not batch unrelated changes**
