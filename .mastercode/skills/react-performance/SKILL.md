---
name: react-performance
description: Audit and optimize React & Next.js applications for Web Vitals (LCP, FID/INP, CLS), render loops, bundle size, code splitting, memoization, and streaming.
triggers: ["react-perf", "optimize-react", "web-vitals", "bundle-size", "memo", "re-render", "performance"]
---

# React & Next.js Performance Engineering

This skill provides step-by-step auditing, profiling, and optimization patterns to maximize runtime performance, reduce client JavaScript bundle size, and achieve 95+ Google Web Vitals scores.

## 1. Core Web Vitals Optimization
- **LCP (Largest Contentful Paint < 2.5s)**:
  - Add `priority` or `fetchpriority="high"` to above-the-fold hero images or key banners.
  - Preload critical fonts using `next/font` with `display: 'swap'`.
  - Avoid rendering blocking JavaScript before the initial content paint.
- **INP (Interaction to Next Paint < 200ms)**:
  - Break up long CPU tasks (> 50ms) using `requestAnimationFrame`, `setTimeout`, or `useTransition`.
  - Use `useDeferredValue` for high-frequency input filtering (e.g. search bars over thousands of rows).
- **CLS (Cumulative Layout Shift < 0.1)**:
  - Always reserve aspect-ratio or explicit `width` and `height` on images, videos, and dynamic embeds.
  - Use skeleton loaders with matching dimensions to prevent layout pops when data resolves.

## 2. Eliminating Redundant Re-renders
- **Push State Down**: Move local state down to the component that actually needs it instead of lifting it to root containers.
- **Strategic Memoization**:
  - Use `useCallback` when passing functions down to memoized children (`React.memo`).
  - Use `useMemo` for expensive computations (e.g. array sorting, filtering large datasets, formatting graphs).
  - Do not blindly wrap trivial expressions (`useMemo(() => a + b, [a, b])` adds overhead without benefit).
- **Ref-Based Transience**: For rapidly changing values that don't affect visual markup (e.g. scroll offsets, mouse tracking, timers), store them in a `useRef` rather than `useState`.

## 3. Server Components (RSC) vs Client Components
- **Default to Server Components**: Keep components as React Server Components by default in Next.js App Router.
- **Push `"use client"` to Leaves**: Only mark the lowest interactive leaf component as client-side (e.g. a specific toggle button or interactive slider), keeping the outer layout, data fetcher, and static containers on the server.
- **Streaming with Suspense**: Wrap independent data-fetching widgets in `<Suspense fallback={<Skeleton />}>` so slow backend queries do not block fast ones.

## 4. Code Splitting & Virtualization
- **Dynamic Imports**: Lazy-load heavy third-party libraries (e.g. Chart.js, Monaco Editor, rich text editors) that are only shown conditionally:
  ```tsx
  import dynamic from "next/dynamic";

  const HeavyChart = dynamic(() => import("./HeavyChart"), {
    loading: () => <ChartSkeleton />,
    ssr: false,
  });
  ```
- **List Virtualization**: When displaying lists exceeding 100 items, implement windowing with `@tanstack/react-virtual` to ensure only visible DOM nodes are mounted.
