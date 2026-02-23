# 📘 AetherLearn Setup & Deployment Guide

Welcome to the AetherLearn backend setup guide. This document outlines the prerequisites, environment configurations, and execution steps required to run the enterprise-grade LMS backend locally or in production.

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed on your machine:

- Node.js (v18 or higher)
- npm (v9 or higher)
- Docker & Docker Compose (Highly Recommended for local testing)
- FFmpeg (Required only if running natively without Docker, for video processing)

## ⚙️ Step 1: Environment Configuration

Create a `.env` file in the root directory of the backend project. The system requires several third-party API keys to function correctly (Database, AI, Payments, Email, and Media).

Copy the following template into your `.env` file and populate the values:

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| PORT | The port the server runs on (Default: 8000 or 5000). | N/A |
| NODE_ENV | Set to `development` or `production`. | N/A |
| MONGODB_URL | Your MongoDB connection string. | MongoDB Atlas |
| JWT_SECRET | A secure, random 64-character string for signing tokens. | Generate via `openssl rand -hex 32` |
| USER_EMAIL | Admin/System email address (for SMTP fallback or admin seeding). | N/A |
| USER_PASSWORD | App password for the system email. | N/A |
| CLOUDINARY_NAME | Cloudinary cloud name for media storage. | Cloudinary |
| CLOUDINARY_API_KEY | Cloudinary API Key. | Cloudinary Dashboard |
| CLOUDINARY_API_SECRET | Cloudinary API Secret. | Cloudinary Dashboard |
| RAZORPAY_KEY_ID | Public Key for Razorpay checkout integration. | Razorpay |
| RAZORPAY_KEY_SECRET | Private Key to verify frontend signatures. | Razorpay Dashboard |
| RAZORPAY_WEBHOOK_SECRET | Secure secret configured in Razorpay Webhook settings. | Razorpay Webhook Settings |
| GEMINI_API_KEY | API Key for Google Gemini 2.0 (AI Search & Fallback). | Google AI Studio |
| RESEND_API_KEY | API Key for transactional email delivery via Resend. | Resend |
| UPSTASH_REDIS_URL | Primary Redis connection string for BullMQ workers. | Upstash |
| UPSTASH_REDIS_REST_URL | HTTP REST URL for Redis (Optional/Caching). | Upstash Dashboard |
| UPSTASH_REDIS_REST_TOKEN | HTTP REST Token for Redis (Optional/Caching). | Upstash Dashboard |

## 🐳 Step 2: Running with Docker (Recommended)

Running the application via Docker is the recommended approach as it automatically provisions the Node.js environment, installs the required FFmpeg binaries for the video worker, and links your local MongoDB/Redis containers (if configured).

**1.Build and start the containers:**
```bash
docker-compose up --build
```
**2.Stop the containers gracefully:**
```bash
docker-compose down
```
Note: When running via Docker, ensure your `MONGODB_URL` and `UPSTASH_REDIS_URL` point to your cloud instances, OR update them to point to the local docker-compose service names (e.g., `redis://aether_redis:6379`).

## 💻 Step 3: Running Locally (Native/Without Docker)
If you prefer to run the Node.js server directly on your machine, you must ensure FFmpeg is installed on your OS (Windows/Mac/Linux) and added to your system's PATH, or the video compression workers will crash.

**1.Install all dependencies:**
```bash
npm install
```
**2. Start the development server:**
```bash
npm run dev
```
**3. Start the production server:**
```bash
npm start
```
## ✅ Step 4: Verifying the Setup
Once the server is running, verify that the core architecture is operational by hitting the health check endpoint.

**Request:**
```
GET http://localhost:8000/health
```
**Expected Response:**
```json
{
  "status": "Active",
  "timestamp": "2026-02-23T10:00:00.000Z"
}
```
Check your terminal logs. You should see successful connection messages for:

- 1.🚀 Server running on port

- 2.✅ MongoDB Connected Successfully

- 3.🎬Video/Email BullMQ Workers initialized successfully

## 🚨 Troubleshooting Common Issues
- `spawn ffmpeg ENOENT`: This means FFmpeg is missing from your system. Use Docker, or install FFmpeg locally and add it to your environment variables.

- Razorpay Webhook Fails (`Invalid Signature`): Ensure your `RAZORPAY_WEBHOOK_SECRET` exactly matches the secret you pasted into the Razorpay dashboard, and verify `express.raw()` is correctly mounting before your JSON body parser.

- Redis Connection Refused: Ensure your Upstash URL is correct and includes the `rediss://` protocol if TLS is required.