---
name: ui-ux-craft
description: World-class UI/UX polish, fluid motion design, micro-interactions, dark mode aesthetics, and ergonomic layout hierarchy.
triggers: ["ui-ux", "animation", "framer-motion", "micro-interaction", "typography", "dark-mode", "design-system", "theme"]
---

# UI/UX Craft & Visual Polish

This skill turns functional wireframes into visually stunning, delightful products with crisp typography, balanced spacing, fluid animations, and dark mode ergonomics.

## 1. Visual Hierarchy & Typography
- **Typography Scale**: Rely on strict typographic scaling. Avoid choosing arbitrary font sizes. Prefer:
  - Heading 1: `text-3xl font-extrabold tracking-tight sm:text-4xl`
  - Heading 2: `text-2xl font-bold tracking-tight`
  - Heading 3: `text-xl font-semibold`
  - Body: `text-base text-foreground leading-relaxed`
  - Caption / Subtext: `text-xs text-muted-foreground font-medium`
- **Contrast over Clutter**: Contrast foreground text (`text-foreground`) with muted text (`text-muted-foreground`) to establish visual weight instead of introducing rainbow colors.

## 2. Micro-Interactions & Fluid Motion
- **Speed & Physics**: Keep interface transitions snappy and purposeful:
  - Micro-interactions (hover, tap, toggle): `150ms - 200ms ease-out`
  - Layout expansions / drawers / sheets: `250ms - 350ms cubic-bezier(0.16, 1, 0.3, 1)`
  - Exit animations should be ~25% faster than entry animations.
- **Framer Motion Patterns**:
  ```tsx
  import { motion } from "framer-motion";

  export const FadeInCard = ({ children }: { children: React.ReactNode }) => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-xl border bg-card p-6 shadow-sm"
    >
      {children}
    </motion.div>
  );
  ```
- **Active States**: Provide tactile feedback with `active:scale-[0.98]` on buttons and clickable cards.

## 3. Dark Mode & Color Systems
- **Avoid Pure Black (`#000000`)**: Pure black causes harsh contrast fatigue on OLED screens. Prefer rich slate/zinc shades (e.g. `hsl(240 10% 3.9%)` or `#09090b`).
- **Surface Elevation in Dark Mode**: In light mode, elevation is communicated via drop shadows. In dark mode, shadows are invisible — communicate elevation by slightly lightening the background surface:
  - Level 0 (Canvas): `#09090b`
  - Level 1 (Card): `#18181b`
  - Level 2 (Popover / Modal): `#27272a`
- **Subtle Borders**: Use ultra-subtle translucent borders (`border-white/10` or `border-border/60`) to define component boundaries cleanly.

## 4. Empty & Loading States
- **Skeleton Screens**: Always prefer animated skeleton loaders matching the exact shape of incoming content over generic spinning wheels.
- **Optimistic UI**: Immediately update local UI state upon user action (e.g. liking a post, toggling a checkbox) and roll back only if the server returns an error.
- **Actionable Empty States**: When an empty list is rendered, display an illustrative icon, an encouraging message, and a clear Call-To-Action button (e.g. "Create your first project").
