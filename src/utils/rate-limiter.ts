/**
 * Rate Limiter for Gemini API calls
 * Prevents exceeding API rate limits
 */

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class RateLimiter {
  private requests: number[] = [];
  private config: Required<RateLimiterConfig>;
  private lastCleanup: number = 0;
  private readonly cleanupInterval: number = 10000; // Cleanup every 10 seconds

  constructor(config: RateLimiterConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
    };
  }

  /**
   * Check if request can proceed or needs to wait
   */
  async checkLimit(): Promise<void> {
    const now = Date.now();
    
    // Optimize cleanup - only clean if enough time has passed
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanupOldRequests(now);
      this.lastCleanup = now;
    } else {
      // Quick cleanup of obviously old requests
      while (this.requests.length > 0 && now - this.requests[0] >= this.config.windowMs) {
        this.requests.shift();
      }
    }

    // Check if we're at the limit
    if (this.requests.length >= this.config.maxRequests) {
      // Calculate wait time until oldest request expires
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.config.windowMs - now;
      
      if (waitTime > 0) {
        await this.delay(waitTime);
        // Recurse to recheck after waiting
        return this.checkLimit();
      }
    }

    // Add current request
    this.requests.push(now);
  }

  /**
   * Clean up old requests efficiently
   */
  private cleanupOldRequests(now: number): void {
    const cutoff = now - this.config.windowMs;
    let removeCount = 0;
    
    // Count how many to remove from the start
    for (let i = 0; i < this.requests.length; i++) {
      if (this.requests[i] < cutoff) {
        removeCount++;
      } else {
        break;
      }
    }
    
    // Remove in one operation
    if (removeCount > 0) {
      this.requests.splice(0, removeCount);
    }
  }

  /**
   * Execute a function with rate limiting and retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    retryCount: number = 0
  ): Promise<T> {
    await this.checkLimit();

    try {
      return await fn();
    } catch (error) {
      // Check if it's a rate limit error
      if (this.isRateLimitError(error) && retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelayMs * Math.pow(2, retryCount); // Exponential backoff
        await this.delay(delay);
        return this.execute(fn, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Check if error is rate limit related
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('quota exceeded') ||
        message.includes('429') ||
        message.includes('too many requests')
      );
    }
    return false;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current usage stats
   */
  getStats(): { currentRequests: number; maxRequests: number; windowMs: number } {
    const now = Date.now();
    const activeRequests = this.requests.filter(
      timestamp => now - timestamp < this.config.windowMs
    );

    return {
      currentRequests: activeRequests.length,
      maxRequests: this.config.maxRequests,
      windowMs: this.config.windowMs,
    };
  }
}

// Default rate limits for Gemini (based on personal account limits)
export const GEMINI_RATE_LIMITS = {
  personal: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 1 minute
  },
  daily: {
    maxRequests: 1000,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
  },
};