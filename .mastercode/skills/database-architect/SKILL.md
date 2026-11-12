---
name: database-architect
description: Database schema modeling, indexing strategy, zero-downtime migrations, and query performance optimization for PostgreSQL, SQLite, Prisma, and Drizzle.
triggers: ["database", "sql", "postgres", "prisma", "drizzle", "migration", "query-optimization", "index"]
---

# Database Architecture & Query Optimization

This skill provides best practices for designing scalable relational schemas, planning zero-downtime migrations, writing optimized SQL queries, and eliminating N+1 performance bottlenecks.

## 1. Schema Modeling & Data Integrity
- **Normalization vs. Performance**: Normalize to Third Normal Form (3NF) to eliminate anomalies; introduce targeted denormalization only for performance-proven hot read paths with clear invalidation guarantees.
- **Foreign Keys & Cascades**: Enforce referential integrity at the database level with foreign keys. Explicitly declare `ON DELETE CASCADE` or `ON DELETE RESTRICT` based on business rules.
- **UUIDs vs BigInt IDs**:
  - Prefer auto-incrementing `BIGINT` or sequential IDs (`UUIDv7` or `ULID`) for primary keys to maintain B-Tree index locality.
  - Avoid random `UUIDv4` as clustered primary keys on massive tables, as they cause high index page fragmentation.

## 2. Indexing Strategy
- **Index for Queries, Not Speculation**: Never index every column. Analyze your actual `WHERE`, `JOIN`, and `ORDER BY` predicates.
- **Composite Index Ordering (Equality First, Range Second)**:
  - If a query runs `WHERE status = 'active' AND created_at > '2025-01-01' ORDER BY created_at`, the index should be `(status, created_at)`.
- **Covering Indexes**: Include frequently selected columns in the index payload (`CREATE INDEX idx_users_active ON users (status) INCLUDE (email, name);`) to enable index-only scans without hitting the main table heap.
- **Partial Indexes**: For sparse states, use partial indexes:
  ```sql
  CREATE INDEX idx_unprocessed_orders ON orders (created_at) WHERE status = 'pending';
  ```

## 3. Zero-Downtime Migrations
- **Expand / Contract Pattern**: Never drop or rename a column in a single migration while live production traffic is active:
  1. **Phase 1 (Expand)**: Add the new column as nullable.
  2. **Phase 2 (Dual Write)**: Update the backend application to write to both the old and new columns.
  3. **Phase 3 (Backfill)**: Run a background script to copy historical data to the new column.
  4. **Phase 4 (Read New)**: Switch application reads exclusively to the new column.
  5. **Phase 5 (Contract)**: Drop the old column in a final maintenance migration.

## 4. ORM & Query Performance (Prisma & Drizzle)
- **Eliminate N+1 Queries**: Never perform database queries inside a loop (`for (const user of users) await getProfile(user.id)`). Use `include`, `select`, or batching (`DataLoader` / `WHERE id IN (...)`).
- **Select Only What You Need**: Avoid `SELECT *`. In Prisma, use `select: { id: true, name: true }` instead of fetching whole rows including heavy JSON or text columns.
- **Connection Pooling**: Always connect through a connection pooler (e.g. PgBouncer, Prisma Accelerate) when using serverless runtimes to avoid exhausting database connection limits.
