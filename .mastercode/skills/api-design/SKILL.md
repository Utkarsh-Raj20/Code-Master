---
name: api-design
description: Standardized RESTful API modeling, OpenAPI specification, and endpoint engineering. Enforces resource-oriented URL design, RFC 7807 error responses, idempotency keys, cursor pagination, and versioning.
triggers: ["api", "rest", "restful", "openapi", "swagger", "endpoint", "route", "http", "json-api", "schema"]
---

# RESTful API Modeling & Endpoint Standards

This skill establishes production API design patterns for building intuitive, resilient, and developer-friendly HTTP interfaces.

## 1. Resource-Oriented URL Modeling

- **Use Nouns, Not Verbs**: URLs represent resources, HTTP methods indicate the action.
  - Good: `POST /api/v1/orders` (create), `GET /api/v1/orders/123` (retrieve), `DELETE /api/v1/orders/123` (remove)
  - Bad: `POST /api/v1/createOrder`, `GET /api/v1/deleteOrder?id=123`
- **Plural Collections**: Use plural lowercase kebab-case nouns for endpoints:
  - `/api/v1/user-profiles`
  - `/api/v1/organizations/:orgId/memberships`
- **Sub-Resource Hierarchy**: Limit nesting to maximum 2 levels deep (`/resources/:id/sub-resources`). For deeper queries, use top-level resources with filter params.

---

## 2. HTTP Method & Status Code Contract

| Method | Idempotent | Success Code | Common Error Codes |
| :--- | :--- | :--- | :--- |
| `GET` | Yes | `200 OK` | `404 Not Found`, `401 Unauthorized` |
| `POST` | No | `201 Created` | `400 Bad Request`, `422 Unprocessable Entity` |
| `PUT` | Yes (full replace) | `200 OK` | `400 Bad Request`, `404 Not Found` |
| `PATCH` | No/Yes (partial edit) | `200 OK` | `422 Unprocessable`, `409 Conflict` |
| `DELETE` | Yes | `204 No Content` | `404 Not Found`, `403 Forbidden` |

---

## 3. Standard Error Format (RFC 7807 Problem Details)

All non-2xx responses must return a structured JSON body following RFC 7807:

```json
{
  "type": "https://api.example.com/errors/invalid-credentials",
  "title": "Invalid Credentials",
  "status": 401,
  "detail": "The password supplied does not match our records.",
  "instance": "/api/v1/auth/login",
  "invalidParams": [
    {
      "field": "password",
      "reason": "Must contain at least 1 number and 1 symbol"
    }
  ]
}
```

---

## 4. Idempotency & Safe Retries

For non-idempotent operations (e.g. charging payments, processing checkouts), support the `Idempotency-Key` header:

```typescript
// Middleware implementation pattern:
const idempotencyKey = req.header("Idempotency-Key");
if (idempotencyKey) {
  const cachedResponse = await redis.get(`idemp:${idempotencyKey}`);
  if (cachedResponse) {
    return c.json(JSON.parse(cachedResponse.body), cachedResponse.status);
  }
}
```

---

## 5. Cursor-Based Pagination Pattern

Avoid offset-based pagination (`OFFSET 10000`) for large or rapidly mutating datasets; prefer opaque cursor keys:

```text
GET /api/v1/transactions?limit=25&after=cursor_eyJpZCI6MTAyNX0=
```

Response payload:
```json
{
  "data": [ ... ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "cursor_eyJpZCI6MTA1MH0=",
    "totalCount": 4200
  }
}
```

