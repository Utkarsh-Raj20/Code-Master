---
name: systematic-debugging
description: Rigorous root-cause analysis and systematic troubleshooting methodology. Replaces trial-and-error with hypothesis-driven investigation, reproduction scripts, stack trace dissection, and regression prevention.
triggers: ["debug", "debugging", "bug", "error", "stack-trace", "crash", "reproduce", "bisect", "investigate", "fix-bug"]
---

# Systematic Debugging & Root Cause Analysis

This skill guides diagnosing and eliminating software defects through evidence-based, reproducible debugging rather than guesswork or speculative edits.

## 1. The 5-Step Debugging Protocol

1. **Observe & Capture Exact Behavior**:
   - What was the exact command or action executed?
   - What was the exact error message, exit code, or unexpected output?
   - What was the expected behavior?
   - Is the failure deterministic or intermittent?

2. **Reproduce in Isolation**:
   - Construct a minimal, standalone reproduction script or unit test that triggers the failure reliably.
   - Strip out extraneous dependencies, middleware, or external services until the smallest failing surface remains.

3. **Formulate Falsifiable Hypotheses**:
   - State 1–2 testable theories: *"If the issue is X, then modifying Y should produce Z."*
   - Change only **one variable at a time**.

4. **Verify Root Cause Before Editing Production Code**:
   - Use targeted console/log inspection or debugger breakpoints to confirm the state matches your hypothesis immediately before the error occurs.
   - Do not apply "shotgun fixes" or hope that changing unrelated lines solves the problem.

5. **Fix & Add Regression Test**:
   - Implement the minimal, correct fix.
   - Verify that your reproduction test now passes.
   - Verify that existing test suites still pass without regressions.

---

## 2. Stack Trace & Error Dissection

When inspecting an error stack trace:
1. **Identify the Boundary Point**: Separate third-party/library frames from your application source code.
2. **Find the Last Project Frame**: The root bug is usually at or immediately above the last line referencing your repository's files.
3. **Inspect the Error Type**:
   - `TypeError: Cannot read properties of undefined`: An upstream promise or function returned `undefined` or a schema mismatch occurred.
   - `EPERM / EACCES`: Permission, sandbox, or OS-level file locking issues.
   - `ECONNREFUSED / ENOTFOUND`: Network connectivity, proxy settings, or unstarted background service.
   - `ZodError / ValidationError`: Input shape does not match contract. Inspect raw input payload.

---

## 3. Binary Search & Git Bisect for Regressions

When a bug recently appeared in a previously working codebase:

```bash
# Start git bisect session
git bisect start

# Mark current state as broken
git bisect bad

# Mark last known working commit or tag
git bisect good v1.2.0

# Git will checkout the midpoint commit. Run your automated test:
bun test
# If passing:
git bisect good
# If failing:
git bisect bad

# Once the culprit commit is pinpointed:
git bisect reset
```

---

## 4. Antipatterns to Avoid

- **Speculative Try/Catch Wrapping**: Never wrap failing code in a broad `try { ... } catch {}` that silently swallows errors without fixing the underlying invariant.
- **Shotgun Debugging**: Modifying 5 different lines simultaneously in the hope that one resolves the symptom.
- **Blaming the Compiler/Runtime**: Compilers, runtimes, and databases are rarely broken; 99.9% of bugs originate in application state assumptions.

