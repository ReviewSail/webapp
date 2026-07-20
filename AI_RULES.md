# AI Development Rules & Guidelines

Welcome to the **React SPA Application Workspace**! This guide outlines our core tech stack, architectural conventions, and library selection rules. Please adhere to these guidelines strictly when adding features, fixing bugs, or refactoring.

---

## 🛠️ The Tech Stack (Core Architecture)

* **UI Library:** **React (v18+)** for composing state-driven, interactive components.
* **Programming Language:** **TypeScript** for robust type-safety, absolute path mappings, and autocompletion.
* **Build System & Server:** **Vite** as our high-speed local development bundler and optimized ESM production builder.
* **Styling Framework:** **Tailwind CSS** for modern, responsive, utility-first styling.
* **Component System & Aesthetics:** **shadcn/ui style variables** built via Radix UI primitives.
* **Client-Side Routing:** **React Router (react-router-dom v6)** for robust Single Page Application routing mapped in a single schema.
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

## 🚀 Standard Development Commands

* **Local Dev Server:** `npm run dev` or `vite` (accessible at `http://localhost:5173`)
* **Production Build:** `npm run build` (compiles TypeScript via `tsc` and generates static files via `vite build`)
* **Preview Production Build:** `npm run preview`
