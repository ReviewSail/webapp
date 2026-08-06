# AI Development Rules & Guidelines

Welcome to the **ReviewSail Application Workspace**! This guide outlines our core tech stack, architectural conventions, and library selection rules. Please adhere to these guidelines strictly when adding features, fixing bugs, or refactoring.

---

## 🛠️ The Tech Stack (Core Architecture)

* **UI Library:** **React (v18+)** for composing state-driven, interactive components.
* **Programming Language:** **TypeScript** for robust type-safety, absolute path mappings, and autocompletion.
* **Build System & Server:** **Vite** as our high-speed local development bundler and optimized ESM production builder.
* **Styling Framework:** **Tailwind CSS** for modern, responsive, utility-first styling.
* **Component System & Aesthetics:** **shadcn/ui style variables** built via Radix UI primitives.
* **Client-Side Routing:** **React Router (react-router-dom v6)** for robust Single Page Application routing mapped in a single schema.
* **Remote Data:** **TanStack Query (`@tanstack/react-query`)** owns every read from Supabase. See the data-fetching rules below — they are not stylistic.
* **Icon Library:** **Lucide React** for high-quality, lightweight, consistent vector iconography.
* **CSS Merging Utilities:** **clsx** and **tailwind-merge** combined through a core `cn(...)` utility helper.

---

## 📦 Library Selection & Usage Rules

To maintain high development speed, minimize build sizes, and avoid package clutter, follow these library guidelines:

### 1. Vector Icons
* **Rule:** Use **Lucide React** (`lucide-react`) exclusively.
* **Avoid:** Do not install or import from `react-icons`, `@heroicons/react`, FontAwesome, or custom inline SVG files unless strictly necessary.

### 2. Styling & Layouts
* **Rule:** Use **Tailwind CSS classes** for all margins, padding, grids, flexboxes, background colors, and active/focus states.
* **Avoid:** Do not write custom `.css` rules, raw `<style>` elements, or CSS-in-JS solutions (styled-components, emotion). Use CSS custom variables inside Tailwind if thematic overrides are required.

### 3. Dynamic Class Merging
* **Rule:** Always use the custom `cn(...)` function defined in `src/lib/utils.ts` to merge conditional Tailwind CSS classes securely.
* **Example:** `className={cn("px-4 py-2 text-sm", active && "bg-blue-500 text-white")}`

### 4. Routing Hierarchy
* **Rule:** Keep **all routes** declared inside `src/App.tsx`.
* **Placement:**
  * Place entry-point page components inside `src/pages/` (e.g., `src/pages/Index.tsx`).
  * Place reusable sub-components inside `src/components/` (e.g., `src/components/Button.tsx`).

### 5. Dialogs, Modals, & Overlays
* **Rule:** Use Radix UI primitives (such as `@radix-ui/react-dialog` or `@radix-ui/react-dropdown-menu`) for accessible overlays, dropdowns, and alert boxes to ensure complete keyboard navigation and screen-reader compliance.

---

## 📉 Supabase Egress Rules

The org is on the free plan with a 5 GB monthly egress limit. These are
correctness rules, not preferences — treat a violation like a type error.

### 1. Never `select('*')`
Name every column. A bare `.select()` after an insert is the same offence: it
returns the whole row, so pass the columns the caller actually reads.

```ts
✅ .select('id, user_id, status, created_at')
❌ .select('*')
❌ .insert({ ... }).select()
```

`src/context/ReviewSailContext.tsx` keeps a `COLUMNS` map so each table's list
lives in one place. Add to it rather than inlining a new string.

### 2. Every list read goes through `fetchAllPages()`
`src/lib/pagedFetch.ts` walks `.range()` windows of 50 and stops at a 2,000-row
ceiling with a console warning. Pass a deterministic `.order()` — without one,
Postgres may return overlapping windows and the pages will not line up.

```ts
const rows = await fetchAllPages('customers', () =>
  supabase.from('customers').select(COLUMNS.customers).order('id'),
);
```

A read with a genuinely fixed size (the five newest recognition records, say)
can use `.range(0, 4)` directly instead.

### 3. All remote data goes through TanStack Query
No `fetch` inside a bare `useEffect`. The defaults in `src/lib/queryClient.ts`
give every query `staleTime: 300_000` and `gcTime: 600_000`; do not lower them
on a per-query basis without a reason in a comment.

### 4. Writes invalidate one table, not everything
Prefer `invalidate('orders')` over `refreshData()`. When a write already returns
the updated row, patch the cache with `setQueryData` and issue no read at all —
see `patchCachedFeedback` in `ReviewSailContext`.

### 5. Annotate every Supabase call
```ts
// EGRESS-COST: low | medium | high
```
`low` is a bounded handful of rows. `high` grows with the guest list.

### 6. Storage and realtime
Serve files from the public CDN bucket URL. Only call `createSignedUrl()` in
response to an explicit user action — never in a render, `map()`, or loop. Any
`.on()` subscription must be filtered to the current user and must unsubscribe
on unmount. Neither is used today; these apply if you introduce them.

> **Watch out:** `grep` silently skips files containing NUL bytes, so a
> text-based audit of these rules can report a clean sweep on a file it never
> read. `file src/**/*.ts` will tell you if anything reads as `data` rather
> than `text`.

---

## 🚀 Standard Development Commands

This repo uses **pnpm**. `npm install` crashes on the pnpm-shaped
`node_modules`, and `pnpm` is not on `PATH` — go through Corepack.

* **Install (required after pulling a new dependency):** `corepack pnpm install`
* **Local Dev Server:** `corepack pnpm dev` (`http://localhost:5173`)
* **Production Build:** `corepack pnpm build` (`tsc` then `vite build`)
* **Tests:** `corepack pnpm test` (Vitest — pinned to v2, see below)
* **Preview Production Build:** `corepack pnpm preview`

Vitest must stay on v2: v4 requires Vite 6, and upgrading it alone breaks the
suite at startup.