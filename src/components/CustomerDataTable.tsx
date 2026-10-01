"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SortDescriptor } from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Pagination } from "@/components/base/pagination/pagination";
import { Chip } from "@/components/base/badges/chip";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/base/table/table";
import { ChevronSortDown } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";
import type { Customer, Source } from "@/pages/Customers";
import { orderSourceLabel } from "@/lib/orderSource";
import { MobileCustomerCards } from "@/components/MobileCustomerCards";

const sourceColor: Record<Source, "blue" | "green" | "yellow" | "rose" | "cyan" | "purple" | "lime" | "neutral"> = {
  website: "yellow",
  facebook: "blue",
  instagram: "rose",
  whatsapp: "green",
  phone: "cyan",
  telesales: "purple",
  upsell: "lime",
  manual_other: "neutral",
};
const lifecycleLabels: Record<Customer["lifecycleStage"], string> = {
  new: "New",
  repeat: "Repeat",
  vip: "VIP",
  dormant: "Dormant",
  risky: "Risky",
};

const lifecycleColor: Record<Customer["lifecycleStage"], "blue" | "green" | "purple" | "neutral" | "rose"> = {
  new: "blue",
  repeat: "green",
  vip: "purple",
  dormant: "neutral",
  risky: "rose",
};

const riskColor: Record<Customer["riskLevel"], "green" | "yellow" | "rose"> = {
  low: "green",
  medium: "yellow",
  high: "rose",
};

/** One fixed chip size across the Source, Lifecycle and Risk columns. */
const COLUMN_CHIP_CLASS = "w-[128px] justify-center";
const CUSTOMER_PAGE_SIZE = 50;

