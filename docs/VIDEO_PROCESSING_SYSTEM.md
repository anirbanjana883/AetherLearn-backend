# 🧱 SYSTEM 2: VIDEO PROCESSING SYSTEM

## 1. System Overview

The Video Processing System is a critical, decoupled background worker module. Raw video files uploaded by instructors are massive, unoptimized, and buffer heavily for students. This system asynchronously downloads the raw video, uses native FFMPEG to compress and standardize it, uploads the optimized version to the CDN, and notifies the client. It guarantees that the main API server remains highly responsive to user requests by offloading CPU-heavy tasks.

## 2. Functional Requirements

- **Asynchronous Execution**: Process videos in the background without holding the HTTP connection open.
- **Video Transcoding**: Convert raw video files to a standardized format (720p, H.264, AAC).
- **Progress Emitting**: Track FFmpeg processing time and emit real-time percentage progress updates to the frontend.
- **Automated Cleanup**: Guarantee the removal of temporary files from the server's disk, regardless of success or failure.

## 3. Non-Functional Requirements

- **Compute Isolation**: Video processing takes 100% of available CPU cores. This must run on a completely separate Node.js worker instance via BullMQ.
- **Network Efficiency**: Minimize egress/ingress bandwidth costs when pulling raw files from cloud storage to the worker node.
- **Job Resiliency**: If a server restarts mid-compression, the queue must recognize the failure and retry the job automatically.

## 4. Data Model Design

This module does not have its own collection; instead, it transitions the state of the Lecture document (System 1).

- **Schema Updates**: status enum tracking state machine transitions: `["AWAITING_MEDIA", "PROCESSING", "READY", "FAILED"]`.
- **rawVideoUrl**: Fallback URL for the uncompressed file.
- **videoUrl**: The final, heavily compressed streaming URL.

## 5. API Design

Note: This system primarily operates via Redis Queue Events rather than HTTP APIs.

| Queue / Event | Direction | Payload | Description |
|---------------|-----------|---------|-------------|
| `video-queue` | Inbound | `{ lectureId, rawVideoUrl, instructorId }` | BullMQ picks up this job to begin processing. |
| `updateProgress` | Internal | `integer (0-100)` | Sent back to Redis to update the job's completion state. |
| `notifications` | Outbound | `{ userId, type, message }` | Pub/Sub event sent to the Socket.IO server when done. |

## 6. System Flow

### Worker Execution Flow:
```
[Redis BullMQ]               [Video Worker Node]                          [Cloudinary / CDN]
      |                              |                                            |
      |-- 1. Job Picked Up --------->|                                            |
      |                              |                                            |
      |                              |-- 2. GET URL (with downscale params) ----->|
      |                              |<-- 3. Stream Optimized Raw Video ----------|
      |                              |       (Saved to worker disk)               |
      |                              |                                            |
      |<-- 4. Emit Progress (5%) ----|-- 5. Spawn native `child_process`          |
      |<-- Emit Progress (50%) ------|      `ffmpeg -i input.mp4 -s 1280x720`     |
      |<-- Emit Progress (99%) ------|                                            |
      |                              |                                            |
      |                              |-- 6. Upload Final compressed video ------->|
      |                              |<-- Return secure CDN URL ------------------|
      |                              |                                            |
      |-- 7. Publish completion ---->| Update MongoDB Status to READY             |
      |      to Notification Queue   | Delete temp files via `fs.remove`          |
```
## 7. Performance Optimization

- **The Bandwidth Saver Trick**: When downloading the raw file from Cloudinary to the worker, the URL is dynamically rewritten (`/upload/q_auto,w_854,h_480/`) to force Cloudinary to do an initial aggressive downscale. This reduces the ingress payload from ~1GB to ~50MB, saving massive server bandwidth costs and reducing local FFMPEG processing time.
- **Native child_process**: Abandoned legacy wrappers (`fluent-ffmpeg`) in favor of direct OS-level execution via `spawn('ffmpeg')`. This eliminates Node.js overhead and memory leaks during long-running transcodes.

## 8. Fault Tolerance

- **Ephemeral Disk Protection**: Serverless environments (like Render/Heroku) frequently wipe the local disk. By uploading the RAW file to Cloudinary first in System 1, the worker always has a permanent URL to pull from, surviving any unexpected server restarts.
- **Guaranteed Finally Block Cleanup**: Temporary directories are removed inside a strictly enforced `finally {}` block. If FFmpeg crashes, the disk does not slowly fill up with broken video fragments.
- **BullMQ Retries**: Built-in delayed retries ensure that if the CDN drops the connection during the download phase, the job is put back in the queue automatically.

## 9. Security Considerations

FFMPEG commands are strictly hardcoded. Variables passed into the FFMPEG args array are validated paths generated by the system itself (e.g., `tempDir/raw.mp4`), completely eliminating the risk of Command Injection attacks from malicious filenames.

## 10. Trade-offs

- **Single MP4 vs. HLS**: Currently, the system outputs an optimized 720p .mp4 file. While an HLS .m3u8 playlist is standard for adaptive streaming, the single MP4 significantly reduces Cloudinary transformation costs and architectural complexity during the startup phase.
- **Cloudinary vs. Raw S3 Processing**: Pushing to Cloudinary first incurs higher storage costs but provides instant fail-safe URLs and on-the-fly transformations that save our worker's network bandwidth.

## 11. Future Improvements

- **Adaptive Bitrate Streaming (HLS)**: Migrating to AWS MediaConvert or using the worker to slice videos into 10-second .ts segments to allow players to switch between 1080p, 720p, and 480p automatically based on user internet speed.
- **GPU Transcoding**: Moving the worker to an EC2 instance with an Nvidia GPU and using the `-c:v h264_nvenc` codec for 5x faster processing.