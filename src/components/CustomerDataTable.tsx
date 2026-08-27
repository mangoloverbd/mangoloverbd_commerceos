"use client";

import { useMemo, useState } from "react";
import type { SortDescriptor } from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { Chip } from "@/components/base/badges/chip";
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

const sourceLabels: Record<Source, string> = {
  custom_website: "Custom Website",
  shopify: "Shopify",
  manual: "Manual",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  social_inbox: "Social Inbox",
};

const lifecycleLabels: Record<Customer["lifecycleStage"], string> = {
  new: "New",
  repeat: "Repeat",
  vip: "VIP",
  dormant: "Dormant",
  risky: "Risky",
};

const lifecycleColor: Record<Customer["lifecycleStage"], "blue" | "cyan" | "purple" | "neutral" | "rose"> = {
  new: "blue",
  repeat: "cyan",
  vip: "purple",
  dormant: "neutral",
  risky: "rose",
};

const riskColor: Record<Customer["riskLevel"], "lime" | "yellow" | "rose"> = {
  low: "lime",
  medium: "yellow",
  high: "rose",
};

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

type SortColumn = "name" | "orders" | "spent";

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
  onSelect,
}: {
  customers: Customer[];
  loading: boolean;
  onSelect: (customer: Customer) => void;
}) {
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "name",
    direction: "ascending",
  });

  function toggleSort(column: SortColumn) {
    setSortDescriptor((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "ascending" ? "descending" : "ascending" }
        : { column, direction: "ascending" },
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
        default:
          return 0;
      }
    });
    return arr;
  }, [customers, sortDescriptor]);

  return (
    <Table
      aria-label="Customers"
      selectionMode="none"
      size="sm"
      onRowAction={(key) => {
        const customer = sorted.find((item) => item.id === key);
        if (customer) onSelect(customer);
      }}
      className="min-w-[940px]"
    >
      <TableHeader>
        <TableColumn id="name" className="w-[300px]">
          <SortHeader label="Customer" column="name" sortDescriptor={sortDescriptor} onSort={toggleSort} />
        </TableColumn>
        <TableColumn id="source" className="w-[150px]">
          Source
        </TableColumn>
        <TableColumn id="lifecycle" className="w-[130px]">
          Lifecycle
        </TableColumn>
        <TableColumn id="orders" className="w-[100px]">
          <SortHeader label="Orders" column="orders" sortDescriptor={sortDescriptor} onSort={toggleSort} />
        </TableColumn>
        <TableColumn id="spent" className="w-[140px]">
          <SortHeader label="Spent" column="spent" sortDescriptor={sortDescriptor} onSort={toggleSort} />
        </TableColumn>
        <TableColumn id="risk" className="w-[120px]">
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
                {Array.from({ length: 6 }).map((__, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <div className="h-4 w-full max-w-[180px] animate-pulse rounded bg-black/[0.05]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : sorted.map((customer) => (
              <TableRow key={customer.id} id={customer.id}>
                <TableCell className="w-[300px]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar size="sm" color="neutral" initials={initialsOf(customer.name)} />
                    <div className="min-w-0">
                      <p className="truncate text-body-medium text-text-primary">{customer.name}</p>
                      <p className="truncate text-[11px] text-text-tertiary">{customer.phone || "No phone"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="w-[150px]">
                  <Chip variant="subtle" color="soft">
                    {sourceLabels[customer.primarySource]}
                  </Chip>
                </TableCell>
                <TableCell className="w-[130px]">
                  <Chip variant="subtle" color={lifecycleColor[customer.lifecycleStage]}>
                    {lifecycleLabels[customer.lifecycleStage]}
                  </Chip>
                </TableCell>
                <TableCell className="w-[100px]">
                  <span className="tabular-nums text-body-medium text-text-primary">{customer.totalOrders}</span>
                </TableCell>
                <TableCell className="w-[140px]">
                  <span className="tabular-nums text-body-medium text-text-primary">{money(customer.totalSpent)}</span>
                </TableCell>
                <TableCell className="w-[120px]">
                  <Chip variant="subtle" color={riskColor[customer.riskLevel]} className="capitalize">
                    {customer.riskLevel}
                  </Chip>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
