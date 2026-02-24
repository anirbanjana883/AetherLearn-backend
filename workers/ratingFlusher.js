import cron from "node-cron";
import redisClient from "../config/redis.js";
import Course from "../models/courseModel.js";
import logger from "../config/logger.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Staggered: Runs at 2, 7, 12, 17... (2 minutes after the Analytics flush)
cron.schedule("2-59/5 * * * *", async () => {
  const lock = await redisClient.set("rating_flush_lock", "locked", {
    nx: true,
    ex: 240,
  });

  if (!lock) return;

  try {
    const dirtyCourses = await redisClient.smembers("dirty_rating_courses");
    if (!dirtyCourses || dirtyCourses.length === 0) return;

    logger.info(`Cron: Flushing ratings for ${dirtyCourses.length} courses...`);

    const bulkOps = [];

    for (let i = 0; i < dirtyCourses.length; i++) {
      const courseId = dirtyCourses[i];

      //  Optimization:  event loop breathe every 10 courses
      if (i > 0 && i % 10 === 0) {
        await sleep(50); 
      }

      const redisKey = `courseRating:${courseId}`;
      const ratingData = await redisClient.hgetall(redisKey);

      if (!ratingData) continue;

      const totalStars = parseInt(ratingData.totalStars || 0, 10);
      const reviewCount = parseInt(ratingData.reviewCount || 0, 10);

      const avgRating =
        reviewCount > 0 ? Number((totalStars / reviewCount).toFixed(1)) : 0;

      bulkOps.push({
        updateOne: {
          filter: { _id: courseId },
          update: { avgRating, reviewCount },
        },
      });
    }

    if (bulkOps.length > 0) {
      await Course.bulkWrite(bulkOps);
      // Only delete the "dirty" list if the write was successful
      await redisClient.del("dirty_rating_courses");
      logger.info(`Cron: Rating flush complete. Updated ${bulkOps.length} courses.`);
    }

  } catch (error) {
    logger.error(`Cron: Rating Flush Failed: ${error.message}`);
  } finally {
    await redisClient.del("rating_flush_lock");
  }
});