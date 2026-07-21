# MapRated Figma Design Handoff & Style Specification

This document provides the exact design specifications, tokens, layout grids, components, and responsive behaviors from the MapRated codebase to guide Figma page creation and component designs.

---

## 1. Core Design Tokens (Tailwind CSS Variables)

Use these exact values when creating **Local Variables** or **Color Styles** in Figma.

### A. Brand & UI Colors (Light Theme Baseline)
All colors map to HSL values used inside the CSS theme layer.

*   **Background (Canvas):** `HSL(210, 40%, 98%)` | #F8FAFC (Soft slate backdrop)
*   **Foreground (Body Text):** `HSL(222.2, 84%, 4.9%)` | #0F172A (Deep dark slate)
*   **Card Background:** `HSL(0, 0%, 100%)` | #FFFFFF (Pure White)
*   **Card Foreground:** `HSL(222.2, 84%, 4.9%)` | #0F172A
*   **Border:** `HSL(214.3, 31.8%, 91.4%)` | #E2E8F0 (Divider slate)
*   **Input Border:** `HSL(214.3, 31.8%, 91.4%)` | #E2E8F0

### B. Brand Accent Colors
*   **Primary (Brand Indigo):** `HSL(221.2, 83.2%, 53.3%)` | #2563EB
*   **Primary Foreground:** `HSL(210, 40%, 98%)` | #F8FAFC
*   **Secondary (Light Muted Slate):** `HSL(210, 40%, 96.1%)` | #F1F5F9
*   **Secondary Foreground:** `HSL(222.2, 47.4%, 11.2%)` | #1E293B
*   **Destructive (Red Alert):** `HSL(0, 84.2%, 60.2%)` | #EF4444
*   **Destructive Foreground:** `HSL(210, 40%, 98%)` | #F8FAFC

### C. Sidebar Component Color
*   **Sidebar Background:** #020617 (Slate 950 - Dark Mode feel for contrast)
*   **Sidebar Active Tab Tint:** #4F46E5 (Indigo 600 at 10% opacity)

### D. Corner Radii (Border Radii)
*   **Large (Buttons, Input Fields, Badges):** `var(--radius)` = `0.75rem` / `12px`
*   **Medium (Inside Nested Blocks):** `calc(var(--radius) - 2px)` = `10px`
*   **Small (Tooltips, Mini Pills):** `calc(var(--radius) - 4px)` = `8px`
*   **Extra Large Cards (Dashboard Cards, Panels):** `16px` or `24px`

---

## 2. Typography Specification

Create **Text Styles** in Figma matching these Inter-equivalent typography values:

*   **Font Family:** Inter, system-ui, sans-serif
*   **Page Title (H1):** `font-bold`, size: `24px` (1.5rem), tracking: `-0.025em` (tight), line-height: `32px`
*   **Card Header / Section Title (H2):** `font-bold`, size: `18px` (1.125rem), line-height: `28px`
*   **Subheadings (H3):** `font-semibold`, size: `16px` (1rem), line-height: `24px`
*   **Body Text (Default):** `font-medium` or `font-normal`, size: `14px` (0.875rem), line-height: `20px`, color: #475569 (Slate 600)
*   **Small Caption / Description Text:** `font-normal` or `font-semibold`, size: `12px` (0.75rem), line-height: `16px`, color: #64748B (Slate 500)
*   **Micro Detail Labels:** size: `10px` or `11px`, tracking: uppercase / letter spacing where styled

---

## 3. Layout Grid & Spacing Rules

Implement the following grids to guarantee seamless responsive behaviors:

### Desktop Grid (1440px Canvas)
*   **Type:** Center
*   **Columns:** 12
*   **Width:** 80px
*   **Gutter:** 24px
*   **Margins:** Auto (aligned inside a Max-Width wrapper of `1024px` / `max-w-5xl`)

### Tablet / Laptop Grid (1024px Canvas)
*   **Columns:** 12
*   **Gutter:** 20px
*   **Margins:** 32px

### Mobile Grid (375px Canvas)
*   **Columns:** 4
*   **Gutter:** 16px
*   **Margins:** 16px

### Spacing Scale (8pt System / Tailwind spacing)
*   **4px:** Tight paddings, small gap (Tailwind: space-1)
*   **8px:** Element relationships, minor paddings (Tailwind: space-2)
*   **12px:** Label-to-input gap (Tailwind: space-3)
*   **16px:** Grid columns, interior card spacing (Tailwind: space-4)
*   **24px:** Main card padding, dashboard gaps (Tailwind: space-6)
*   **32px:** Outer container gaps (Tailwind: space-8)

