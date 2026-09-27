/* ========================================
   Astrova — Rate Limiting Middleware
   ========================================
   In-memory sliding window rate limiter.
   
   For single-server deployments. Documented
   limitation: not distributed/redis-backed.
   ======================================== */

import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  /** Maximum requests within the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Optional key function to separate limits (e.g., by IP + path) */
  keyFn?: (req: Request) => string;
  /** Message returned when rate limited */
  message?: string;
}

// In-memory store — resets on server restart (acceptable for single-server)
const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetTime <= now) {
      store.delete(key);
    }
  }
}, 60_000); // Cleanup every 60 seconds

/**
 * Create a rate limiter middleware.
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    maxRequests,
    windowMs,
    keyFn = (req) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      return `${ip}:${req.method}:${req.baseUrl}${req.path}`;
    },
    message = "Too many requests. Please try again later.",
  } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetTime <= now) {
      // New window
      store.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetTime / 1000)));
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message,
        },
      });
      return;
    }

    entry.count++;
    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(maxRequests - entry.count));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetTime / 1000)));
    next();
  };
}

/**
 * Pre-configured rate limiters for common Astrova endpoints.
 */

/** Auth endpoints: 10 requests per 15 minutes per IP */
export const authRateLimit = rateLimit({
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `auth:${ip}`;
  },
  message: "Too many authentication attempts. Please try again in 15 minutes.",
});

/** Login: 5 attempts per 15 minutes per IP */
export const loginRateLimit = rateLimit({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `login:${ip}`;
  },
  message: "Too many login attempts. Please try again in 15 minutes.",
});

/** Admin login: 5 attempts per 15 minutes per IP (separate bucket from site login) */
export const adminLoginRateLimit = rateLimit({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `admin-login:${ip}`;
  },
  message: "Too many admin login attempts. Please try again in 15 minutes.",
});

/** Register: 3 accounts per hour per IP */
export const registerRateLimit = rateLimit({
  maxRequests: 3,
  windowMs: 60 * 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `register:${ip}`;
  },
  message: "Too many registration attempts. Please try again in 1 hour.",
});

/** AI chat: 30 requests per minute per IP */
export const chatRateLimit = rateLimit({
  maxRequests: 30,
  windowMs: 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `chat:${ip}`;
  },
  message: "Too many chat requests. Please slow down.",
});

/** Favorites mutation: 30 requests per minute per IP */
export const favoritesRateLimit = rateLimit({
  maxRequests: 30,
  windowMs: 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `fav:${ip}`;
  },
  message: "Too many requests. Please slow down.",
});

/** Visitor intelligence: 30 requests per 10 minutes per IP */
export const visitorIntelligenceRateLimit = rateLimit({
  maxRequests: 30,
  windowMs: 10 * 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `visitor-intelligence:${ip}`;
  },
  message: "Too many live visitor condition requests. Please try again later.",
});

/** Nearby places (proxies Overpass): 20 requests per 10 minutes per IP */
export const nearbyRateLimit = rateLimit({
  maxRequests: 20,
  windowMs: 10 * 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `nearby:${ip}`;
  },
  message: "Too many nearby-place requests. Please try again later.",
});

/** Heritage enrichment references (proxies Wikidata): 20 requests per 10 minutes per IP */
export const enrichmentRateLimit = rateLimit({
  maxRequests: 20,
  windowMs: 10 * 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `enrichment:${ip}`;
  },
  message: "Too many external-reference requests. Please try again later.",
});

/** Visit cost estimator (local calculation): 60 requests per 10 minutes per IP */
export const visitCostRateLimit = rateLimit({
  maxRequests: 60,
  windowMs: 10 * 60 * 1000,
  keyFn: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `visit-cost:${ip}`;
  },
  message: "Too many cost-estimator requests. Please try again later.",
});
