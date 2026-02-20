// workers/emailWorker.js
import { Worker } from "bullmq";
import IORedis from "ioredis";
import sendMail from "../config/sendMail.js";
import logger from "../config/logger.js";
import dotenv from "dotenv";

dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const emailWorker = new Worker(
  "email-queue",
  async (job) => {
    logger.info(`[Worker] Processing Job ${job.id}: ${job.name}`);
    
    const { subject, email, otp, name } = job.data;
    let html = "";

    if (job.name === "send-otp-email") {
      html = `
        <div style="font-family: Arial; padding: 20px; text-align: center; color: #333;">
          <h2>Hello Learner,</h2>
          <p>Your OTP is valid for 5 minutes.</p>
          <div style="background: #000; color: #fff; padding: 15px; font-size: 24px; display: inline-block; border-radius: 8px;">
            ${otp}
          </div>
        </div>`;
    } else if (job.name === "send-welcome-email") {
      html = `
        <div style="font-family: Arial; padding: 20px; text-align: center; color: #333;">
          <h2>Welcome to AetherLearn, ${name}!</h2>
          <p>We are thrilled to have you on board. Start your first course today!</p>
        </div>`;
    }

    if (html) {
      await sendMail(email, subject, html);
      logger.info(`[Worker] Job ${job.id} Completed!`);
    }
  },
  { connection }
);

emailWorker.on("completed", (job) => {
  logger.info(`[EmailWorker] Job ${job.id} successfully processed.`);
});

emailWorker.on("failed", (job, err) => {
  logger.error(`[EmailWorker] Failed: ${job.id} - ${err.message}`);
});

export default emailWorker;