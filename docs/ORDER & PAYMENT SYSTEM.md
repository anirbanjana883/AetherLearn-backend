# 🧱 SYSTEM 6: ORDER & PAYMENT SYSTEM

## 1. System Overview

The Order & Payment System is the financial engine of AetherLearn, powered by the Razorpay payment gateway. In a production-level EdTech platform (akin to Udemy), financial transactions are the most critical point of failure. A dropped internet connection during a payment step can lead to a scenario where a user is charged, but the course is not unlocked, resulting in chargebacks and a poor user experience.

To mitigate this, System 6 implements a Zero-Trust Webhook-Driven Architecture. It treats the frontend purely as a UI state manager and moves 100% of the enrollment authority to a secure, backend-to-backend webhook. All database operations are wrapped in ACID Transactions to guarantee that the payment state, user library, and course analytics succeed or fail as a single, unbreakable unit.

## 2. Functional Requirements

- **Secure Checkout Initialization**: Generate a Razorpay order tied cryptographically to a backend Order document (the "Paper Trail").
- **Frontend State Acknowledgment**: Allow the client to submit a payment receipt to transition the UI into a "Verifying" state.
- **Asynchronous Webhook Enrollment**: A server-to-server listener that securely verifies the payment, prevents duplicate increments, and unlocks the course.
- **Multi-Project Routing (Bouncer Logic)**: Intelligently filter incoming webhooks via metadata tags (`notes.project`) so multiple distinct startup projects can share a single Razorpay account without crosstalk.

## 3. Non-Functional Requirements

- **Idempotency**: The system must guarantee that a user is never enrolled twice and an order is never processed twice, regardless of network retries or duplicate webhook deliveries.
- **Data Consistency (ACID)**: The database must never enter a partial state (e.g., deducting money but failing to update the course enrollment counter).
- **Security & Immutability**: The system must be cryptographically immune to payload tampering (e.g., a user swapping a $10 course ID for a $500 course ID).
- **Scalability**: The enrollment tracking must avoid MongoDB's 16MB document limits by using mathematical counters instead of unbounded arrays.

## 4. Data Model Design

The Order model is the central source of truth, locking in the price and course details before the user even talks to the payment gateway.

**1. Order Collection (The Paper Trail):**
- `user`: ObjectId (Reference to User).
- `course`: ObjectId (Reference to Course).
- `amount`: Number (Locked in at creation).
- `status`: Enum (`PENDING`, `VERIFYING`, `SUCCESS`, `FAILED`).
- `razorpayOrderId` & `razorpayPaymentId`: Strings (Sparse unique indexes to map transactions).

**2. Course Collection Updates:**
- **Anti-Pattern Removed**: The unbounded `enrolledStudents: [ObjectId]` array was removed.
- **Scalable Addition**: Replaced with `enrolledCount: { type: Number, default: 0 }`.

**3. User Collection Updates:**
- Tracks ownership via `enrolledCourses: [ObjectId]`. (Since a user typically buys a finite number of courses, this array is bounded by human limits and is safe).

## 5. API Design

| Endpoint | Method | Description | Request Body / Query | Response | Status Codes |
|----------|--------|-------------|----------------------|----------|--------------|
| `/api/order/razorpay-order` | POST | Creates backend DB order & Razorpay Order ID | `{ courseId: "..." }` | `{ order_id, amount, currency }` | 200, 400, 404 |
| `/api/order/verifypayment` | POST | Frontend sync verify (Sets status to VERIFYING) | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ message: "Processing..." }` | 200, 400, 404 |
| `/api/order/webhook` | POST | The Ultimate Source of Truth (Executes Enrollment) | Raw Buffer (from Razorpay) | `200 OK` (Always) | 200, 400, 500 |

## 6. System Flow

The architecture explicitly splits the flow into the Client Path (untrusted) and the Webhook Path (trusted).

### Flow A: Checkout & Verification Initiation
```
[Client]                      [Node.js Backend]                           [Razorpay]
   |                                 |                                        |
   |-- 1. POST /razorpay-order ----->|                                        |
   |                                 |-- 2. Create PENDING Order (DB)         |
   |                                 |-- 3. Generate Order ID --------------->|
   |<-- 4. Return Razorpay ID -------|                                        |
   |-- 5. Complete Payment --------->| (Client opens Razorpay UI)             |
   |-- 6. POST /verifypayment ------>|                                        |
   |                                 |-- 7. Validate HMAC Signature           |
   |                                 |-- 8. Update Order -> VERIFYING (DB)    |
   |<-- 9. 200 OK (Loading UI) ------|                                        |
