# 🧱 SYSTEM 7: SECURITY & AUTHENTICATION FIREWALL

## 1. System Overview

The Security & Authentication Firewall is the primary gatekeeper for the AetherLearn platform. In a scalable EdTech backend dealing with user data, video content, and financial transactions, the system must be resilient against brute-force attacks, payload injections, memory exhaustion, and unauthorized privilege escalation.

System 7 is implemented as a series of cascading middleware layers that intercept, validate, and sanitize every incoming HTTP request before it ever reaches the database or core business logic controllers.

## 2. Functional Requirements

- **Dual-Extraction JWT Auth**: Authenticate users via HTTP-only Cookies (Web Clients) or Bearer Headers (Mobile/External Clients).
- **Strict Payload Validation**: Enforce exact data shapes, types, and lengths using Zod, instantly rejecting malformed data.
- **Privilege Escalation Prevention**: Lock down roles (e.g., student, educator, admin) at the validation layer.
- **Targeted Rate Limiting**: Apply global traffic limits, paired with ultra-strict limits specifically for authentication routes.
- **Payload Size Enforcement**: Restrict JSON payloads to 2MB to prevent memory exhaustion crashes.
- **Hardened HTTP Headers**: Protect against Cross-Site Scripting (XSS) and Clickjacking via custom Helmet.js Content Security Policies (CSP).

## 3. Non-Functional Requirements

- **Low Latency**: Security middleware must process incoming requests in < 10ms so it does not bottleneck the platform.
- **High Availability**: The rate limiters must proactively drop DDoS traffic to keep the Node.js event loop free for legitimate users.
- **Stateless Scalability**: JWT validation must rely on cryptographic verification rather than database lookups to allow the backend to scale horizontally across multiple servers.

## 4. Data Model Design

While System 7 is primarily a middleware layer, it heavily influences the User data model interactions:

- **Stateless Tokens**: The system uses standard JWTs containing only the `userId`. We explicitly avoid storing sensitive data (like emails or raw roles) in the token payload.
- **Zod Schema Alignment**: The Zod validation schemas (`signupSchema`, `loginSchema`) act as a "virtual data model" living in front of Mongoose. Mongoose is slow to reject bad data; Zod rejects it instantly in memory.

## 5. API Design (Guarded Endpoints)

System 7 wraps the Authentication APIs. The endpoints are selectively hardened using the `authLimiter` (5 requests / 15 mins) and Zod payload validation to protect against brute-force attacks and malformed data.

*Note: All endpoints implicitly fall under the global 2MB payload limit and Helmet CSP headers.*

| Endpoint | Method | Guard Middlewares | Description | Status Codes |
|----------|--------|-------------------|-------------|--------------|
| `/api/auth/signup` | POST | `authLimiter`, `validate(zod)` | Registers a new user via email/password. Instantly rejects invalid roles or weak passwords. | 201, 400, 409, 429 |
| `/api/auth/login` | POST | `authLimiter`, `validate(zod)` | Verifies credentials and issues an HTTP-only JWT cookie. | 200, 400, 401, 404, 429 |
| `/api/auth/sendotp` | POST | `authLimiter`, `validate(zod)` | Generates a secure 4-digit OTP and pushes it to the BullMQ email queue. | 200, 400, 404, 429 |
| `/api/auth/verifyotp` | POST | `authLimiter`, `validate(zod)` | Validates the OTP against the database and checks expiration time. | 200, 400, 429 |
| `/api/auth/resetpassword` | POST | `authLimiter`, `validate(zod)` | Hashes and saves the new password (requires prior OTP verification). | 200, 400, 429 |
| `/api/auth/googleauth` | POST | (Global Limiter Only) | Handles OAuth SSO. Bypasses strict limits to prevent blocking legitimate Google callbacks. | 200, 500 |
| `/api/auth/logout` | GET | (Global Limiter Only) | Securely clears the HTTP-only JWT cookie to terminate the session. | 200 |

*(Note: Status 429 represents "Too Many Requests" triggered by the Rate Limiter; 400 represents a Zod Validation Failure or bad OTP).*

## 6. System Flow
```
[Client HTTP Request]
        │
        ▼
 1. [Express Body Parser] ──(Fails if Payload > 2MB)──> 🚨 413 Payload Too Large
        │
        ▼
 2. [Helmet CSP Headers]  ──(Fails on Bad Origins)────> 🚨 403 Forbidden
        │
        ▼
 3. [Rate Limiter]        ──(Fails if > 5 hits/15m)───> 🚨 429 Too Many Requests
        │
        ▼
 4. [Zod Validation]      ──(Fails if Bad Data/Role)──> 🚨 400 Bad Request
        │
        ▼
 5. [JWT Middleware]      ──(Fails if Expired/Fake)───> 🚨 401 Unauthorized
        │
        ▼
[Auth Controller Logic]   <──(Safe to interact with Database!)
```
## 7. Performance Optimization

- **Early Returns**: By placing Zod validation before any database calls, the server saves hundreds of milliseconds and critical database CPU cycles on malformed requests.
- **Memory Management**: Enforcing a strict 2MB limit on `express.json()` ensures that malicious actors cannot crash the Node V8 engine by sending massive, deeply nested JSON objects.

## 8. Fault Tolerance

- **Graceful Expiration Handling**: The `isAuth` middleware explicitly catches `TokenExpiredError` vs `JsonWebTokenError`. Instead of crashing or throwing a generic 500, it sends a clean 401 error instructing the frontend to cleanly log the user out or request a refresh token.
- **Validation Error Mapping**: If Zod fails, the system doesn't just crash. It intelligently maps the exact failed fields (e.g., `password: Must be at least 8 characters long`) to an `ApiError` so the frontend can display contextual hints to the user.

## 9. Security Considerations

- **Cross-Site Scripting (XSS)**: Prevented by storing JWTs in `httpOnly`, `Secure`, `sameSite: "Strict"` cookies. JavaScript running in the browser cannot read the token.
- **Brute-Force Attacks**: A dedicated `authLimiter` strictly throttles login and OTP endpoints to 5 attempts per 15 minutes, making credential stuffing mathematically impossible.
- **Privilege Escalation**: By strictly defining `role: z.enum(["student", "educator", "admin"]).optional()` in Zod, the system is immune to hackers injecting `admin` roles into their signup payloads.
- **3rd-Party Scripts**: Helmet's Content Security Policy is precisely configured to only allow necessary domains (`res.cloudinary.com` and `checkout.razorpay.com`), blocking rogue script injections.

## 10. Trade-offs

- **Stateless Tokens vs. Revocation**: We chose stateless JWTs for speed and scalability. The trade-off is that if a user's account is compromised, we cannot easily "revoke" their specific token before it expires without introducing a stateful database/Redis check on every single request.
- **Strict Validation vs. Versioning**: Zod strictly strips unknown fields. If an older mobile app sends a deprecated field, it will be ignored. If it misses a newly required field, it will hard-fail. We trade backwards-compatibility flexibility for absolute data integrity.

## 11. Future Improvements

- **Redis Token Blocklist**: Integrating Redis to store the IDs of revoked/logged-out JWTs. The `isAuth` middleware would check this fast-cache memory to enable instant global logouts.
- **Cloudflare WAF**: Moving the IP Rate Limiting out of Node.js and into a Web Application Firewall (WAF) like Cloudflare, so malicious traffic is blocked at the edge before it even reaches our Render servers.
- **Refresh Token Rotation**: Implementing short-lived Access Tokens (15 mins) and long-lived Refresh Tokens (7 days) for ultimate session security.