/**
 * Tests for Validator utility
 */

import { Validator, ValidationError } from '../../src/utils/validation';

describe('Validator', () => {
  describe('validateAgentMode', () => {
    it('should validate correct agent modes', () => {
      expect(Validator.validateAgentMode('architect')).toBe('architect');
      expect(Validator.validateAgentMode('coder')).toBe('coder');
      expect(Validator.validateAgentMode('tester')).toBe('tester');
    });

    it('should throw for invalid agent modes', () => {
      expect(() => Validator.validateAgentMode('invalid')).toThrow(ValidationError);
      expect(() => Validator.validateAgentMode('')).toThrow(ValidationError);
    });
  });

  describe('validateTaskDescription', () => {
    it('should validate correct task descriptions', () => {
      const description = 'Build a REST API with authentication';
      expect(Validator.validateTaskDescription(description)).toBe(description);
    });

    it('should trim whitespace', () => {
      const description = '  Build a REST API  ';
      expect(Validator.validateTaskDescription(description)).toBe('Build a REST API');
    });

    it('should throw for empty descriptions', () => {
      expect(() => Validator.validateTaskDescription('')).toThrow(ValidationError);
      expect(() => Validator.validateTaskDescription('   ')).toThrow(ValidationError);
    });

    it('should throw for non-string descriptions', () => {
      expect(() => Validator.validateTaskDescription(null as unknown as string)).toThrow(ValidationError);
      expect(() => Validator.validateTaskDescription(123 as unknown as string)).toThrow(ValidationError);
    });

    it('should throw for too long descriptions', () => {
      const longDescription = 'a'.repeat(10001);
      expect(() => Validator.validateTaskDescription(longDescription)).toThrow(ValidationError);
    });

    it('should detect suspicious content', () => {
      expect(() => Validator.validateTaskDescription('<script>alert("xss")</script>')).toThrow(ValidationError);
      expect(() => Validator.validateTaskDescription('javascript:alert(1)')).toThrow(ValidationError);
      expect(() => Validator.validateTaskDescription('eval(malicious_code)')).toThrow(ValidationError);
    });
  });

  describe('validateApiKey', () => {
    it('should validate correct API keys', () => {
      const apiKey = 'abcd1234567890abcd1234567890';
      expect(Validator.validateApiKey(apiKey)).toBe(apiKey);
    });

    it('should trim whitespace', () => {
      const apiKey = '  abcd1234567890abcd1234567890  ';
      expect(Validator.validateApiKey(apiKey)).toBe('abcd1234567890abcd1234567890');
    });

    it('should throw for short API keys', () => {
      expect(() => Validator.validateApiKey('short')).toThrow(ValidationError);
    });

    it('should throw for long API keys', () => {
      const longKey = 'a'.repeat(201);
      expect(() => Validator.validateApiKey(longKey)).toThrow(ValidationError);
    });

    it('should throw for invalid characters', () => {
      expect(() => Validator.validateApiKey('invalid@key!')).toThrow(ValidationError);
    });
  });

  describe('validateParallelCount', () => {
    it('should validate correct numbers', () => {
      expect(Validator.validateParallelCount(5)).toBe(5);
      expect(Validator.validateParallelCount('10')).toBe(10);
    });

    it('should throw for invalid numbers', () => {
      expect(() => Validator.validateParallelCount('invalid')).toThrow(ValidationError);
      expect(() => Validator.validateParallelCount(0)).toThrow(ValidationError);
      expect(() => Validator.validateParallelCount(21)).toThrow(ValidationError);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      const config = {
        maxAgents: 5,
        memoryPath: './memory.json',
        authMethod: 'api-key'
      };
      
      const result = Validator.validateConfig(config);
      expect(result.maxAgents).toBe(5);
      expect(result.authMethod).toBe('api-key');
    });

    it('should throw for invalid auth method', () => {
      const config = { authMethod: 'invalid' };
      expect(() => Validator.validateConfig(config)).toThrow(ValidationError);
    });
  });

  describe('sanitizeString', () => {
    it('should remove control characters', () => {
      const input = 'Hello\x00\x08World';
      const result = Validator.sanitizeString(input);
      expect(result).toBe('HelloWorld');
    });

    it('should escape HTML characters', () => {
      const input = '<script>alert("xss")</script>';
      const result = Validator.sanitizeString(input);
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should limit length', () => {
      const input = 'a'.repeat(2000);
      const result = Validator.sanitizeString(input, 100);
      expect(result.length).toBe(100);
    });
  });
});