```
### Flow B: Webhook Source of Truth & ACID Enrollment
```
[Razorpay]                    [Node.js Webhook Controller]                [MongoDB]
   |                                 |                                        |
   |-- 1. POST /webhook (Raw) ------>|                                        |
   |                                 |-- 2. Validate HMAC Signature (Raw)     |
   |                                 |-- 3. Parse JSON & Check `notes` Tag    |
   |                                 |-- 4. Check Idempotency / Already Enrolled|
   |                                 |-- 5. Start ACID Transaction            |
   |                                 |-- 6. User.update ($addToSet) --------->|
   |                                 |-- 7. Course.update ($inc count) ------>|
   |                                 |-- 8. Order.update (SUCCESS) ---------->|
   |                                 |-- 9. Commit Transaction                |
   |<-- 10. 200 OK (Processed) ------|                                        |

```
## 7. Performance Optimization

- **Bouncer Logic (Early Returns)**: Because the webhook endpoint handles traffic for multiple projects (AetherLearn, Ranbhoomi, etc.), it checks `payment.notes.project === "AetherLearn"` immediately after parsing. If it doesn't match, it returns a `200 OK` in O(1) time without touching the database, saving massive CPU cycles during webhook "shotgun blasts".
- **O(1) Enrollment Tracking**: Instead of running heavy array operations across large course documents, the system uses `$inc: { enrolledCount: 1 }`, which is highly optimized at the MongoDB engine level.

## 8. Fault Tolerance

- **ACID Database Transactions**: The webhook utilizes `mongoose.startSession()`. If the server crashes or network drops after the user's `enrolledCourses` array is updated but before the order is marked as `SUCCESS`, MongoDB rolls back the entire transaction automatically. No partial data corruption.
- **Webhook Idempotency**: Payment gateways retry webhooks if they don't receive a timely 200 response. To prevent duplicate `$inc` operations on the course counter, the controller runs a pre-check: `User.findOne({ _id: user, enrolledCourses: course })`. If true, it acknowledges the webhook without re-running the transaction.
- **Raw Buffer Processing**: The global `app.js` bypasses `express.json()` specifically for the webhook route using `express.raw({ type: 'application/json' })`. This prevents Express from altering the payload's whitespace, guaranteeing that the HMAC signature check will never falsely fail.

## 9. Security Considerations

- **Zero-Trust Frontend**: The `/verifypayment` endpoint completely ignores `courseId` or `userId` provided by the client, and does not possess the authority to enroll a user. It solely acts as a status updater. This prevents payload spoofing and replay attacks.
- **HMAC SHA256 Signatures**: Both the frontend payload and the webhook payload are cryptographically hashed using `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` respectively.
- **Express Rate Limiting**: The global API is wrapped in a `windowMs: 10 * 60 * 1000, max: 100` rate limiter to prevent DDoS attacks and brute-force checkout spam.

## 10. Trade-offs

- **Eventual Consistency in UX**: By moving the `SUCCESS` authority entirely to the webhook, the user experience trades instant gratification for bulletproof security. The frontend must now poll the backend or wait for a WebSocket/Webhook confirmation before showing the "Course Unlocked" screen.
- **Metadata Overhead**: Using the `notes.project` field inside the Razorpay payload requires strict adherence to naming conventions across all developer projects. If a typo is made during order creation, the webhook will silently ignore the valid payment.

## 11. Future Improvements

- **Message Queues (BullMQ/RabbitMQ)**: Post-payment tasks (generating PDF receipts, sending welcome emails, granting Discord roles) should be delegated to an async queue triggered at the end of the webhook transaction to ensure the endpoint responds to Razorpay in < 100ms.
- **Refund Pipeline**: Implementing an internal Admin Dashboard endpoint that triggers Razorpay Refunds and reverses the ACID transaction (pulling the course via `$pull` and decrementing the `$inc` counter).
- **Subscription Engine**: Upgrading the static `amount` orders to Razorpay Subscriptions to support "AetherLearn Pro" monthly recurring billing.