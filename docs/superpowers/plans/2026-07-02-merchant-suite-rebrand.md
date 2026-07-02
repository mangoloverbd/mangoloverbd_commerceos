# Merchant-Suite Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename product-facing legacy brand labels to Merchant-Suite across the app and project metadata.

**Architecture:** This is a copy-only change. Update static strings in React components, pages, metadata, and docs without changing behavior, routing, auth, or data access.

**Tech Stack:** React 18, Vite, TypeScript, Express metadata/docs only.

---

### Task 1: Locate Product Name References

**Files:**
- Inspect all text files containing legacy brand labels.

- [ ] **Step 1: Search references**

Run: `rg "legacy brand labels"`

Expected: list all candidate files to update.

### Task 2: Update Product-Facing Labels

**Files:**
- Modify: `src/components/AppSidebar.tsx`
- Modify: `src/pages/Auth.tsx`
- Modify: other product-facing pages and metadata found in Task 1

- [ ] **Step 1: Replace product brand strings**

Replace visible app/product labels with `Merchant-Suite`. Preserve code structure and styling unless a split label needs to become one text node.

- [ ] **Step 2: Preserve non-product legal references only when clearly required**

If a string refers to the app name, use `Merchant-Suite`.

### Task 3: Verify Rebrand

**Files:**
- No new implementation files.

- [ ] **Step 1: Search old references**

Run: `rg "legacy brand labels"`

Expected: no unintended old product-name references remain.

- [ ] **Step 2: Build check**

Run: `npm run build`

Expected: build completes successfully.

### Self-Review

- Spec coverage: Covers the expanded request to change product name everywhere.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: No TypeScript API changes.
