// config/queue.js
import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// Export only the queues so controllers can add jobs to them
export const emailQueue = new Queue("email-queue", { connection });
export const videoQueue = new Queue("video-queue", { connection });