# 🧱 SYSTEM 5: REVIEW & RATING SYSTEM

## 1. System Overview

The Review & Rating System manages student feedback, course ratings, and testimonial feeds for AetherLearn. In a real-world scalable learning platform (like Udemy or Coursera), a viral course might accumulate tens of thousands of reviews.

The standard approach of embedding review IDs into a Course document array creates a fatal Unbounded Array Anti-Pattern, breaking MongoDB's 16MB document limit. Furthermore, using MongoDB `$avg` aggregation pipelines to calculate the course's star rating on every page load causes severe CPU spikes and database lock contention.

To solve this, System 5 completely decouples Reviews from the Course model and utilizes a Redis-backed O(1) Math Engine with a Write-Behind Caching architecture. This ensures that course landing pages load instantly, ratings are calculated in memory, and the primary database is shielded from concurrent write race conditions.

## 2. Functional Requirements

- **Add Review**: Allow enrolled students to leave a 1–5 star rating and an optional text comment.
- **Edit Review**: Allow students to update their rating and comment at any time.
- **One Review Per Student**: Strictly enforce that a user can only review a specific course once.
- **Course Reviews Feed**: Display a paginated list of reviews for a specific course, alongside the real-time average rating and total review count.
- **Global Platform Feed**: Provide a paginated feed of platform-wide reviews, filterable by a minimum star rating (e.g., fetching only 4 and 5-star reviews for the homepage).

## 3. Non-Functional Requirements

- **Scalability**: The system must handle courses with 100,000+ reviews without degrading read performance or crashing due to document size limits.
- **Performance**: Calculating the average rating must execute in O(1) time complexity regardless of the total review count.
- **Reliability**: Background synchronizations must utilize distributed locks to prevent race conditions during multi-server deployments.

## 4. Data Model Design

The data is structurally decoupled to ensure infinite scalability.

**1. Review Collection:**
- `course`: ObjectId (Reference to Course).
- `user`: ObjectId (Reference to User).
- `rating`: Number (Strictly bounded 1-5).
- `comment`: String (Max length constraints).
- **Indexing**: A compound unique index `{ course: 1, user: 1 }` guarantees database-level enforcement of the "one review per student" rule, immune to API race conditions.

**2. Course Collection (Denormalized Fields):**
- The unbounded `reviews: [ObjectId]` array is completely removed.
- Replaced with two flat integers: `avgRating` (Number) and `reviewCount` (Number). These act as the eventual-consistency fallback for the catalog search.

## 5. API Design

| Endpoint | Method | Description | Request Body | Response | Status |
|----------|--------|-------------|--------------|----------|--------|
| `/api/v1/reviews/course/:courseId` | POST | Add a new review to a course | `{ rating: 5, comment: "..." }` | `{ review }` | 201 |
| `/api/v1/reviews/:reviewId` | PUT | Edit an existing review | `{ rating: 4, comment: "..." }` | `{ review }` | 200 |
| `/api/v1/reviews/course/:courseId` | GET | Get paginated course reviews + O(1) stats | None (Query: `?page=1&limit=10`) | `{ stats: {avgRating, reviewCount}, reviews }` | 200 |
| `/api/v1/reviews/` | GET | Get global platform reviews | None (Query: `?minRating=4&limit=5`) | `{ reviews, totalPages, totalReviews }` | 200 |

## 6. System Flow

