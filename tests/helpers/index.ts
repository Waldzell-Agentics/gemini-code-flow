/**
 * Test helpers and utilities for Gemini Code Flow
 */

import { Agent, Task, AgentMode, AgentStatus, MemoryEntry } from '../../src/types';

/**
 * Mock factory for creating test agents
 */
export class AgentFactory {
  static create(overrides?: Partial<Agent>): Agent {
    return {
      id: `test-agent-${Date.now()}`,
      mode: 'coder',
      status: 'pending',
      task: 'Test task',
      startTime: new Date(),
      ...overrides,
    };
  }

  static createCompleted(overrides?: Partial<Agent>): Agent {
    return this.create({
      status: 'completed',
      result: 'Test result',
      endTime: new Date(),
      ...overrides,
    });
  }

  static createFailed(overrides?: Partial<Agent>): Agent {
    return this.create({
      status: 'failed',
      error: 'Test error',
      endTime: new Date(),
      ...overrides,
    });
  }
}

/**
 * Mock factory for creating test tasks
 */
export class TaskFactory {
  static create(overrides?: Partial<Task>): Task {
    return {
      id: `test-task-${Date.now()}`,
      description: 'Test task description',
      mode: 'coder',
      priority: 'medium',
      dependencies: [],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createWithDependencies(deps: string[], overrides?: Partial<Task>): Task {
    return this.create({
      dependencies: deps,
      ...overrides,
    });
  }

  static createHighPriority(overrides?: Partial<Task>): Task {
    return this.create({
      priority: 'high',
      ...overrides,
    });
  }
}

/**
 * Mock factory for memory entries
 */
export class MemoryFactory {
  static create(overrides?: Partial<MemoryEntry>): MemoryEntry {
    return {
      id: `test-memory-${Date.now()}`,
      agentId: 'test-agent',
      timestamp: new Date(),
      type: 'knowledge',
      content: 'Test content',
      tags: ['test'],
      ...overrides,
    };
  }

  static createResult(overrides?: Partial<MemoryEntry>): MemoryEntry {
    return this.create({
      type: 'result',
      content: 'Test result content',
      tags: ['coder', 'completed'],
      ...overrides,
    });
  }
}

/**
 * Mock Gemini API response
 */
export class MockGeminiResponse {
  static success(text: string = 'Mock response') {
    return {
      response: {
        text: () => text,
        candidates: [{
          content: { parts: [{ text }] },
        }],
      },
    };
  }

  static error(message: string = 'Mock error') {
    throw new Error(message);
  }

  static rateLimitError() {
    throw new Error('Rate limit exceeded: 429 Too Many Requests');
  }

  static authError() {
    throw new Error('Unauthorized: 401 Invalid API key');
  }
}

/**
 * Mock stream generator
 */
export async function* mockStreamResponse(chunks: string[]) {
  for (const chunk of chunks) {
    yield { text: () => chunk };
  }
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Wait for multiple events
 */
export class EventCollector {
  private events: Array<{ name: string; data: unknown }> = [];

  constructor(private emitter: NodeJS.EventEmitter, private eventNames: string[]) {
    eventNames.forEach(name => {
      emitter.on(name, (data: unknown) => {
        this.events.push({ name, data });
      });
    });
  }

  getEvents(name?: string) {
    if (name) {
      return this.events.filter(e => e.name === name);
    }
    return this.events;
  }

  waitForEvent(name: string, timeout: number = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${name}`));
      }, timeout);

      const handler = (data: unknown) => {
        clearTimeout(timeoutId);
        resolve(data);
      };

      this.emitter.once(name, handler);
    });
  }

  clear() {
    this.events = [];
  }
}

/**
 * Create temporary test directory
 */
export async function createTempDir(): Promise<string> {
  const fs = await import('fs-extra');
  const path = await import('path');
  const os = await import('os');
  
  const tempDir = path.join(os.tmpdir(), `gemini-test-${Date.now()}`);
  await fs.ensureDir(tempDir);
  return tempDir;
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  const fs = await import('fs-extra');
  try {
    await fs.remove(dir);
  } catch (error) {
    console.warn(`Failed to cleanup temp dir ${dir}:`, error);
  }
}

/**
 * Mock file system operations
 */
export class MockFS {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set();

  addFile(path: string, content: string) {
    this.files.set(path, content);
  }

  addDir(path: string) {
    this.dirs.add(path);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  hasDir(path: string): boolean {
    return this.dirs.has(path);
  }

  clear() {
    this.files.clear();
    this.dirs.clear();
  }
}

/**
 * Assertion helpers
 */
export const assertions = {
  assertAgentCompleted(agent: Agent): asserts agent is Agent & { result: unknown; endTime: Date } {
    if (agent.status !== 'completed') {
      throw new Error(`Expected agent to be completed, got ${agent.status}`);
    }
    if (!agent.result) {
      throw new Error('Expected agent to have a result');
    }
    if (!agent.endTime) {
      throw new Error('Expected agent to have an end time');
    }
  },

  assertAgentFailed(agent: Agent): asserts agent is Agent & { error: string; endTime: Date } {
    if (agent.status !== 'failed') {
      throw new Error(`Expected agent to be failed, got ${agent.status}`);
    }
    if (!agent.error) {
      throw new Error('Expected agent to have an error');
    }
    if (!agent.endTime) {
      throw new Error('Expected agent to have an end time');
    }
  },

  assertTaskCompleted(task: Task) {
    if (task.status !== 'completed') {
      throw new Error(`Expected task to be completed, got ${task.status}`);
    }
  },

  assertValidAgentMode(mode: string): asserts mode is AgentMode {
    const validModes: AgentMode[] = [
      'architect', 'coder', 'tester', 'debugger', 'security',
      'documentation', 'integrator', 'monitor', 'optimizer',
      'ask', 'devops', 'tutorial', 'database', 'specification',
      'mcp', 'orchestrator', 'designer'
    ];
    if (!validModes.includes(mode as AgentMode)) {
      throw new Error(`Invalid agent mode: ${mode}`);
    }
  },
};

/**
 * Performance measurement helper
 */
export class PerformanceTimer {
  private startTime: number = 0;
  private marks: Map<string, number> = new Map();

  start() {
    this.startTime = Date.now();
  }

  mark(name: string) {
    this.marks.set(name, Date.now() - this.startTime);
  }

  getMark(name: string): number | undefined {
    return this.marks.get(name);
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  reset() {
    this.startTime = 0;
    this.marks.clear();
  }
}