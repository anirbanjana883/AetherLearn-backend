import express from 'express';
import dotenv from 'dotenv';
import connectDb from './config/connectDB.js';
import cookieParser from 'cookie-parser';
import authRouter from './route/authRoute.js';
import cors from "cors"
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
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import rateLimit from "express-rate-limit";


dotenv.config();

const port  = process.env.PORT || 5000
const app = express()



// 1. CORS (Must be first)
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5174"], 
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(helmet({
    crossOriginResourcePolicy: false, 
}));

// RATE LIMITER
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, 
    max: 100, 
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again later."
});
app.use("/api", limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// app.use(mongoSanitize()); 
// app.use(hpp());


app.use("/api/auth",authRouter)
app.use("/api/user",userRouter)
app.use("/api/course",courseRouter)
app.use("/api/order",paymentRouter)
app.use("/api/review",reviewRouter)
app.use("/api/progress", progressRouter);
app.use("/api/stats", statsRouter);
app.use("/api/achievements", achievementRouter);

app.get('/', (req, res) => {
    res.send('Hello from AETHERLEARN ')
})

app.use(errorHandler);

app.listen(port,() =>{
    console.log(`Server is running on port : ${port}`)
    connectDb()
})