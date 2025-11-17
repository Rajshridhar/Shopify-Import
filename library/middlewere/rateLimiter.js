import rateLimit from 'express-rate-limit';

const aMinute = 60 * 1000;
const windowMsVal = 1 * aMinute; //15 * 60 * 1000, // 15 minutes
const maxRequestPerMinute = 20;

const apiRateLimiter = rateLimit({
    windowMs: windowMsVal,
    max: maxRequestPerMinute,
    keyGenerator: (req) => {
        // Use authentication key for rate limiting
        return req.headers['authorization'] || req.ip;
    },
    handler: (req, res) => {
        res.status(429).json({
            error: `Too many requests, please try again later [Limit: ${maxRequestPerMinute} requests per minute].`,
        });
    },
});

export default apiRateLimiter;
