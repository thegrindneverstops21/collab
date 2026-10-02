import { rateLimit } from "express-rate-limit";

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 50, // Limit each IP to 50 requests per windowMs
    standardHeaders: true, 
    legacyHeaders: false, 
    message: "Too many requests from this IP, please try again after 15 minutes",
});
   