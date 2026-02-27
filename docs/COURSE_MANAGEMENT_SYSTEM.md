# 🧱 SYSTEM 1: COURSE MANAGEMENT & VIDEO INGESTION SYSTEM

## 1. System Overview
The Course Management System acts as the structural backbone of the AetherLearn platform. It provides the core authoring capabilities for instructors to create, organize, and publish educational content. In a real-world, highly scalable learning platform (like Udemy or Coursera), content creation is not a simple database write; it involves managing deep hierarchical data (Courses -> Sections -> Lectures) and securely ingesting massive media files without causing server memory exhaustion. This module handles the data hierarchy, the resilient chunked ingestion of raw video files, and delegates CPU-heavy transcoding to an isolated, Dockerized Background Worker Engine.

## 2. Functional Requirements
***Hierarchical Content Authoring:*** Instructors can create Courses, append Sections (Modules), and attach Lectures to those sections using deeply nested RESTful endpoints.

***Metadata Management:*** Update course details, pricing, thumbnails, and toggle "Free Preview" access at the granular lecture level.

***Chunked Video Uploading:*** Support reliable uploading of massive video files (up to 5GB) over unstable networks by slicing them into 5MB chunks.

***Asynchronous Video Transcoding:*** Standardize diverse instructor uploads into optimized 720p/H.264 web-friendly formats using FFmpeg in an isolated background process.

***Publishing State Machine:*** Isolate draft content from live content and track granular lecture states (`AWAITING_MEDIA`, `PROCESSING`, `READY`, `FAILED`).

***Safe Deletion Pipeline:*** Cascading delete pipelines that clean up parent references, child documents, and physical cloud media simultaneously.

## 3. Non-Functional Requirements
***Scalability:*** Heavy CPU tasks (`FFmpeg transcoding`) are entirely decoupled from the Express.js API, preventing Event Loop blocking and allowing independent scaling of Web and Worker nodes. File uploads bypass Node.js RAM limits by streaming binary chunks directly to the disk buffer.

