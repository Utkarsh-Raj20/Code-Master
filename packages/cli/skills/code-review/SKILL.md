---
name: code-review
description: Comprehensive clean code analysis and architectural review standards. Audits code changes against SOLID principles, security vulnerabilities, performance anti-patterns, and cyclomatic complexity.
triggers: ["review", "code-review", "clean-code", "refactor", "solid", "smell", "audit", "complexity", "lint"]
---

# Code Review & Clean Architecture Standards

This skill provides an objective, senior-level code review framework to evaluate pull requests, refactorings, and architectural decisions.

## 1. The 4 Pillars of Code Review

Every code review examines four primary dimensions:

### Pillar 1: Correctness & Invariants
- Does the code fulfill the functional specification without subtle edge case defects?
- Are boundary conditions handled (`null`, `undefined`, empty collections, concurrency)?
- Are database transactions used where atomic consistency across multiple tables is required?

### Pillar 2: Security & Permissions
- Are all untrusted user inputs validated with strict schemas (e.g. Zod)?
- Are database queries parameterized against SQL injection?
- Is authentication checked and authorization (RBAC/ABAC) verified at the handler level?
- Are sensitive secrets kept out of source code, logs, and client bundles?

### Pillar 3: Maintainability & Cognitive Load
- Are functions focused on a single responsibility? (Aim for < 40 lines per function).
- Are variable and function names self-describing without cryptic abbreviations?
- Can a new engineer understand the control flow without unraveling 5 levels of nested indentation?
- Is duplication eliminated without prematurely over-abstracting?

### Pillar 4: Performance & Resource Lifecycle
- Are there $O(N^2)$ nested loops where a Hash Map lookup ($O(1)$) should be used?
- Are database queries causing N+1 problems? (Ensure batching or eager loading with `include`).
- Are subscriptions, timers, event listeners, and streams cleanly disposed of in cleanup handlers?

---

## 2. SOLID Principles Practical Checklist

- **Single Responsibility (SRP)**: Each class/module has only one reason to change. Separate business logic from transport (HTTP/CLI) logic.
- **Open/Closed (OCP)**: New features should be extendable via polymorphism or strategies rather than editing giant `switch` statements across existing code.
- **Liskov Substitution (LSP)**: Derived classes or implementations must fulfill contracts without throwing unexpected exceptions for valid base types.
- **Interface Segregation (ISP)**: Clients should not be forced to depend on interfaces they do not use. Split large monolithic interfaces into smaller, cohesive units.
- **Dependency Inversion (DIP)**: High-level modules should depend on abstractions (interfaces), not direct concrete low-level implementations.

---

## 3. Code Smell & Antipattern Spotting

| Code Smell | Warning Sign | Remedy |
| :--- | :--- | :--- |
| **Primitive Obsession** | Passing 6 loose strings (`street, city, zip, state...`) | Group into a dedicated `Address` value object or interface |
| **Feature Envy** | Function in Class A calls 8 getters on Class B | Move the logic directly into Class B |
| **Shotgun Surgery** | A single small change requires editing 10 different files | Consolidate related responsibilities into a unified domain module |
| **Boolean Flag Arguments** | `createUser(name, true, false, true)` | Use an options object or split into explicit function names |
| **Silent Failures** | Empty `catch (e) {}` blocks | Log the error, notify the user, or let it bubble up |

---

## 4. Review Comment Formatting Standards

When providing review feedback, structure comments with empathy and actionable guidance:

```markdown
**[Suggestion]** Consider memoizing the filtered list:
Because `items` may contain several thousand elements on high-volume accounts, recalculating the sort on every keystroke causes perceptible UI frame drops.

```typescript
const sortedItems = useMemo(() => items.filter(...), [items, query]);
```
```