### Flow A: Adding/Editing a Review (Write Path)
```
[Student]                 [Node.js API]                               [Redis]                    [MongoDB]
   |                           |                                         |                           |
   |-- POST /review ---------->| 1. Check Enrollment & Validate Bounds   |                           |
   |                           | 2. Save Review Document ----------------|-------------------------->| (Insert/Update)
   |                           | 3. HINCRBY courseRating totalStars ---->| (O(1) Math operation)     |
   |                           | 4. HINCRBY courseRating reviewCount --->| (O(1) Math operation)     |
   |                           | 5. SADD dirty_rating_courses ---------->| (Mark for Cron Flush)     |
   |<-- 201 Created -----------|                                         |                           |
```
### Flow B: Distributed Database Sync (Cron Job)
```
[Cron Worker]                 [Redis]                               [MongoDB]
   |                             |                                      |
   |-- SET NX (Acquire Lock) --->|                                      |
   |-- SMEMBERS dirty_courses -->| (Fetch pending courses)              |
   |-- Loop & HGETALL stats ---->| (Fetch live totals)                  |
   |-- Calculate: Stars/Count    |                                      |
   |-- FindByIdAndUpdate ---------------------------------------------->| (Write to Catalog)
   |-- DEL dirty_courses ------->|                                      |
   |-- DEL NX (Release Lock) --->|                                      |
```
## 7. Performance Optimization

- **O(1) Redis Math Engine**: Instead of querying the database to sum up 50,000 ratings, Redis maintains a running tally of `totalStars` and `reviewCount` via atomic `HINCRBY` operations. The average is calculated instantly in Node.js via simple division: `(totalStars / reviewCount)`.
- **Delta Math on Edits**: When a user edits a review (e.g., changing from 3 stars to 5 stars), the system does not recalculate the entire course average. It calculates the mathematical delta (+2) and simply increments the Redis `totalStars` hash by 2.
- **Database Offloading**: By utilizing a distributed Cron Flusher every 5 minutes, we avoid the "Write-Heavy Race Condition" where 100 concurrent reviews would spawn 100 conflicting database syncs.

## 8. Fault Tolerance

- **Cold-Start Cache Re-Warming**: If the Redis cluster crashes or restarts, all O(1) counters are lost (`totalStars` and `reviewCount` become 0). The `GET` controller contains a fallback mechanism: it detects the empty cache, fetches the historical `avgRating` and `reviewCount` from MongoDB, serves the request, and instantly reconstructs the mathematical totals back into Redis, re-warming the cache for the next user.
- **Distributed Locking**: The Cron Flusher utilizes a `SET NX EX` distributed lock to guarantee that if AetherLearn is scaled across multiple server instances, only one instance flushes the ratings to MongoDB, preventing data corruption.

## 9. Security Considerations

- **Enrollment Gating**: The `addReview` controller explicitly cross-references the user's `enrolledCourses` array. If a user has not purchased or enrolled in the course, the API rejects the review with a `403 Forbidden`.
- **Boundary Validation & Type Poisoning**: Strict validation ensures that `rating` is >= 1 and <= 5. If this validation fails, the request is aborted before it touches Redis. This prevents malicious API requests (e.g., `{ rating: 5000 }`) from permanently poisoning the mathematical average in the cache.
- **Compound Unique Index**: The MongoDB schema enforces `{ course: 1, user: 1, unique: true }`. Even if a user bypasses the frontend and spams the API with 5 concurrent requests, the database lock will reject all but the first, preventing review stuffing.

## 10. Trade-offs

- **Eventual Consistency in the Catalog**: Because the primary Course document's `avgRating` is only updated every 5 minutes by the Cron job, the global catalog/search page might show a rating that is a few minutes behind the live Course Landing Page (which reads directly from the real-time Redis cache). This is an industry-standard tradeoff to achieve high availability.
- **Redundant Data Storage**: We temporarily store the mathematical components (`totalStars`) in Redis and the compiled result (`avgRating`) in MongoDB, trading a negligible amount of RAM for a massive reduction in CPU computational overhead.

## 11. Future Improvements

- **Sentiment Analysis Integration**: Hook the review creation pipeline into an asynchronous Kafka queue that runs the text comment through a lightweight LLM/NLP model to automatically flag toxic language or highlight highly praised features.
- **Helpfulness Voting**: Add an upvotes counter to the Review model, allowing students to upvote helpful reviews. The `getCourseReviews` endpoint can then be modified to sort by upvotes instead of `createdAt` to surface the most valuable feedback automatically.