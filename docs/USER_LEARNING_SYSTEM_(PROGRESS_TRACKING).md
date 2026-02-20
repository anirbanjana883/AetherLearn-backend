# 🧱 SYSTEM 3: USER LEARNING SYSTEM (PROGRESS TRACKING)

## 1. System Overview
The User Learning System is the core user experience and telemetry engine of AetherLearn. In a production-level EdTech backend (like Udemy or Amazon Prime Learning), tracking exactly where a user left off in a video is paramount. However, standard HTTP-to-Database patterns completely fail at scale for this feature. If 10,000 concurrent students ping the server every 5 seconds to auto-save their watch time, it generates an unsustainable 2,000 database writes per second, leading to CPU exhaustion and cascading failures.

This module implements a Write-Behind Caching Architecture to absorb high-frequency telemetry data using Redis RAM, completely shielding the MongoDB cluster from write exhaustion. It also handles heavily optimized, O(1) read paths for dashboard analytics, daily learning streaks (GitHub-style heatmaps), and course completion percentages.

## 2. Functional Requirements
- **Auto-Save Progress:** Support high-frequency polling (every 5s) from the client video player without degrading system performance.  
- **Resume Playback:** Accurately restore the exact second a user paused or dropped off from a video lecture.  
- **Explicit Completion:** Allow users to explicitly mark a lecture as "Completed", triggering downstream achievement pipelines.  
- **Course Completion Percentage:** Calculate real-time progress for the student dashboard.  
- **Daily Activity Streaks:** Track daily engagement (heatmap) and continuous learning streaks to gamify the learning experience.  

## 3. Non-Functional Requirements
- **High Throughput (Writes):** The system must gracefully handle tens of thousands of requests per second for watch-time syncing (O(1) RAM writes).  
- **Ultra-Low Latency (Reads):** Progress data must be returned in <20ms so the video player does not stall while initializing playback state.  
- **Scalability:** Dashboard calculations must not degrade as a user enrolls in more courses or a course adds more lectures (avoiding N+1 queries).  
- **Data Integrity:** Strict separation of volatile telemetry data (watch time) from immutable historical data (daily streaks).  

## 4. Data Model Design
To prevent data corruption, nested populate bottlenecks, and lock contention, the schema separates concerns into highly optimized collections and denormalized fields.

### 1. Progress Collection (Course-Centric)
Tracks exact video positions per user per course.  
- `userId & courseId`: Indexed using a Compound Unique Index `{ userId: 1, courseId: 1 }` for instant queries.  
- `watchTimes`: A Map storing `{ "lectureId": seconds_watched }`.  
- `completedLectures`: Array of ObjectIds.  
- `lastWatchedLecture`: ObjectId pointer for the "Resume Course" button.  

### 2. Activity Collection (Time-Centric)
Dedicated model for the GitHub-style heatmap.  
- Uses a Compound Unique Index `{ userId: 1, date: 1 }` ensuring exactly one record per user, per day.  

### 3. Denormalized Fields (For O(1) Reads)
- `User.currentStreak & User.lastActiveDate`: Precomputed on write to prevent full-table scans.  
- `Course.totalLectures`: Counter updated automatically on lecture creation/deletion to prevent nested array populating.  

## 5. API Design
| Endpoint | Method | Description | Request Body | Response | Status |
|----------|--------|-------------|--------------|----------|--------|
| /api/v1/progress/save | POST | High-frequency auto-save ping | { courseId, lectureId, watchTime } | { message: "synced" } | 200 |
| /api/v1/progress/complete | POST | Explicitly mark lecture done | { courseId, lectureId } | { message: "completed" } | 200 |
| /api/v1/progress/:courseId | GET | Get combined DB+Redis progress | None | { watchTimes, completionPercentage } | 200 |
| /api/v1/progress/heatmap/mark | POST | Increment daily activity count | None | { message: "marked" } | 200 |
| /api/v1/progress/heatmap/data | GET | Fetch rolling 365-day activity | None | [{ date, count }] | 200 |
| /api/v1/stats/course-progress | GET | Dashboard progress overview | None | [{ courseId, progress }] | 200 |
| /api/v1/stats/student | GET | Fetch streaks & total completed | None | { currentStreak, ... } | 200 |

## 6. System Flow

### Flow A: The Write-Behind Caching Pipeline (Auto-Save)
```
[Video Player]               [Node.js Controller]                   [Redis RAM]                     [MongoDB]
      |                                |                                 |                              |
      |-- 1. POST /save (Every 5s) --->|                                 |                              |
      |                                |-- 2. HSET watch time ---------->| (Updates instantly)          |
      |                                |-- 3. SADD 'dirty_keys' -------->| (Marks for flush)            |
      |<-- 4. 200 OK (< 5ms) ----------|                                 |                              |
      |                                |                                 |                              |
========= MEANWHILE (EVERY 5 MINUTES) =========================================================================
                                       |                                 |                              |
                                       |-- 5. Cron Job Wakes Up          |                              |
                                       |-- 6. SMEMBERS 'dirty_keys' ---->| (Gets all active users)      |
                                       |<-- Returns Keys ----------------|                              |
                                       |-- 7. Read watch times --------->|                              |
                                       |-- 8. Construct `bulkWrite` ----------------------------------->|
                                       |-- 9. SREM keys (Cleanup) ------>|                              |
```

### Flow B: Thundering Herd Protection (Player Initialization)
```
[Video Player] --> GET /progress/:courseId
      |
      |--> 1. Fetch `totalLectures` from Redis (`courseMeta:{courseId}`)
      |       (If miss -> Fetch from DB `.select('totalLectures')` & Cache for 24h)
      |
      |--> 2. Fetch immutable completion data from MongoDB (`Progress` Collection)
      |
      |--> 3. Fetch up-to-the-second watch times from Redis (`progress:{userId}:{courseId}`)
      |
      |--> 4. Merge Redis + DB (Redis wins), Cast Strings -> Numbers, Return to client.
```

## 7. Performance Optimization
- **Redis Write-Behind Caching:** Reduces database write operations by over 98%.  
- **MongoDB BulkWrite:** Background Cron Flusher batches hundreds of user progress updates into a single payload.  
- **O(1) Denormalization:** Maintains `totalLectures` count for instant completion percentage calculation.  
- **Write-Time Precomputation:** `currentStreak` calculated only on lecture completion.  
- **Thundering Herd Protection:** Course metadata cached in Redis with 24h TTL.  

## 8. Fault Tolerance
- **Redis Persistence Safety:** Watch-time data safely resides in Redis if Node.js crashes.  
- **Cron Resiliency:** Gracefully exits if MongoDB is offline; resumes flush when recovered.  
- **Data Type Safety:** Redis strings explicitly cast back to JS Numbers to prevent concatenation bugs.  

## 9. Security Considerations
- **Strict Authorization:** Endpoints protected by `isAuth` middleware.  
- **Cache Expiry (DDoS mitigation):** Redis keys TTL = 24h.  
- **Atomic Upserts:** `findOneAndUpdate` with `{ upsert: true }` prevents race conditions.  

## 10. Trade-offs
- **Eventual Consistency vs. Immediate DB Consistency:** Database may lag up to 5 minutes.  
- **Memory vs. Processing:** Duplicate storage in Redis + MongoDB trades RAM for CPU/Disk I/O savings.  

## 11. Future Improvements
- **WebSockets for Cross-Device Sync:** Socket.IO + Redis Pub/Sub for instant sync across devices.  
- **Time-Series Database Migration:** Move Activity model to TSDB (AWS Timestream, ClickHouse)