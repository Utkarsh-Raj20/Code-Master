---
name: test-driven-development
description: Test-Driven Development (TDD) workflow and testing excellence. Enforces Red-Green-Refactor cycle, high coverage, boundary testing, and robust test isolation using Vitest, Jest, or Bun test.
triggers: ["tdd", "test", "testing", "unit-test", "vitest", "jest", "bun-test", "coverage", "mock", "integration-test"]
---

# Test-Driven Development (TDD) & Testing Excellence

This skill guides writing reliable, maintainable test suites following the strict Red-Green-Refactor cycle and modern testing best practices.

## 1. The Red-Green-Refactor Lifecycle

1. **RED (Write a Failing Test First)**:
   - Define expected behavior before writing any production implementation.
   - Run the test suite to verify that the test fails for the *expected* reason (e.g. missing function, failing assertion).
   - Never write production code without a failing test leading the way.

2. **GREEN (Make It Pass with Minimal Code)**:
   - Write the simplest, most direct code that satisfies the test assertions.
   - Do not over-engineer or implement speculative features ("YAGNI" - You Aren't Gonna Need It).
   - Re-run the test to ensure it passes.

3. **REFACTOR (Clean and Optimize)**:
   - Clean up duplicate logic, improve variable naming, and extract reusable helpers.
   - Verify that all tests remain green after each micro-refactoring step.

---

## 2. Test Structure: AAA Pattern (Arrange - Act - Assert)

Every test should be visually and logically partitioned into three clear phases:

```typescript
import { describe, expect, it, vi } from "vitest";
import { OrderService } from "./order-service";

describe("OrderService", () => {
  it("calculates total with tiered volume discount", () => {
    // 1. Arrange: Setup inputs, mocks, and expected state
    const pricingEngine = { getDiscountRate: vi.fn().mockReturnValue(0.15) };
    const service = new OrderService(pricingEngine);
    const orderItems = [{ id: "item-1", unitPrice: 100, quantity: 5 }];

    // 2. Act: Execute the single behavior under test
    const receipt = service.checkout(orderItems);

    // 3. Assert: Validate expected side-effects and return value
    expect(receipt.subtotal).toBe(500);
    expect(receipt.discountAmount).toBe(75);
    expect(receipt.finalTotal).toBe(425);
    expect(pricingEngine.getDiscountRate).toHaveBeenCalledWith(5);
  });
});
```

---

## 3. Boundary & Edge Case Checklist

When authoring test suites for any component or business logic, always include:
- **Zero / Empty Values**: Empty arrays `[]`, empty strings `""`, zero `0`, empty objects `{}`.
- **Null / Undefined Handling**: Missing optional arguments, `null` DB returns.
- **Limits & Thresholds**: Off-by-one boundaries (`n - 1`, `n`, `n + 1`), maximum integers, pagination limits.
- **Negative & Malformed Inputs**: Negative numbers, invalid emails, unparseable JSON, unsupported unicode/emoji.
- **Async & Concurrency**: Fast double-clicks (race conditions), network timeouts, aborted HTTP requests.

---

## 4. Mocking Guidelines & Test Isolation

- **Mock at Architectural Boundaries**: Mock external HTTP APIs, third-party SDKs, and hardware timers. Do *not* mock internal private implementation details.
- **Clean State Between Tests**: Always reset mocks in `beforeEach` or `afterEach`:
  ```typescript
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });
  ```
- **Prefer Fake In-Memory Implementations**: When testing repository layers, use an in-memory Map or SQLite `:memory:` rather than heavy mock boilerplate.

---

## 5. Verification Commands
- Bun: `bun test`
- Vitest: `npx vitest run` or `npx vitest --coverage`
- Jest: `npm test -- --bail`

