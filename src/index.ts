/**
 * Gemini Code Flow - Main Entry Point
 * Adapted from Claude Code Flow by ruvnet
 */

export { Orchestrator } from './core/orchestrator';
export { GeminiClient } from './core/gemini-client';
export { MemoryManager } from './core/memory-manager';
export { TaskQueue } from './core/task-queue';

export { SparcCommand } from './commands/sparc';
export { InitCommand } from './commands/init';
export { AgentCommand } from './commands/agent';
export { StatusCommand } from './commands/status';

export { Logger } from './utils/logger';
export { ErrorHandler } from './utils/error-handler';
export { Validator, ValidationError } from './utils/validation';
export { PathSecurity, PathSecurityError } from './utils/path-security';

export * from './types';

// Version
import packageJson from '../package.json';
export const version = packageJson.version;