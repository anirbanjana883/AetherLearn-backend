# 🎓 AetherLearn – Scalable E-Learning & Gamified Education Platform (Backend)

**AetherLearn** is a production-grade, scalable **Node.js backend** for a modern **Learning Management System (LMS)**.  
Built on **Express 5** and **Mongoose 8**, it is designed to handle **high-traffic media streaming**, **gamified user progression**, and **secure financial transactions**.

This backend emphasizes:

- **Asynchronous Workloads** – Heavy tasks (video processing, email notifications) are offloaded to **BullMQ** and **Redis**
- **Hardened Security** – Comprehensive protection using **Helmet**, **HPP**, **Express-Mongo-Sanitize**, and **Rate Limiting**
- **Media Optimization** – Cloudinary integration for scalable lecture video streaming and image hosting
- **Robust Observability** – Structured logging using **Winston** and request tracing via **Morgan**

---

## 🛠️ Tech Stack & Dependencies

### Core
- Node.js
- Express **v5.1.0**

### Database & ORM
- MongoDB
- Mongoose **v8**

### Caching & Queues
- ioredis
- Upstash Redis
- BullMQ

### Security
- Helmet
- HPP (HTTP Parameter Pollution)
- Express-Rate-Limit
- Express-Mongo-Sanitize

### Validation
- Zod
- Validator

### Authentication
- JWT (JSON Web Tokens)
- Bcryptjs
- Cookie-Parser

### Media & File Handling
- Multer
- Cloudinary

### Payments
- Razorpay

### Email Services
- Nodemailer
- Resend

### AI Integration
- Google GenAI (Gemini API)

### Logging
- Winston
- Morgan

---

## 🚀 Key Features

---

### 🔐 Authentication & Security

- Secure email/password registration using **Bcryptjs**
- JWT-based stateless authentication stored in **HTTP-only cookies**
- Strict request validation using **Zod schemas**
- Protection against:
  - NoSQL Injection
  - XSS attacks
  - HTTP Parameter Pollution
- Centralized error handling with structured logging

---

### 📚 Core LMS Engine

- **Course Management**
  - Create, update, and manage structured courses and modules
- **Lecture Delivery**
  - Multer + Cloudinary integration
  - Optimized for high-bandwidth video streaming
- **Progress Tracking**
  - Granular lecture-level and module-level progress tracking

---

### 🏆 Gamification & Achievements

- Automated milestone tracking:
  - First Course Completed
  - Streak Master
- Dynamic badge allocation based on user engagement
- Backend-driven evaluation via dedicated services

---

### 🤖 AI Assistance & Search

- Google Gemini API integration for:
  - AI-powered course recommendations
  - Instant query resolution
- Advanced filtering, sorting, and pagination for search

---

### 💳 Payments & Notifications

- **Razorpay Integration**
  - Secure order creation
  - Backend-verified webhook signatures
- Transaction history and order management
- Multi-provider email system:
  - OTP emails
  - Welcome emails
  - Payment invoices
  - Powered by Nodemailer and Resend

---

## 🏗️ High-Level Architecture
```

Client (Web / Mobile)
│
▼
Express 5 API Gateway
│
├── Security Middleware
│ ├── Helmet
│ ├── CORS
│ ├── Rate Limiting
│ ├── HPP
│ └── Mongo Sanitize
│
├── Middleware Layer
│ ├── isAuth (JWT Verification)
│ ├── validateMiddleware (Zod Validation)
│ └── errorMiddleware (Winston Logging)
│
├── Domain Controllers
│ ├── Auth & Users
│ ├── Courses & Lectures
│ ├── Gamification (Achievements)
│ └── Payments (Razorpay)
│
├── Data & Cache Layer
│ ├── MongoDB (Mongoose) – Primary Datastore
│ └── Redis (ioredis / Upstash) – Cache & Rate Limiting
│
└── Background Workers
└── BullMQ Queues → Cloudinary Processing / Async Emails


```


## 🗂️ Project Structure
```
AetherLearn-backend/
├── config/ # Redis, Cloudinary, DB, Queue, Logger configs
├── controller/ # Domain-specific controllers
├── middleware/ # Auth, Multer, Error handling, Zod validation
├── models/ # Mongoose schemas (User, Course, Achievement)
├── route/ # API route definitions
├── services/ # Business logic (Achievements, Payments)
├── utils/ # ApiError, ApiResponse, AsyncHandler
├── validators/ # Zod request schemas
├── index.js # Application entry point
├── seed.js # Database seeder
├── Dockerfile
└── docker-compose.yml


```

## 🔗 API Endpoints (High-Level)

---

### 🔐 Auth (`/api/v1/auth`)

| Method | Endpoint | Description |
|------|--------|-------------|
| POST | `/register` | Register new user |
| POST | `/login` | Authenticate user & issue JWT |
| POST | `/refresh` | Refresh access token |
| POST | `/forgot-password` | Send reset email |

---

### 📚 Courses (`/api/v1/courses`)

| Method | Endpoint | Description |
|------|--------|-------------|
| GET | `/` | Get all courses (filters supported) |
| GET | `/:id` | Get course details + lectures |
| POST | `/` | Create course (Instructor/Admin) |
| POST | `/:id/lectures` | Upload lecture video |

---

### 📈 Progress & Gamification  
(`/api/v1/progress`, `/api/v1/achievements`)

| Method | Endpoint | Description |
|------|--------|-------------|
| PUT | `/progress/:lectureId` | Mark lecture as completed |
| GET | `/achievements` | Get unlocked badges |

---

## ⚙️ Setup Instructions (Local)

### 1️⃣ Prerequisites
- Node.js ≥ 18
- Docker & Docker Compose
- MongoDB (Atlas or local)
- Redis / Upstash Redis

---

### 2️⃣ Environment Variables

Create a `.env` file in the root directory:

```env
# ==========================================
# ⚙️ Server Configuration
# ==========================================
PORT=5000
NODE_ENV=development

# ==========================================
# 🗄️ Database Configuration
# ==========================================
MONGODB_URL=your_mongodb_connection_string

# ==========================================
# 🔐 Authentication (JWT)
# ==========================================
JWT_SECRET=your_super_secret_jwt_key

# ==========================================
# 📧 Email Services
# ==========================================
USER_EMAIL=your_support_email@gmail.com
USER_PASSWORD=your_email_app_password
RESEND_API_KEY=your_resend_api_key

# ==========================================
# ☁️ Cloudinary
# ==========================================
CLOUDINARY_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# ==========================================
# 💳 Razorpay
# ==========================================
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# ==========================================
# 🤖 AI (Google Gemini)
# ==========================================
GEMINI_API_KEY=your_google_gemini_api_key

# ==========================================
# ⚡ Redis (Upstash / BullMQ)
# ==========================================
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

```

**3️⃣ Install Dependencies**
```
npm install
```

**4️⃣ Run Development Server**
```
npm run dev
```
**5️⃣ Run with Docker (Recommended)**
```
docker-compose up --build
```
**6️⃣ Seed Database (Initial Setup)**
```
npm run seed
```
# 🧠 What This Backend Demonstrates
- ✅ Complex Mongoose relationships (Users ↔ Courses ↔ Achievements)
- ✅ Third-party SaaS integrations (Cloudinary, Razorpay, Google AI)
- ✅ Clean code architecture (Controller–Service–Middleware pattern)
- ✅ Hardened production-grade security
- ✅ Scalable background processing with BullMQ
- ✅ Production-ready Docker containerization