---

## 4. Component Library Blueprint (Figma Main Components)

Build these exact components in Figma using **Auto Layout** for seamless CSS translation.

### A. Status Indicators (Pill Badges)
All pills must feature `Auto Layout`, `12px` height, vertical padding `4px`, horizontal padding `10px`, rounded corners `9999px`, font-size `12px` bold.

1.  **Sent:**
    *   Fill: #EFF6FF (Blue 50)
    *   Border: #DBEAFE (Blue 100)
    *   Text: #1D4ED8 (Blue 700)
2.  **Clicked:**
    *   Fill: #ECFDF5 (Green 50)
    *   Border: #D1FAE5 (Green 100)
    *   Text: #047857 (Green 700)
3.  **Already Reviewed:**
    *   Fill: #ECFDF5 (Green 50)
    *   Border: #D1FAE5 (Green 100)
    *   Text: #047857 (Green 700)
4.  **Expired:**
    *   Fill: #F1F5F9 (Slate 100)
    *   Border: #E2E8F0 (Slate 200)
    *   Text: #475569 (Slate 600)
5.  **Opted Out:**
    *   Fill: #FEF2F2 (Red 50)
    *   Border: #FEE2E2 (Red 100)
    *   Text: #B91C1C (Red 700)

### B. Interactive Buttons
All primary action buttons use a corner radius of `12px` (Large) and font size `14px` bold.

1.  **Primary Button (Dark Theme):**
    *   Fill: #0F172A (Slate 900)
    *   Hover Fill: #1E293B (Slate 800)
    *   Text: #FFFFFF (White)
2.  **Secondary Brand Action Button (Indigo Theme):**
    *   Fill: #4F46E5 (Indigo 600)
    *   Hover Fill: #4338CA (Indigo 700)
    *   Text: #FFFFFF (White)
3.  **Outline Secondary Button:**
    *   Fill: Transparent
    *   Border: #E2E8F0 (Slate 200)
    *   Text: #334155 (Slate 700)
    *   Hover Fill: #F8FAFC (Slate 50)

### C. Sidebar Component Layout
*   Width: `256px` (w-64)
*   Fill: #020617 (Slate 950)
*   Border Right: #0F172A (Slate 900)
*   **Active Tab State:** Features an Indigo indicator line (`#6366F1`) on the left border with a width of `4px` and height matching the nav item. Left padding is adjusted accordingly.

### D. Analytics Metric Cards
*   Corner Radius: `16px`
*   Padding: `24px`
*   Border: `1px solid #E2E8F0`
*   Icon Background Pill: `40x40px` with `12px` corner radius, filled with light channel tints (e.g., #EEF2FF for Indigo cards).

---

## 5. Main Screen Flows for Figma Prototyping

To build functional page designs, follow these screen-specific architectures:

### 1. Dashboard Overview
*   **Section A (Header):** Property Selector dropdown aligned to the right. Live indicators showing "Hands-Free Hourly Scheduler Active".
*   **Section B (SaaS Metrics):** 3-column Grid for Cards: Total Invites, Deliverability Rate, and Click Rate.
*   **Section C (Service Recovery Hub):** Scrollable Private Feedback feed. Includes an "Export Feedback CSV" secondary button.
*   **Section D (Dispatches Feed):** A detailed table of the latest 10 guests showing statuses, departure dates, and interactive "Resend" buttons.

### 2. Onboarding Stepper (Linear Flow)
*   **Step 1:** Form for Property Name & direct Google Review Link with a helpful collapsible guide ("How do I find this?"). Button: "Save & Continue →".
*   **Step 2:** Upload illustration showing a dashboard split-pane offering guest report upload ("Sync Your Guests").
*   **Step 3:** A fully interactive visual preview showing how email/SMS invites will appear on a real mobile handset.

---

## 6. Interaction States (Handoff Transitions)
*   **Hover states:** Use simple opacity or tone changes (e.g., button backgrounds darken by 10% on hover).
*   **Focus Ring:** All text inputs and dropdown selectors must present an Indigo-500 focus border shadow overlay.
*   **Transitions:** All UI micro-animations (pills, overlays, sidebar items) should be prototyped with an "Ease In and Out" transition curve spanning exactly `200ms`.