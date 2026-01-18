import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL, 
  token: process.env.UPSTASH_REDIS_REST_TOKEN, 
});

console.log("✅ Upstash Redis (HTTP) Initialized");

export default redisClient;