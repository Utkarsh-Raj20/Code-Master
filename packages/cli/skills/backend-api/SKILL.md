---
name: backend-api
description: Production RESTful and GraphQL API engineering. Covers strict Zod validation, error handling envelopes, HTTP status semantics, rate limiting, and idempotency.
triggers: ["backend", "api", "rest", "graphql", "endpoint", "express", "fastapi", "hono", "nest", "zod"]
---

# Production Backend & API Design

This skill guides the construction of resilient, secure, self-documenting APIs built with Node.js, Bun, Hono, Express, FastAPI, or Next.js API route handlers.

## 1. Request Validation & Boundaries
- **Strict Boundary Validation**: Never trust incoming HTTP request payloads, query parameters, or route params. Validate them before business logic executes.
- **Zod Schema Pattern**:
  ```ts
  import { z } from "zod";

  export const CreateUserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(2).max(100),
    role: z.enum(["admin", "member", "guest"]).default("member"),
  });

  export type CreateUserInput = z.infer<typeof CreateUserSchema>;
  ```
- **Strip Unexpected Fields**: Reject or strip unvalidated fields to prevent mass-assignment vulnerabilities.

## 2. Uniform Response Envelopes & Error Handling
- **Consistent Envelope Format**: Maintain a predictable JSON structure across all endpoints:
  - **Success Response**:
    ```json
    {
      "success": true,
      "data": { "id": "usr_123", "name": "Alice" },
      "meta": { "timestamp": 1700000000 }
    }
    ```
  - **Error Response**:
    ```json
    {
      "success": false,
      "error": {
        "code": "VALIDATION_FAILED",
        "message": "Invalid email address provided",
        "details": [{ "field": "email", "issue": "Must be a valid email" }]
      }
    }
    ```
- **Strict HTTP Status Code Semantics**:
  - `200 OK`: Successful read or update.
  - `201 Created`: Resource successfully created (include `Location` header where appropriate).
  - `204 No Content`: Successful deletion or action with no body.
  - `400 Bad Request`: General malformed request.
  - `401 Unauthorized`: Missing or invalid authentication token.
  - `403 Forbidden`: Authenticated user lacks permission for this specific resource.
  - `404 Not Found`: Resource does not exist.
  - `409 Conflict`: Unique constraint violation or state conflict.
  - `422 Unprocessable Entity`: Validation failure on syntactically valid JSON.
  - `429 Too Many Requests`: Rate limit exceeded (include `Retry-After` header).
  - `500 Internal Server Error`: Unhandled server exception (never leak stack traces in production).

## 3. Idempotency & Concurrency
- **Idempotency Keys**: For financial transactions or critical mutations (e.g. charging a card, placing an order), require an `Idempotency-Key` header. Cache processed keys in Redis for 24 hours to prevent duplicate executions.
- **Optimistic Locking**: Use an `updatedAt` timestamp or `version` integer column when multiple clients might edit the same entity concurrently to detect and reject stale updates.

## 4. Pagination & Query Design
- **Cursor-Based Pagination for Real-Time Feeds**: Use opaque base64 cursors (`?cursor=eyJpZCI6MTIzfQ==&limit=25`) for scalable pagination on large datasets. Avoid `OFFSET / LIMIT` on tables with > 50,000 rows.
- **Deep Filtering & Sorting**: Whitelist allowed sort fields (`?sortBy=createdAt&order=desc`) to avoid raw SQL injection into `ORDER BY` clauses.

