// A tiny in-memory stand-in for the supabase-js query builder, for server
// helpers that read and write a few tables. It supports only the filters those
// helpers use: eq, in, gt, lte, or(ilike…), order, limit, update, insert,
// select and maybeSingle. Projections are ignored (full rows come back).
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

function ilike(value: unknown, pattern: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(String(value ?? ""));
}

function compare(left: unknown, right: unknown) {
  if (left === right) return 0;
  return String(left) < String(right) ? -1 : 1;
}

export function memorySupabase(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    tables[table] ??= [];
    const filters: Filter[] = [];
    const orders: { column: string; ascending: boolean; nullsFirst: boolean }[] = [];
    let limit = Infinity;
    let patch: Row | null = null;
    let single = false;

    const run = () => {
      let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (patch) {
        rows.forEach((row) => Object.assign(row, patch));
      }
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending, nullsFirst } of orders) {
          const av = a[column] ?? null;
          const bv = b[column] ?? null;
          if (av === null && bv === null) continue;
          if (av === null) return nullsFirst ? -1 : 1;
          if (bv === null) return nullsFirst ? 1 : -1;
          const result = compare(av, bv);
          if (result !== 0) return ascending ? result : -result;
        }
        return 0;
      }).slice(0, limit);
      const data = rows.map((row) => ({ ...row }));
      return { data: single ? data[0] ?? null : data, error: null };
    };

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
      gt: (column: string, value: unknown) => { filters.push((row) => compare(row[column], value) > 0); return builder; },
      lte: (column: string, value: unknown) => { filters.push((row) => compare(row[column], value) <= 0); return builder; },
      or: (expression: string) => {
        const parts = expression.split(",").map((part) => {
          const [column, operator, ...rest] = part.split(".");
          if (operator !== "ilike") throw new Error(`Unsupported or() operator ${operator}`);
          return { column, pattern: rest.join(".") };
        });
        filters.push((row) => parts.some(({ column, pattern }) => ilike(row[column], pattern)));
        return builder;
      },
      order: (column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
        const ascending = options.ascending ?? true;
        orders.push({ column, ascending, nullsFirst: options.nullsFirst ?? !ascending });
        return builder;
      },
      limit: (count: number) => { limit = count; return builder; },
      update: (values: Row) => { patch = values; return builder; },
      insert: (values: Row | Row[]) => {
        tables[table].push(...(Array.isArray(values) ? values : [values]));
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      then: (resolve: (value: ReturnType<typeof run>) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  };
  return { from };
}
