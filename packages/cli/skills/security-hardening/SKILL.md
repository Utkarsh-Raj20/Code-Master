---
name: security-hardening
description: Web application security audits and defenses. Covers OWASP Top 10, SQL injection prevention, XSS mitigation, CSRF tokens, secure JWT/session handling, and secret hygiene.
triggers: ["security", "owasp", "xss", "csrf", "sql-injection", "auth", "jwt", "sanitize", "vulnerability"]
---

# Web Application Security & Hardening

This skill provides an actionable security checklist to identify and remediate vulnerabilities, safeguard sensitive customer data, and meet production compliance standards.

## 1. OWASP Top 10 Defenses
- **Injection Attacks (SQL / NoSQL / Command Injection)**:
  - Never concatenate or interpolate raw user input into SQL queries or shell execution strings (`db.query("SELECT * FROM users WHERE id = " + id)` is strictly prohibited).
  - Always use parameterized queries or trusted ORM/query builder abstractions.
  - When executing system commands, avoid shell wrappers (`exec`) and use arguments arrays with `spawn` or `execFile`.
- **Cross-Site Scripting (XSS)**:
  - Never use `dangerouslySetInnerHTML` without rigorous HTML sanitization using `DOMPurify` or `sanitize-html`.
  - Set a robust `Content-Security-Policy` (CSP) header prohibiting `unsafe-inline` scripts and restricting external asset origins.
- **Cross-Site Request Forgery (CSRF)**:
  - Enforce `SameSite=Lax` or `SameSite=Strict` on authentication cookies.
  - For state-mutating requests (POST, PUT, DELETE), verify double-submit CSRF tokens or custom headers (`X-Requested-With`).

## 2. Authentication & Session Hygiene
- **Cookie Flags**: Store authentication tokens in cookies with mandatory security flags:
  - `HttpOnly: true` (prevents JavaScript access via XSS)
  - `Secure: true` (transmitted only over HTTPS)
  - `SameSite: "lax"` (mitigates CSRF)
- **Password Storage**: Always hash passwords using modern, memory-hard hashing functions:
  - Prefer Argon2id (`argon2`) or bcrypt with work factor >= 12.
  - Never use MD5, SHA-1, or plain SHA-256 for passwords.
- **Token Expiry & Revocation**:
  - Keep access tokens short-lived (e.g. 15 minutes).
  - Use refresh tokens stored in database sessions with explicit revocation support on logout or password reset.

## 3. Rate Limiting & Denial of Service Protection
- **Route-Specific Throttling**: Apply aggressive rate limits to sensitive authentication routes:
  - Login / Password Reset: Max 5 attempts per minute per IP.
  - Payment / OTP Endpoints: Max 3 attempts per minute.
- **Payload Size Limits**: Enforce strict body-parser limits (e.g. `limit: '100kb'` for JSON, max 10MB for file uploads) to prevent memory exhaustion attacks.

## 4. Secrets & Sensitive Data Leakage
- **Log Masking**: Never log passwords, API keys, credit cards, or JWT tokens to stdout or persistent file logs.
- **Git Hygiene**: Enforce `.gitignore` on `.env*` files. Use pre-commit hooks (`gitleaks` or `git-secrets`) to block accidental commits of credentials.
- **Error Disclosures**: In production environments, never return stack traces or raw database error strings to the HTTP response client.

