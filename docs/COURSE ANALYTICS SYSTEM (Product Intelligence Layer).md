# 🧱 SYSTEM 4: COURSE ANALYTICS SYSTEM (Product Intelligence Layer)

## 1. System Overview

The Course Analytics System is the Product Intelligence Layer of AetherLearn. In a production-level EdTech platform like Udemy or Amazon Prime Learning, creators rely heavily on data to optimize their content. However, telemetry data (like page views and 5-second watch-time pings) generates a massive, continuous stream of write requests.

If this data is written directly to the primary database (MongoDB), it creates severe write-lock contention, exhausting the connection pool and crashing the platform. This module solves this by utilizing Redis Atomic Counters and HyperLogLog for extreme-speed, in-memory data ingestion, paired with a Lambda Architecture approach to merge hot (Redis) and cold (MongoDB) data for real-time instructor dashboards.

## 2. Functional Requirements

- **Course View Tracking**: Count every time a user opens a course landing page.
- **Lecture Telemetry Tracking**: Accumulate total watch time and individual lecture views.
- **Real-Time Instructor Dashboard**: Provide creators with live metrics, including:
  - Total Course Views
  - Unique Active Users
  - Average Watch Time per User
  - Engagement Funnel (Drop-Off Rate)
  - Most Watched Lecture identification.

## 3. Non-Functional Requirements

- **Extreme Write Throughput**: Capable of absorbing thousands of telemetry pings per second at O(1) time complexity.
- **Low Latency Reads**: The instructor dashboard must calculate complex aggregations and merge datasets in under 100ms.
- **Horizontal Scalability**: Background aggregation tasks (cron jobs) must support multi-server deployments without causing data duplication or race conditions.

## 4. Data Model Design

Analytics data is completely isolated from the core Course model to prevent massive, frequently-changing documents from bloating standard course queries.

**CourseAnalytics Collection**:
- `courseId`: Indexed and unique (`{ courseId: 1 }`). One analytics document per course.
- `totalViews` & `uniqueActiveUsers`: Integers aggregating course-level stats.
- `lectureStats`: A MongoDB Map (Dictionary) where the key is the lectureId (String) and the value contains `{ views, totalWatchTime }`. This allows O(1) sub-document updates during the bulk flush.

## 5. API Design

| Endpoint | Method | Description | Request Body | Response | Status |
|----------|--------|-------------|--------------|----------|--------|
| `/api/v1/analytics/view/:courseId` | POST | Track course landing page view | None | `{ message: "tracked" }` | 200 |
| `/api/v1/analytics/telemetry` | POST | Track video player engagement | `{ courseId, lectureId, watchTimeDelta }` | `{ message: "tracked" }` | 200 |
| `/api/v1/analytics/instructor/:courseId` | GET | Fetch real-time dashboard stats | None | `{ overview, engagementFunnel }` | 200 |

## 6. System Flow

This system operates across three distinct flows: Ingestion, Aggregation, and Reporting.

### Flow A: High-Speed Telemetry Ingestion
```
[Client Player]               [Node.js API]                         [Redis RAM]
      |                             |                                    |
      |-- POST /telemetry --------->|                                    |
      |   (delta: 5s)               |-- INCR lecture_views:123 --------->| (O(1) Atomic)
      |                             |-- INCRBY lecture_watchtime:123 --->| (O(1) Atomic)
      |                             |-- SADD dirty_analytics_courses --->| (Mark for flush)
      |<-- 200 OK (< 5ms) ----------|                                    |
```
### Flow B: Distributed Background Flush (Every 5 Mins)
```
[Cron Worker Node 1]          [Redis]                               [MongoDB]
      |                          |                                      |
      |-- SET NX (Acquire Lock)->|                                      |
      |-- SMEMBERS dirty_keys -->|                                      |
      |-- MULTI GET/SET to 0 --->| (Atomically reads and zeroes out)    |
      |                          |                                      |
      |-- Map to updateDoc       |                                      |
      |-- Execute BulkWrite ------------------------------------------->| (Heavy I/O)
      |-- DEL NX (Release Lock)->|                                      |
```
### Flow C: Lambda Architecture Dashboard (Real-Time Merge)
```
[Instructor]                 [Node.js Controller]                          [Datastores]
      |                               |                                         |
      |-- GET /instructor/:id ------->|                                         |
      |                               |=== PARALLEL FETCH =====================>|
      |                               | 1. DB: CourseAnalytics.findOne()        |
      |                               | 2. Redis: MGET (Live Batched Keys)      |
      |                               |<========================================|
      |                               |                                         |
      |                               |-- Merge DB Stats + Redis Stats          |
      |                               |-- Calculate Drop-Off & Averages         |
      |<-- Return Dashboard Data -----|                                         |
```
## 7. Performance Optimization

- **Network Batching (MGET)**: The dashboard completely avoids the "N+1 Problem" when querying HTTP-based Redis providers (like Upstash). By mapping all lecture keys into an array and executing a single MGET command, network requests are reduced from 100+ down to exactly 2.
- **HyperLogLog (PFADD / PFCOUNT)**: Tracking "Unique Active Users" using standard Sets would consume massive amounts of RAM (e.g., storing 100,000 UUIDs). Using Redis HyperLogLog provides a highly accurate count using a fixed memory overhead of just 12KB per course.
- **Memory-Optimized Populate**: The dashboard heavily restricts the Mongoose `.populate()` payload to `select: '_id lectureTitle'`, preventing the database from loading megabytes of useless video URLs and metadata into Node.js RAM.

## 8. Fault Tolerance

- **Distributed Locking (SET NX EX)**: If the backend is horizontally scaled across 5 servers, the cron job will trigger 5 times simultaneously. The Redis distributed lock guarantees that only the first server executes the database flush, preventing catastrophic data duplication. The `EX` (expiration) flag acts as a dead-man's switch, ensuring the lock drops after 4 minutes if a server crashes mid-flush.
- **Redis MULTI/EXEC Pipelines**: When the cron flusher reads the current view counts to save them to MongoDB, it uses a Redis transaction block to `GET` the value and instantly `SET` it to 0. This ensures no user views are accidentally dropped in the milliseconds between reading and resetting the counter.

## 9. Security Considerations

- **Dashboard Authorization**: The dashboard endpoint inherently enforces a strict ownership check: `Course.findOne({ _id: courseId, creator: req.userId })`. An instructor attempting to view another creator's analytics will receive a 403 Unauthorized response.

## 10. Trade-offs

- **HyperLogLog Accuracy**: HyperLogLog has a standard error rate of ~0.81%. We traded absolute, mathematically perfect user counting in favor of saving gigabytes of server RAM, which is standard practice for scalable analytics.
- **Code Complexity vs. Response Time**: Implementing the Lambda Architecture (merging live cache with cold DB data on the fly) significantly increased the cyclomatic complexity of the controller, but it was a necessary trade-off to provide instructors with real-time feedback without destroying the database.

## 11. Future Improvements

- **OLAP Migration**: As the platform scales to enterprise levels, tracking detailed time-series telemetry in MongoDB becomes an anti-pattern. Future iterations will stream these Redis batches into a dedicated OLAP data warehouse (like ClickHouse or Snowflake) using Apache Kafka.
- **Granular Video Heatmaps**: Upgrading the telemetry payload to track an array of specific video timestamps watched, allowing the dashboard to show exactly which 10-second segment of a video is re-watched the most.