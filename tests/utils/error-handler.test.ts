/**
 * Tests for ErrorHandler utility
 */

import { ErrorHandler } from '../../src/utils/error-handler';

describe('ErrorHandler', () => {
  describe('formatError', () => {
    it('should format Error objects correctly', () => {
      const error = new Error('Test error');
      const result = ErrorHandler.formatError(error);
      expect(result).toBe('Test error');
    });

    it('should format Error objects with context', () => {
      const error = new Error('Test error');
      const result = ErrorHandler.formatError(error, 'TestContext');
      expect(result).toBe('[TestContext] Test error');
    });

    it('should format string errors', () => {
      const result = ErrorHandler.formatError('String error');
      expect(result).toBe('String error');
    });

    it('should format unknown errors', () => {
      const result = ErrorHandler.formatError({ custom: 'object' });
      expect(result).toBe('Unknown error: {"custom":"object"}');
    });
  });

  describe('wrapError', () => {
    it('should wrap Error with preserved stack trace', () => {
      const originalError = new Error('Original error');
      const wrappedError = ErrorHandler.wrapError(originalError, 'Wrapped message');
      
      expect(wrappedError.message).toBe('Wrapped message');
      expect(wrappedError.cause).toBe(originalError);
      expect(wrappedError.stack).toContain('Wrapped message');
      expect(wrappedError.stack).toContain('Caused by:');
    });

    it('should wrap non-Error objects', () => {
      const wrappedError = ErrorHandler.wrapError('string error', 'Wrapped message');
      
      expect(wrappedError.message).toBe('Wrapped message');
      expect(wrappedError.stack).toBeDefined();
    });
  });

  describe('error type detection', () => {
    it('should detect rate limit errors', () => {
      expect(ErrorHandler.isRateLimitError(new Error('Rate limit exceeded'))).toBe(true);
      expect(ErrorHandler.isRateLimitError(new Error('Quota exceeded'))).toBe(true);
      expect(ErrorHandler.isRateLimitError(new Error('429 Too Many Requests'))).toBe(true);
      expect(ErrorHandler.isRateLimitError(new Error('Normal error'))).toBe(false);
    });

    it('should detect network errors', () => {
      expect(ErrorHandler.isNetworkError(new Error('Network timeout'))).toBe(true);
      expect(ErrorHandler.isNetworkError(new Error('Connection refused'))).toBe(true);
      expect(ErrorHandler.isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(ErrorHandler.isNetworkError(new Error('Normal error'))).toBe(false);
    });

    it('should detect auth errors', () => {
      expect(ErrorHandler.isAuthError(new Error('Unauthorized'))).toBe(true);
      expect(ErrorHandler.isAuthError(new Error('401 Unauthorized'))).toBe(true);
      expect(ErrorHandler.isAuthError(new Error('Invalid API key'))).toBe(true);
      expect(ErrorHandler.isAuthError(new Error('Normal error'))).toBe(false);
    });
  });

  describe('sanitizeError', () => {
    it('should redact potential API keys', () => {
      const error = new Error('API key abcd1234567890abcd1234567890abcd failed');
      const sanitized = ErrorHandler.sanitizeError(error);
      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('abcd1234567890abcd1234567890abcd');
    });

    it('should redact bearer tokens', () => {
      const error = new Error('Bearer abc123token failed');
      const sanitized = ErrorHandler.sanitizeError(error);
      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('abc123token');
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first try', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await ErrorHandler.retryWithBackoff(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValue('success');
      
      const result = await ErrorHandler.retryWithBackoff(mockFn, 3);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(ErrorHandler.retryWithBackoff(mockFn, 2))
        .rejects.toThrow('Failed after 3 attempts');
      
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });
});