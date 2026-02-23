import cron from "node-cron";
import redisClient from "../config/redis.js";
import Course from "../models/courseModel.js";
import logger from "../config/logger.js"; // Assuming you have a logger

cron.schedule("*/5 * * * *", async () => {
  const lock = await redisClient.set("rating_flush_lock", "locked", {
    nx: true,
    ex: 240,
  });

  if (!lock) return;

  try {
    const dirtyCourses = await redisClient.smembers("dirty_rating_courses");

    if (dirtyCourses.length === 0) return;

    logger.info(`Cron: Flushing ratings for ${dirtyCourses.length} courses...`);

    for (const courseId of dirtyCourses) {
      const redisKey = `courseRating:${courseId}`;
      const ratingData = await redisClient.hgetall(redisKey);

      const totalStars = parseInt(ratingData.totalStars || 0, 10);
      const reviewCount = parseInt(ratingData.reviewCount || 0, 10);

      const avgRating =
        reviewCount > 0 ? Number((totalStars / reviewCount).toFixed(1)) : 0;

      await Course.findByIdAndUpdate(courseId, {
        avgRating,
        reviewCount,
      });
    }

    // deleting the already processed data
    await redisClient.del("dirty_rating_courses");
    logger.info(`Cron: Rating flush complete.`);
  } catch (error) {
    logger.error(`Cron: Rating Flush Failed: ${error.message}`);
  } 
});
