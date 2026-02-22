import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const connection = new IORedis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: {}   
});

// Export queues
export const emailQueue = new Queue("email-queue", {
  connection
});

export const videoQueue = new Queue("video-queue", {
  connection
});