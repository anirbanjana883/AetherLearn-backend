# 🧱 SYSTEM 1: COURSE MANAGEMENT SYSTEM

## 1. System Overview

The Course Management System acts as the structural backbone of the AetherLearn platform. It provides the core authoring capabilities for instructors to create, organize, and publish educational content. In a real-world, highly scalable learning platform (like Udemy or Coursera), content creation is not a simple database write; it involves managing deep hierarchical data (Courses -> Sections -> Lectures) and securely ingesting massive media files without causing server memory exhaustion. This module handles both the data hierarchy and the resilient chunked ingestion of raw video files.

## 2. Functional Requirements

- **Hierarchical Content Authoring**: Instructors can create Courses, append Sections (Modules), and attach Lectures to those sections.
- **Metadata Management**: Update course details, pricing, and thumbnails.
- **Chunked Video Uploading**: Support reliable uploading of massive video files (up to 5GB) over unstable networks by slicing them into smaller chunks.
- **Safe Deletion Pipeline**: Deleting a parent course triggers a cascading delete of all underlying sections, lectures, and cloud media.
- **Publishing State Machine**: Isolate draft content from live, published content.

## 3. Non-Functional Requirements

- **Scalability**: File uploads must bypass Node.js RAM (V8 engine limits) by streaming binary chunks directly to the disk/cloud buffer.
- **Reliability (ACID Compliance)**: Complex document linking (e.g., creating a lecture and updating the parent section's array) must be fully atomic using MongoDB Transactions.
- **Performance**: High-traffic read endpoints (e.g., fetching published courses for the homepage) must be served from Redis in under 20ms.

## 4. Data Model Design

To bypass MongoDB's strict 16MB per-document limit, the system completely avoids the "Embedded Document" anti-pattern for large structures. Instead, it utilizes a normalized Reference Pattern.

- **Course Collection**: Stores global metadata (title, price, creatorId) and an array of Section ObjectIds.
- **Section Collection**: Stores module organization (title) and an array of Lecture ObjectIds.
- **Lecture Collection**: Stores granular content payload, video processing state (status: `AWAITING_MEDIA`, `PROCESSING`, `READY`), and final media URLs.

**Reasoning**: This schema allows a single course to scale infinitely to thousands of lectures without ever hitting database limits.

## 5. API Design

| Endpoint | Method | Description | Request Body / Params | Response | Status |
|----------|--------|-------------|----------------------|----------|--------|
| `/api/v1/course/create` | POST | Initialize a new course | `{ title, category, subtitle }` | Course object | 201 |
| `/api/v1/course/getpublished` | GET | Fetch all live courses | None | Array of populated Course | 200 |
| `/api/v1/course/:courseId/section` | POST | Add section to course | `{ sectionTitle }` | Section object | 201 |
| `/api/v1/course/:sectionId/lecture` | POST | Add lecture slot | `{ lectureTitle }` | Lecture object | 201 |
| `/api/v1/course/upload/initialize` | POST | Start chunk upload | `{ lectureId }` | `{ uploadId }` | 200 |
| `/api/v1/course/upload/chunk` | POST | Receive 5MB slice | `multipart/form-data` (file, uploadId, index) | `{ message }` | 200 |
| `/api/v1/course/upload/complete` | POST | Stitch & trigger worker | `{ uploadId, lectureId, totalChunks }` | `{ message }` | 200 |
| `/api/v1/course/remove/:courseId` | DELETE | Cascade delete course | courseId param | `{}` | 200 |

## 6. System Flow

### Chunked Upload Pipeline Flow:
```
[Client]                      [API Gateway]                   [File System]            [Database / Queue]
   |                                |                               |                          |
   |-- 1. POST /initialize -------->| Generate unique uploadId      |                          |
   |<-- Return uploadId ------------|                               |                          |
   |                                |                               |                          |
   |-- 2. POST /chunk (Chunk 0) --->| Intercept via Multer Disk ----> Write `uploadId/0`       |
   |-- 3. POST /chunk (Chunk 1) --->| Intercept via Multer Disk ----> Write `uploadId/1`       |
   |                                |                               |                          |
   |-- 4. POST /complete ---------->| Initialize WriteStream        |                          |
   |                                | Read all chunks in order -----> Stitch into `.mp4`       |
   |                                |                               |                          |
   |                                | Upload Stitched file to Cloud |                          |
   |                                | Delete local chunks/temp file |                          |
   |                                |                               |--> Update Lecture Status |
   |                                |                               |--> Add Job to BullMQ     |
   |<-- Return Success -------------|                               |                          |
```
## 7. Performance Optimization

- **Targeted Cache Invalidation**: Redis keys are structured granularly (`course:{courseId}`). When an instructor edits a course, only that specific key and the global homepage key (`all_courses`) are invalidated, rather than flushing the entire cache.
- **Disk Streaming**: The chunked upload writes binary data directly to disk (`fs.createWriteStream`), keeping memory overhead flat regardless of concurrency or video size.

## 8. Fault Tolerance

- **MongoDB Transactions**: Wrapping lecture/section creation in Mongoose `session.startTransaction()`. If the server crashes after creating a lecture but before updating the section array, the transaction rolls back. No "ghost" lectures are created.
- **Network Drops during Upload**: If a client loses connection on chunk 45 of 100, they only have to retry chunk 45. The previously successfully uploaded chunks remain securely on the disk buffer.

## 9. Security Considerations

- **Authorization**: All destructive operations (edit, delete, upload) enforce an ownership check: `course.creator.toString() === req.userId`.
- **Input Validation**: Multer middleware strictly filters MIME types to accept only `video/mp4`, `video/mkv`, preventing executable uploads.

## 10. Trade-offs

- **Disk I/O vs. Memory**: Writing chunks to the disk first (stitching) increases Disk I/O operations and requires temporary storage space, but heavily protects Node's single-threaded RAM.
- **Implementation Complexity**: Chunked uploading requires significantly more frontend and backend code compared to a simple synchronous upload endpoint.

## 11. Future Improvements

- **Direct-to-S3 Pre-signed URLs**: Bypassing the Node.js server entirely by generating AWS S3 Multipart Upload URLs, allowing the client to push bytes straight to AWS Edge nodes.