---
name: frontend-design
description: Production-grade frontend engineering for modern React, Next.js, Tailwind CSS, and shadcn/ui. Enforces responsive design, accessibility (a11y), clean component hierarchy, and zero bloat.
triggers: ["frontend", "react", "nextjs", "tailwind", "shadcn", "component", "css", "responsive", "web-ui"]
---

# Production Frontend & Component Engineering

This skill guides the construction of responsive, accessible, and high-performance user interfaces using modern React / Next.js and Tailwind CSS.

## 1. Component Architecture & Principles
- **Container / Presentational Separation**: Keep data-fetching, hooks, and business logic cleanly separated from rendering markup.
- **Single Responsibility**: Each component should do one thing well. If a component exceeds ~150 lines, split sub-views into modular subcomponents.
- **Colocation**: Keep component styles, types, and unit tests close to the component file (e.g. `Button.tsx`, `Button.types.ts`, `Button.test.tsx`).
- **Composition over Inheritance**: Utilize the `children` prop and slot patterns (e.g. Radix UI primitives) rather than passing 10+ boolean flags.

## 2. Tailwind CSS & Design System Tokens
- **Design Tokens First**: Always use semantic design tokens (`bg-background`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`) instead of hardcoded hex colors.
- **Mobile-First Breakpoints**: Style the default view for mobile, then scale up progressively:
  - `sm:` (640px)
  - `md:` (768px)
  - `lg:` (1024px)
  - `xl:` (1280px)
- **Class Merging Utility**: Always compose dynamic class names using `cn()` (`clsx` + `tailwind-merge`) to prevent class collisions:
  ```tsx
  import { clsx, type ClassValue } from "clsx";
  import { twMerge } from "tailwind-merge";

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
  }
  ```

## 3. Accessibility (a11y) & Interactive States
- **Semantic HTML**: Use `<main>`, `<header>`, `<nav>`, `<aside>`, `<section>`, `<article>`, and native `<button>` tags. Never use `<div onClick=...>` without proper `role="button"` and keyboard event handlers (`onKeyDown` for Enter/Space).
- **Focus Rings**: Never remove `outline-none` without providing an explicit, accessible replacement like `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
- **Screen Reader Support**: Provide `aria-label` or `aria-labelledby` on icon buttons, status badges, and interactive controls lacking visible text.
- **Color Contrast**: Verify WCAG AA compliance (contrast ratio of at least 4.5:1 for normal text, 3:1 for large text).

## 4. Forms & State Validation
- **React Hook Form + Zod**: Bind forms using type-safe schemas to validate inputs at the field level:
  ```tsx
  const formSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
  });
  ```
- **Live Error Messages**: Display inline, human-readable error messages with `aria-live="polite"` adjacent to the offending input.