export type CustomerTableView = { page: number; sortDescriptor: SortDescriptor };

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((word) => word[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function money(value: number) {
  return `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
}

type SortColumn = "name" | "orders" | "spent" | "lastOrder";

const lastOrderTime = (customer: Customer) => (customer.lastOrderAt ? new Date(customer.lastOrderAt).getTime() : 0);

function lastOrderLabel(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

function SortHeader({
  label,
  column,
  sortDescriptor,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortDescriptor: SortDescriptor;
  onSort: (column: SortColumn) => void;
}) {
  const active = sortDescriptor.column === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="flex cursor-pointer items-center gap-1 outline-none"
    >
      {label}
      <ChevronSortDown
        className={cx(
          "size-5 shrink-0 transition-[transform,color] duration-150",
          active && sortDescriptor.direction === "descending" && "rotate-180",
          active ? "text-text-secondary" : "text-text-tertiary",
        )}
      />
    </button>
  );
}

export function CustomerDataTable({
  customers,
  loading,
  selectedIds,
  onSelectedIdsChange,
  onOpenCustomer,
  initialView,
}: {
  customers: Customer[];
  loading: boolean;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onOpenCustomer?: (customer: Customer, view: CustomerTableView) => void;
  initialView?: CustomerTableView;
}) {
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(initialView?.sortDescriptor || {
    column: "lastOrder",
    direction: "descending",
  });
  const [page, setPage] = useState(initialView?.page || 1);
  const tableTopRef = useRef<HTMLDivElement>(null);
  const previousCustomers = useRef(customers);

  useEffect(() => {
    if (previousCustomers.current !== customers && previousCustomers.current.length > 0) setPage(1);
    previousCustomers.current = customers;
  }, [customers]);

  function toggleSort(column: SortColumn) {
    setPage(1);
    setSortDescriptor((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "ascending" ? "descending" : "ascending" }
        : { column, direction: column === "lastOrder" ? "descending" : "ascending" },
    );
  }

  const sorted = useMemo(() => {
    const arr = [...customers];
    const dir = sortDescriptor.direction === "ascending" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortDescriptor.column) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "orders":
          return (a.totalOrders - b.totalOrders) * dir;
        case "spent":
          return (a.totalSpent - b.totalSpent) * dir;
        case "lastOrder":
          return (lastOrderTime(a) - lastOrderTime(b)) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [customers, sortDescriptor]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / CUSTOMER_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const firstIndex = (currentPage - 1) * CUSTOMER_PAGE_SIZE;
  const visible = sorted.slice(firstIndex, firstIndex + CUSTOMER_PAGE_SIZE);

  function changePage(next: number) {
    setPage(next);
    tableTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const selectedCount = sorted.filter((customer) => selectedIds.has(customer.id)).length;
  const allSelected = sorted.length > 0 && selectedCount === sorted.length;

  function toggleAll(checked: boolean) {
    const next = new Set(selectedIds);
    for (const customer of sorted) {
      if (checked) next.add(customer.id);
      else next.delete(customer.id);
    }
    onSelectedIdsChange(next);
  }

  function toggleOne(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedIdsChange(next);
  }

  return (
    <>
      <div ref={tableTopRef} className="scroll-mt-24" aria-hidden="true" />
      <div className="md:hidden">
        <MobileCustomerCards customers={visible} selectedIds={selectedIds} onToggle={toggleOne} onOpenCustomer={onOpenCustomer ? (customer) => onOpenCustomer(customer, { page: currentPage, sortDescriptor }) : undefined} />
      </div>
      <div className="hidden md:block">
    <Table
      aria-label="Customers"
      selectionMode="none"
      size="sm"
      onRowAction={(key) => {
        const id = String(key);
        toggleOne(id, !selectedIds.has(id));
      }}
      className="min-w-[1120px]"
    >
      <TableHeader>
        <TableColumn id="select" className="w-[44px]">
          <Checkbox
            slot={null}
            size="sm"
            aria-label="Select all customers"
            isDisabled={loading || sorted.length === 0}
            isSelected={allSelected}
            isIndeterminate={selectedCount > 0 && !allSelected}
            onChange={toggleAll}
          />
        </TableColumn>
        <TableColumn id="name" isRowHeader className="w-[300px]">
          <SortHeader label="Customer" column="name" sortDescriptor={sortDescriptor} onSort={toggleSort} />
        </TableColumn>
        <TableColumn id="source" className="w-[150px]">
          Source
        </TableColumn>
        <TableColumn id="lifecycle" className="w-[150px]">
          Lifecycle
        </TableColumn>
        <TableColumn id="orders" className="w-[100px]">
          <SortHeader label="Orders" column="orders" sortDescriptor={sortDescriptor} onSort={toggleSort} />
        </TableColumn>
        <TableColumn id="spent" className="w-[140px]">
          <SortHeader label="Spent" column="spent" sortDescriptor={sortDescriptor} onSort={toggleSort} />
        </TableColumn>
        <TableColumn id="lastOrder" className="w-[130px]">
          <SortHeader label="Last order" column="lastOrder" sortDescriptor={sortDescriptor} onSort={toggleSort} />
        </TableColumn>
        <TableColumn id="risk" className="w-[150px]">
          Risk
        </TableColumn>
      </TableHeader>
      <TableBody
        renderEmptyState={() => (
          <div className="flex h-40 items-center justify-center text-body-medium text-text-tertiary">
            No customers match your filters.
          </div>
        )}
      >
        {loading
          ? Array.from({ length: 10 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: 8 }).map((__, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <div className="h-4 w-full max-w-[180px] animate-pulse rounded bg-black/[0.05]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : visible.map((customer) => (
              <TableRow key={customer.id} id={customer.id} className={selectedIds.has(customer.id) ? "bg-black/[0.03]" : undefined}>
                <TableCell className="w-[44px]">
                  <Checkbox
                    slot={null}
                    size="sm"
                    aria-label={`Select ${customer.name}`}
                    isSelected={selectedIds.has(customer.id)}
                    onChange={(checked) => toggleOne(customer.id, checked)}
                  />
                </TableCell>
                <TableCell className="w-[300px]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar size="sm" color="neutral" initials={initialsOf(customer.name)} />
                    <div className="min-w-0">
                      <a href={`/customers/${encodeURIComponent(customer.id)}`} className="block truncate text-body-medium text-text-primary underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2" onClick={(event) => {
                        event.stopPropagation();
                        if (onOpenCustomer && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onOpenCustomer(customer, { page: currentPage, sortDescriptor }); }
                      }}>{customer.name}</a>
                      <div className="flex min-w-0 items-center gap-1">
                        <p className="truncate text-[11px] text-text-tertiary">{customer.phone || "No phone"}</p>
                        {customer.phone && (
                          <CopyButton
                            value={customer.phone}
                            size="sm"
                            aria-label={`Copy phone number ${customer.phone}`}
                            className="h-6 w-6 shrink-0 rounded-md text-black/40 hover:bg-black/[0.06] hover:text-black"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="w-[150px]">
                  <Chip variant="subtle" color={sourceColor[customer.primarySource]} className={COLUMN_CHIP_CLASS}>
                    {orderSourceLabel(customer.primarySource)}
                  </Chip>
                </TableCell>
                <TableCell className="w-[150px]">
                  <Chip variant="subtle" color={lifecycleColor[customer.lifecycleStage]} className={COLUMN_CHIP_CLASS}>
                    {lifecycleLabels[customer.lifecycleStage]}
                  </Chip>
                </TableCell>
                <TableCell className="w-[100px]">
                  <span className="tabular-nums text-body-medium text-text-primary">{customer.totalOrders}</span>
                </TableCell>
                <TableCell className="w-[140px]">
                  <span className="tabular-nums text-body-medium text-text-primary">{money(customer.totalSpent)}</span>
                </TableCell>
                <TableCell className="w-[130px]">
                  <span className="tabular-nums text-body-medium text-text-secondary">{lastOrderLabel(customer.lastOrderAt)}</span>
                </TableCell>
                <TableCell className="w-[150px]">
                  <Chip variant="subtle" color={riskColor[customer.riskLevel]} className={cx(COLUMN_CHIP_CLASS, "capitalize")}>
                    {customer.riskLevel}
                  </Chip>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
      </div>
      {!loading && totalPages > 1 && (
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="shrink-0 whitespace-nowrap text-[12px] tabular-nums text-black/55">
            Showing {firstIndex + 1}–{firstIndex + visible.length} of {sorted.length.toLocaleString("en-BD")} customers
          </p>
          <Pagination page={currentPage} totalPages={totalPages} onChange={changePage} className="sm:justify-end" />
        </div>
      )}
    </>
  );
}
