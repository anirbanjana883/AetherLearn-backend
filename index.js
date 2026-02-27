import dotenv from "dotenv";
dotenv.config();

import express from 'express';
import connectDb from './config/connectDB.js';
import cookieParser from 'cookie-parser';
import authRouter from './route/authRoute.js';
import cors from "cors";
import userRouter from './route/userRoute.js';
import courseRouter from './route/courseRoute.js';
import paymentRouter from './route/paymentRoute.js';
import reviewRouter from './route/reviewRoute.js';
import progressRouter from './route/progressRoute.js';
import statsRouter from './route/statsRoute.js';
import achievementRouter from './route/achievementRoute.js';
import { errorHandler } from './middleware/errorMiddleware.js';
import "./config/redis.js"; 

import helmet from "helmet";
// import mongoSanitize from "express-mongo-sanitize";
// import hpp from "hpp";
import rateLimit from "express-rate-limit";
import morgan from 'morgan';
import logger from "./config/logger.js";
import analyticsRouter from './route/analyticsRoute.js';

// BULL BOARD & AUTH IMPORTS
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import basicAuth from 'express-basic-auth';


import { videoQueue } from './config/queue.js'; 
import { emailQueue } from './config/queue.js'; 


const port = process.env.PORT || 5000;
const app = express();

app.use(
    '/api/order/webhook', 
    express.raw({ type: 'application/json' })
);

// CORS 
app.use(cors({
    origin: 'http://localhost:5173', 
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], 
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// HELMET
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
            imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
            mediaSrc: ["'self'", "https://res.cloudinary.com"], 
        },
    },
}));

const morganFormat = ":method :url :status :response-time ms";

app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => {
        const logObject = {
          method: message.split(" ")[0],
          url: message.split(" ")[1],
          status: message.split(" ")[2],
          responseTime: message.split(" ")[3],
        };
        logger.info(JSON.stringify(logObject));
      },
    },
  })
);

// RATE LIMITER
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, 
    max: 100, 
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again later."
});
app.use("/api", limiter);

// PAYLOAD LIMIT 
app.use(express.json({ limit: "2mb" })); 
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

// app.use(mongoSanitize()); 
// app.use(hpp());

app.use("/public", express.static("public"));

//  BULL BOARD ADMIN SETUP
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// NOTE: Uncomment this and pass your actual imported queues
createBullBoard({
  queues: [
    new BullMQAdapter(videoQueue),
    new BullMQAdapter(emailQueue)
  ],
  serverAdapter: serverAdapter,
});

// Secure the route with Basic Auth (Native browser popup)
app.use('/admin/queues', basicAuth({
    users: { 
        // Username is 'admin', password comes from .env or defaults to 'aether2026'
        'admin': process.env.ADMIN_DASHBOARD_PASS_BULL_MQ
    },
    challenge: true, // This triggers the browser's native login modal
    realm: 'AetherLearn Admin Dashboard'
}), serverAdapter.getRouter());
// ==========================================


app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/course", courseRouter);
app.use("/api/order", paymentRouter);
app.use("/api/review", reviewRouter);
app.use("/api/progress", progressRouter);
app.use("/api/stats", statsRouter);
app.use("/api/achievements", achievementRouter);
app.use("/api/analytics", analyticsRouter);

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'Active', 
        timestamp: new Date() 
    });
});

app.get('/', (req, res) => {
    res.send('Hello from AETHERLEARN ');
});

app.use(errorHandler);

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port : ${port}`);
    connectDb();
});