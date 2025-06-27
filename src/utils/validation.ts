/**
 * Input validation utilities for Gemini Code Flow
 */

import path from 'path';
import fs from 'fs-extra';
import { AgentMode } from '../types';

export class ValidationError extends Error {
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    if (field) {
      (this as Error & { field?: string }).field = field;
    }
  }
}

export class Validator {
  /**
   * Validate agent mode
   */
  static validateAgentMode(mode: string): AgentMode {
    const validModes: AgentMode[] = [
      'architect', 'coder', 'tester', 'debugger', 'security',
      'documentation', 'integrator', 'monitor', 'optimizer',
      'ask', 'devops', 'tutorial', 'database', 'specification',
      'mcp', 'orchestrator', 'designer'
    ];
    
    if (!validModes.includes(mode as AgentMode)) {
      throw new ValidationError(`Invalid agent mode: ${mode}. Valid modes: ${validModes.join(', ')}`, 'mode');
    }
    
    return mode as AgentMode;
  }

  /**
   * Validate task description
   */
  static validateTaskDescription(description: string): string {
    if (!description || typeof description !== 'string') {
      throw new ValidationError('Task description is required and must be a string', 'description');
    }
    
    const trimmed = description.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Task description cannot be empty', 'description');
    }
    
    if (trimmed.length > 10000) {
      throw new ValidationError('Task description cannot exceed 10,000 characters', 'description');
    }
    
    // Check for potential injection attempts
    const suspiciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /data:text\/html/gi,
      /eval\s*\(/gi,
      /function\s*\(/gi
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(trimmed)) {
        throw new ValidationError('Task description contains potentially unsafe content', 'description');
      }
    }
    
    return trimmed;
  }

  /**
   * Validate and resolve file path safely
   */
  static async validateFilePath(filePath: string, workingDir?: string): Promise<string> {
    if (!filePath || typeof filePath !== 'string') {
      throw new ValidationError('File path is required and must be a string', 'filePath');
    }
    
    const baseDir = workingDir || process.cwd();
    const resolvedPath = path.resolve(baseDir, filePath);
    const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
    const realBaseDir = await fs.realpath(baseDir);
    
    // Prevent directory traversal
    if (!realPath.startsWith(realBaseDir)) {
      throw new ValidationError(`File must be within the working directory: ${baseDir}`, 'filePath');
    }
    
    // Check file exists and is readable
    try {
      await fs.access(realPath, fs.constants.F_OK | fs.constants.R_OK);
    } catch (error) {
      throw new ValidationError(`File not found or not readable: ${filePath}`, 'filePath');
    }
    
    // Check file size (max 10MB)
    const stats = await fs.stat(realPath);
    if (stats.size > 10 * 1024 * 1024) {
      throw new ValidationError('File size cannot exceed 10MB', 'filePath');
    }
    
    return realPath;
  }

  /**
   * Validate API key format
   */
  static validateApiKey(apiKey: string): string {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new ValidationError('API key is required and must be a string', 'apiKey');
    }
    
    const trimmed = apiKey.trim();
    if (trimmed.length < 10) {
      throw new ValidationError('API key appears to be too short', 'apiKey');
    }
    
    if (trimmed.length > 200) {
      throw new ValidationError('API key appears to be too long', 'apiKey');
    }
    
    // Basic format validation (alphanumeric with some special chars)
    if (!/^[a-zA-Z0-9\-_.]+$/.test(trimmed)) {
      throw new ValidationError('API key contains invalid characters', 'apiKey');
    }
    
    return trimmed;
  }

  /**
   * Validate memory path
   */
  static validateMemoryPath(memoryPath: string): string {
    if (!memoryPath || typeof memoryPath !== 'string') {
      throw new ValidationError('Memory path is required and must be a string', 'memoryPath');
    }
    
    const resolvedPath = path.resolve(memoryPath);
    const dir = path.dirname(resolvedPath);
    
    // Ensure it's a JSON file
    if (!resolvedPath.endsWith('.json')) {
      throw new ValidationError('Memory path must be a .json file', 'memoryPath');
    }
    
    // Check directory is writable
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (error) {
      throw new ValidationError(`Memory path directory is not writable: ${dir}`, 'memoryPath');
    }
    
    return resolvedPath;
  }

  /**
   * Validate parallel agents count
   */
  static validateParallelCount(count: string | number): number {
    const num = typeof count === 'string' ? parseInt(count, 10) : count;
    
    if (isNaN(num) || !isFinite(num)) {
      throw new ValidationError('Parallel count must be a valid number', 'parallel');
    }
    
    if (num < 1) {
      throw new ValidationError('Parallel count must be at least 1', 'parallel');
    }
    
    if (num > 20) {
      throw new ValidationError('Parallel count cannot exceed 20 (API rate limits)', 'parallel');
    }
    
    return num;
  }

  /**
   * Validate configuration object
   */
  static validateConfig(config: Record<string, unknown>): Record<string, unknown> {
    if (!config || typeof config !== 'object') {
      throw new ValidationError('Configuration must be an object', 'config');
    }
    
    const validated: Record<string, unknown> = {};
    
    if (config.maxAgents !== undefined) {
      validated.maxAgents = this.validateParallelCount(config.maxAgents as string | number);
    }
    
    if (config.memoryPath !== undefined) {
      validated.memoryPath = this.validateMemoryPath(config.memoryPath as string);
    }
    
    if (config.apiKey !== undefined) {
      validated.apiKey = this.validateApiKey(config.apiKey as string);
    }
    
    if (config.authMethod !== undefined) {
      if (!['google-account', 'api-key'].includes(config.authMethod as string)) {
        throw new ValidationError('Auth method must be "google-account" or "api-key"', 'authMethod');
      }
      validated.authMethod = config.authMethod;
    }
    
    return validated;
  }

  /**
   * Sanitize string for safe output
   */
  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    
    return input
      .slice(0, maxLength)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/[<>&"']/g, (char) => {
        switch (char) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '"': return '&quot;';
          case "'": return '&#x27;';
          default: return char;
        }
      });
  }
}

export default Validator;