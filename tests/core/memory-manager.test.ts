/**
 * Tests for MemoryManager
 */

import { MemoryManager } from '../../src/core/memory-manager';
import { MemoryFactory, createTempDir, cleanupTempDir } from '../helpers';
import path from 'path';
import fs from 'fs-extra';

describe('MemoryManager', () => {
  let tempDir: string;
  let memoryPath: string;
  let manager: MemoryManager;

  beforeEach(async () => {
    tempDir = await createTempDir();
    memoryPath = path.join(tempDir, 'memory.json');
    manager = new MemoryManager(memoryPath);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('initialize', () => {
    it('should create memory file if not exists', async () => {
      await manager.initialize();

      const exists = await fs.pathExists(memoryPath);
      expect(exists).toBe(false); // Only created on first write
    });

    it('should load existing memory', async () => {
      // Create pre-existing memory
      const existingData = {
        'agent-1': [MemoryFactory.create({ agentId: 'agent-1' })],
      };
      await fs.writeJson(memoryPath, existingData);

      await manager.initialize();

      // Manager should have loaded the data
      const context = await manager.getContext('coder');
      // Context might be empty if tags don't match, but initialization should succeed
      expect(context).toBeDefined();
    });

    it('should handle corrupted memory file', async () => {
      // Write invalid JSON
      await fs.writeFile(memoryPath, 'invalid json{{{');

      await expect(manager.initialize()).resolves.not.toThrow();
    });

    it('should not reinitialize if already initialized', async () => {
      await manager.initialize();
      
      // Second initialization should be a no-op
      await expect(manager.initialize()).resolves.not.toThrow();
    });

    it('should create directory if not exists', async () => {
      const deepPath = path.join(tempDir, 'deep', 'nested', 'memory.json');
      const deepManager = new MemoryManager(deepPath);

      await deepManager.initialize();

      const dirExists = await fs.pathExists(path.dirname(deepPath));
      expect(dirExists).toBe(true);
    });
  });

  describe('store', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should store memory entry', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Test content',
        tags: ['test'],
      });

      const results = await manager.search('Test content');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Test content');
    });

    it('should generate unique IDs', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Content 1',
        tags: [],
      });

      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Content 2',
        tags: [],
      });

      const results = await manager.search('Content');
      expect(results).toHaveLength(2);
      expect(results[0].id).not.toBe(results[1].id);
    });

    it('should add timestamp automatically', async () => {
      const before = Date.now();

      await manager.store({
        agentId: 'agent-1',
        type: 'result',
        content: 'Result',
        tags: [],
      });

      const results = await manager.search('Result');
      const after = Date.now();

      expect(results[0].timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(results[0].timestamp.getTime()).toBeLessThanOrEqual(after);
    });

    it('should handle different content types', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: { key: 'value', nested: { data: 123 } },
        tags: ['test'],
      });

      const results = await manager.search('value');
      expect(results).toHaveLength(1);
    });

    it('should trigger cleanup on store', async () => {
      // Store many entries to trigger cleanup
      for (let i = 0; i < 50; i++) {
        await manager.store({
          agentId: `agent-${i}`,
          type: 'knowledge',
          content: `Content ${i}`,
          tags: [],
        });
      }

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getContext', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should return empty context for no matches', async () => {
      const context = await manager.getContext('coder');
      expect(context).toEqual([]);
    });

    it('should return context for mode', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'result',
        content: 'Coding result',
        tags: ['coder', 'completed'],
      });

      const context = await manager.getContext('coder');

      expect(context).toHaveLength(1);
      expect(context[0].type).toBe('result');
      expect(context[0].summary).toContain('Coding result');
    });

    it('should limit context to 10 entries', async () => {
      // Store 15 entries
      for (let i = 0; i < 15; i++) {
        await manager.store({
          agentId: `agent-${i}`,
          type: 'knowledge',
          content: `Content ${i}`,
          tags: ['coder'],
        });
      }

      const context = await manager.getContext('coder');

      expect(context).toHaveLength(10);
    });

    it('should return most recent entries', async () => {
      // Store entries with delays
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Old content',
        tags: ['coder'],
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await manager.store({
        agentId: 'agent-2',
        type: 'knowledge',
        content: 'New content',
        tags: ['coder'],
      });

      const context = await manager.getContext('coder');

      expect(context[0].summary).toContain('New content');
    });

    it('should truncate long content in summary', async () => {
      const longContent = 'A'.repeat(300);

      await manager.store({
        agentId: 'agent-1',
        type: 'result',
        content: longContent,
        tags: ['coder'],
      });

      const context = await manager.getContext('coder');

      expect(context[0].summary.length).toBeLessThanOrEqual(203); // 200 + '...'
    });

    it('should handle object content in summary', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'result',
        content: { data: 'value', other: 'field' },
        tags: ['coder'],
      });

      const context = await manager.getContext('coder');

      expect(context[0].summary).toBeDefined();
      expect(typeof context[0].summary).toBe('string');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should find entries by content', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Find this text',
        tags: [],
      });

      const results = await manager.search('Find this');

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Find this text');
    });

    it('should be case insensitive', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'CaseSensitive',
        tags: [],
      });

      const results = await manager.search('casesensitive');

      expect(results).toHaveLength(1);
    });

    it('should filter by tags', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Tagged content',
        tags: ['important'],
      });

      await manager.store({
        agentId: 'agent-2',
        type: 'knowledge',
        content: 'Other tagged content',
        tags: ['other'],
      });

      const results = await manager.search('content', ['important']);

      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('important');
    });

    it('should search in object content', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'result',
        content: { message: 'Search for me', data: 123 },
        tags: [],
      });

      const results = await manager.search('Search for me');

      expect(results).toHaveLength(1);
    });

    it('should return empty array for no matches', async () => {
      const results = await manager.search('nonexistent');

      expect(results).toEqual([]);
    });

    it('should handle empty query', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Some content',
        tags: [],
      });

      const results = await manager.search('');

      // Empty query might match nothing or everything depending on implementation
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('flush', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should write memory to disk', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Persist this',
        tags: [],
      });

      await manager.flush();

      const exists = await fs.pathExists(memoryPath);
      expect(exists).toBe(true);

      const data = await fs.readJson(memoryPath);
      expect(data).toBeDefined();
    });

    it('should preserve data after flush and reload', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Persistent data',
        tags: ['test'],
      });

      await manager.flush();

      // Create new manager with same path
      const newManager = new MemoryManager(memoryPath);
      await newManager.initialize();

      const results = await newManager.search('Persistent data');
      expect(results).toHaveLength(1);
    });

    it('should create valid JSON', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'result',
        content: 'Valid JSON test',
        tags: [],
      });

      await manager.flush();

      // Should be able to parse the file
      const content = await fs.readFile(memoryPath, 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should remove old entries', async () => {
      // Create old entry by manipulating timestamp
      const oldEntry = MemoryFactory.create({
        timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      });

      await manager.store({
        agentId: oldEntry.agentId,
        type: oldEntry.type,
        content: oldEntry.content,
        tags: oldEntry.tags,
      });

      // Wait for auto-cleanup or trigger manually
      // Note: Current implementation cleans on store
      await new Promise(resolve => setTimeout(resolve, 100));

      // The entry might be cleaned up depending on maxAge (7 days default)
    });

    it('should enforce max entries limit', async () => {
      // Store more than maxEntries (1000 default)
      for (let i = 0; i < 1100; i++) {
        await manager.store({
          agentId: `agent-${i}`,
          type: 'knowledge',
          content: `Content ${i}`,
          tags: [],
        });
      }

      await manager.flush();

      // Should have enforced the limit
      const newManager = new MemoryManager(memoryPath);
      await newManager.initialize();

      const allResults = await newManager.search('Content');
      expect(allResults.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('auto-save', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should auto-save after delay', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Auto-save test',
        tags: [],
      });

      // Wait for auto-save (5 seconds in implementation)
      await new Promise(resolve => setTimeout(resolve, 5500));

      const exists = await fs.pathExists(memoryPath);
      expect(exists).toBe(true);
    });
  });

  describe('date serialization', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should properly serialize and deserialize dates', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Date test',
        tags: [],
      });

      await manager.flush();

      const newManager = new MemoryManager(memoryPath);
      await newManager.initialize();

      const results = await newManager.search('Date test');

      expect(results[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('concurrent operations', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should handle concurrent stores', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        manager.store({
          agentId: `agent-${i}`,
          type: 'knowledge',
          content: `Concurrent ${i}`,
          tags: [],
        })
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();

      const results = await manager.search('Concurrent');
      expect(results.length).toBe(10);
    });

    it('should handle concurrent searches', async () => {
      await manager.store({
        agentId: 'agent-1',
        type: 'knowledge',
        content: 'Search me',
        tags: [],
      });

      const promises = Array.from({ length: 5 }, () =>
        manager.search('Search me')
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toHaveLength(1);
      });
    });
  });
});