***Reliability (ACID Compliance):*** Complex document linking (e.g., creating a lecture and pushing its ID to the parent section's array) is fully atomic using MongoDB `session.startTransaction()`.

***Performance:*** High-traffic read endpoints are served from Redis. Intensive database writes (Views, Ratings) are staggered and batched using Write-Back caching (every 5 minutes) to protect MongoDB from connection spikes.

## 4. Data Model Design
To bypass MongoDB's strict 16MB per-document limit, the system completely avoids the "Embedded Document" anti-pattern for large, infinitely growing structures. Instead, it utilizes a normalized Reference Pattern.

***Course Collection:*** Stores global metadata (title, price, creatorId, totalLectures) and an array of Section ObjectIds.

***Section Collection:*** Stores module organization (title, courseId) and an array of Lecture ObjectIds.
Lecture Collection: Stores granular content payloads, video processing states, duration, raw bucket URLs, and final optimized delivery URLs.

***Reasoning:*** This schema allows a single course to scale infinitely to thousands of lectures. It also allows the Background Worker to update a single lecture's status (e.g., `PROCESSING` to `READY`) without re-writing or locking a massive, deeply nested course document, significantly reducing database I/O.


## 5. API Design

| Endpoint | Method | Description | Request Body / Params | Response | Status |
|----------|--------|-------------|----------------------|----------|--------|
| /api/course/getpublished | GET | Fetch all live courses | None | Array of Course | 200 |
| /api/course/:courseId/sections | POST | Add section to course | { sectionTitle } | Section object | 201 |
| /api/course/:courseId/lectures | GET | Fetch populated curriculum | courseId param | Course w/ populated tree | 200 |
| /api/course/:courseId/sections/:sectionId/lectures | POST | Add lecture slot | { lectureTitle } | Lecture object | 201 |
| /api/course/lectures/:lectureId | PATCH | Update metadata/preview | { lectureTitle, isPreviewFree } | Lecture object | 200 |
| /api/course/uploads/init | POST | Start chunk upload | { lectureId } | { uploadId } | 200 |
| /api/course/uploads/chunk | POST | Receive 5MB slice | multipart/form-data (chunk, uploadId, index) | { message } | 200 |
| /api/course/uploads/complete | POST | Stitch & trigger worker | { uploadId, lectureId, totalChunks } | { message } | 200 |
| /api/course/sections/:sectionId/lectures/:lectureId | DELETE | Cascade remove lecture | sectionId, lectureId params | {} | 200 |

## 6. System Flow
```
Decoupled Chunked Upload & Transcoding Pipeline:
[Client UI]                   [Express API Gateway]           [Local Disk Buffer]       [BullMQ / Redis]        [Docker Worker Engine]
   |                                |                               |                          |                          |
   |-- 1. POST /init -------------->| Generate unique uploadId      |                          |                          |
   |<-- Return uploadId ------------|                               |                          |                          |
   |                                |                               |                          |                          |
   |-- 2. POST /chunk (0) --------->| Intercept via Multer Disk --->| Write `uploadId/0`       |                          |
   |-- 3. POST /chunk (1) --------->| Intercept via Multer Disk --->| Write `uploadId/1`       |                          |
   |                                |                               |                          |                          |
   |-- 4. POST /complete ---------->| Initialize WriteStream        |                          |                          |
   |                                | Read chunks sequentially ---->| Stitch into `.mp4`       |                          |
   |                                | Upload Stitched RAW to Cloud  |                          |                          |
   |                                | Cleanup local chunks/temp --->| DELETE local temp        |                          |
   |                                | Update Lecture: PROCESSING    |                          |                          |
   |                                | Add Transcode Job ----------->|                          |                          |
   |<-- Return 200 (Backgrounding)--|                               |======> JOB QUEUED =======|                          |
                                                                                               |-- 5. Pull Job ---------->|
                                                                                               |                          | Download RAW via Stream
                                                                                               |                          | Spawn Native FFmpeg
                                                                                               |                          | Compress to 720p/H.264
                                                                                               |                          | Upload Final to Cloud
                                                                                               |                          | DB Update: READY
                                                                                               |<-- Publish Redis Msg ----|
```
## 7. Performance Optimization
***Asynchronous Task Queues:*** Heavy lifting (emails, video compression) is offloaded to Upstash Redis using BullMQ, keeping the API's median response time under 300ms.

***Write-Back Caching via Cron Flushers:*** High-frequency metrics (video views, watch time, course ratings) are stored instantly in Redis HyperLogLogs and Hash-Sets. Staggered node-cron workers (analyticsFlusher, ratingFlusher) bulk-write this data to MongoDB every 5 minutes, preventing DB connection exhaustion.

***Disk Streaming:*** The chunked upload writes binary data directly to disk (fs.createWriteStream), and the worker streams data directly from Cloudinary to FFmpeg. This keeps memory overhead flat regardless of concurrency or video size.

## 8. Fault Tolerance
***Distributed Flushing Locks:*** Cron jobs use Redis SET NX EX distributed locks to guarantee that in a multi-container deployment, only one instance flushes analytics to the DB at a time, preventing race conditions and duplicated data.

***MongoDB Transactions:*** Wrapping hierarchical creation in session.startTransaction(). If the server crashes after creating a lecture but before incrementing the parent course's totalLectures counter, the transaction rolls back cleanly.

***Worker Crash Resilience:*** If FFmpeg fails due to a corrupted video, BullMQ isolates the failure. The finally { await fs.remove(tempDir) } block guarantees local ephemeral disk cleanup to prevent Docker/Render "Disk Full" cascading failures.

## 9. Security Considerations
***Strict Resource Ownership:*** All PATCH and DELETE routes implement an Ownership Check (req.user._id.toString() === course.creator.toString()) ensuring instructors can only mutate their own curriculum.

***Input Validation:*** Multer middleware safely rejects non-media MIME types. The API enforces a strict 2MB JSON payload limit while delegating large binary uploads to chunked multipart/form-data streams.

***JWT Protection:*** All CMS modifications are secured by an isAuth middleware that parses and validates HttpOnly cookies or Bearer tokens.

## 10. Trade-offs
***Local Stitching vs. Direct S3:*** Writing chunks to the API's local disk first increases Disk I/O and requires temporary ephemeral storage (managed via Docker volumes), but heavily protects Node's single-threaded RAM compared to holding buffers in memory.

***Complexity vs. UX:*** Chunked uploading requires significantly more frontend state management (progress bars, loop retries) and backend code compared to a simple synchronous upload endpoint, but was chosen to support instructors operating on high-latency, unstable networks.

## 11. Future Improvements
***Direct-to-S3 Pre-signed URLs:*** Bypassing the Node.js API server entirely by generating AWS S3/Cloudflare R2 Multipart Upload URLs, allowing the client browser to push bytes directly to Edge nodes.

***Adaptive Bitrate Streaming (HLS):*** Upgrading the FFmpeg worker to generate .m3u8 playlists and multi-resolution TS segments (1080p, 720p, 480p) for Netflix-style adaptive bandwidth streaming.