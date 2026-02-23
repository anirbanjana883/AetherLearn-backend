# 🚀 AetherLearn Backend System

This project implements a high-performance, enterprise-grade backend system designed for a massively scalable Learning Management System (LMS) akin to Udemy or Coursera.

The system is capable of:
- Handling heavy concurrent video processing via asynchronous worker queues.
- Guaranteeing zero financial discrepancies through ACID-compliant, Zero-Trust payment webhooks.
- Providing sub-50ms search results with a hybrid AI-semantic fallback engine.
- Securing user data against DDoS, brute-force, and payload injection attacks.

It achieves this through decoupled micro-architecture, Redis caching, native database text indexing, and asynchronous background job processing.

## 📌 Functional Requirements Implemented

- Secure JWT Authentication with OTP password recovery.
- Automated Video Compression & Processing pipeline (FFmpeg to Cloudinary).
- Zero-Trust Checkout & Enrollment via Razorpay webhooks.
- Gamified Student Progress Tracking (Daily Streaks, XP, Heatmaps).
- AI-Powered Hybrid Search Engine with Semantic Intent Classification.
- Bulletproof Security Firewall (Strict Rate Limiting, Zod Validation, Helmet CSP).

## 🧰 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB |
| ODM | Mongoose |
| Queue System | BullMQ |
| Caching | Redis (Upstash) |
| Payment Gateway | Razorpay |
| AI Integration | Google Gemini 2.0 Flash |
| Media Processing | Native FFmpeg + Cloudinary |
| Security | Zod, Helmet, Express-Rate-Limit |

## 🏗️ System Overview

AetherLearn utilizes a highly optimized, asynchronous architecture to ensure the main Node.js event loop remains unblocked during heavy operations.

- Heavy compute tasks (like 4K video compression and sending emails) are offloaded to BullMQ background workers.
- Financial transactions completely bypass the untrusted frontend, relying entirely on secure server-to-server webhook events wrapped in ACID database transactions.
- Course Discovery relies on a Lazy-Evaluation pipeline, instantly returning MongoDB $text index results, and only waking up the Gemini LLM for semantic fallback on vague queries (with Redis caching to eliminate redundant AI costs).

## 📚 Detailed Documentation

All comprehensive system design deliverables, architectural decisions, and API specifications are organized inside the docs/ folder for easy navigation.

| Section | Description | Link |
|---------|-------------|------|
| 📌 Security & Auth Firewall | JWT flow, OTP logic, Zod validation, and API rate limiters. | [View](./docs/SECURITY%20&%20AUTHENTICATION%20FIREWALL.md) |
| 📌 Course Management | Core CRUD operations and course publishing architecture. | [View](./docs/COURSE_MANAGEMENT_SYSTEM.md) |
| 📌 Video Processing System | Async FFmpeg compression, BullMQ, and Cloudinary uploads. | [View](./docs/VIDEO_PROCESSING_SYSTEM.md) |
| 📌 User Learning & Progress | Streaks, Activity Heatmaps, and lecture completion tracking. | [View](./docs/USER_LEARNING_SYSTEM_(PROGRESS_TRACKING).md) |
| 📌 Review & Rating System | User feedback loops and automated rating aggregation flushers. | [View](./docs/REVIEW%20&%20RATING%20SYSTEM.md) |
| 📌 Order & Payment System | Zero-Trust Razorpay Webhooks & ACID database transactions. | [View](./docs/ORDER%20&%20PAYMENT%20SYSTEM.md) |
| 📌 Course Analytics | Product intelligence layer, sales, and enrollment tracking. | [View](./docs/COURSE%20ANALYTICS%20SYSTEM%20(Product%20Intelligence%20Layer).md) |
| 📌 AI-Powered Search Engine | Hybrid semantic search, Lazy LLM evaluation, and Redis caching. | [View](./docs/AI-POWERED%20SEARCH%20ENGINE.md) |
| 📌 Setup & Deployment Guide | Docker configuration, environment variables, and local testing. | [View](./docs/AetherLearn%20Setup%20&%20Deployment%20Guide.md) |

## 📌 Final Note

This AetherLearn Backend System has been designed with a focus on:

- Data Integrity & ACID Compliance
- Asynchronous Processing & Offloading
- Cost-Optimized AI Integrations
- Enterprise-Grade Security
- Scalability under high payload load

All architectural decisions, caching layers, and algorithmic trade-offs were made to ensure maximum performance, financial correctness, and long-term maintainability.

— Anirban Jana