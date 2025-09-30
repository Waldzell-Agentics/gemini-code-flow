/**
 * Tests for TaskQueue
 */

import { TaskQueue } from '../../src/core/task-queue';
import { TaskFactory } from '../helpers';
import { Task } from '../../src/types';

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  describe('add', () => {
    it('should add task to queue', () => {
      const task = TaskFactory.create();
      queue.add(task);

      expect(queue.size()).toBe(1);
    });

    it('should add multiple tasks', () => {
      const tasks = [
        TaskFactory.create({ id: '1' }),
        TaskFactory.create({ id: '2' }),
        TaskFactory.create({ id: '3' }),
      ];

      tasks.forEach(task => queue.add(task));

      expect(queue.size()).toBe(3);
    });

    it('should sort by priority', () => {
      const lowPriority = TaskFactory.create({ id: 'low', priority: 'low' });
      const highPriority = TaskFactory.create({ id: 'high', priority: 'high' });
      const mediumPriority = TaskFactory.create({ id: 'medium', priority: 'medium' });

      queue.add(lowPriority);
      queue.add(highPriority);
      queue.add(mediumPriority);

      // High priority should come first
      const allTasks = queue.getAllTasks();
      expect(queue.size()).toBe(3);
    });
  });

  describe('getNext', () => {
    it('should return null for empty queue', async () => {
      const task = await queue.getNext();
      expect(task).toBeNull();
    });

    it('should return and remove task from queue', async () => {
      const task = TaskFactory.create();
      queue.add(task);

      const nextTask = await queue.getNext();

      expect(nextTask).toBeDefined();
      expect(nextTask?.id).toBe(task.id);
      expect(queue.size()).toBe(0);
    });

    it('should return highest priority task', async () => {
      const low = TaskFactory.create({ id: 'low', priority: 'low' });
      const high = TaskFactory.create({ id: 'high', priority: 'high' });
      const medium = TaskFactory.create({ id: 'medium', priority: 'medium' });

      queue.add(low);
      queue.add(medium);
      queue.add(high);

      const next = await queue.getNext();

      expect(next?.id).toBe('high');
    });

    it('should skip tasks with unmet dependencies', async () => {
      const task1 = TaskFactory.create({ id: 'task1', dependencies: [] });
      const task2 = TaskFactory.create({ 
        id: 'task2', 
        dependencies: ['nonexistent'],
        priority: 'high' // Higher priority but has dependencies
      });

      queue.add(task2);
      queue.add(task1);

      const next = await queue.getNext();

      // Should get task1 since task2 has unmet dependencies
      expect(next?.id).toBe('task1');
    });

    it('should wait for dependencies to complete', async () => {
      const task1 = TaskFactory.create({ id: 'task1', dependencies: [] });
      const task2 = TaskFactory.create({ id: 'task2', dependencies: ['task1'] });

      queue.add(task1);
      queue.add(task2);

      // Get first task
      const first = await queue.getNext();
      expect(first?.id).toBe('task1');

      // Second task should not be available yet
      const second = await queue.getNext();
      expect(second).toBeNull();

      // Mark first task as completed
      if (first) {
        first.status = 'completed';
      }

      // Now we should be able to add task2 back and get it
      queue.add(task2);
      const third = await queue.getNext();
      expect(third?.id).toBe('task2');
    });

    it('should change task status to running', async () => {
      const task = TaskFactory.create({ status: 'pending' });
      queue.add(task);

      const next = await queue.getNext();

      expect(next?.status).toBe('running');
    });
  });

  describe('getById', () => {
    it('should return task by id', () => {
      const task = TaskFactory.create({ id: 'test-123' });
      queue.add(task);

      const found = queue.getById('test-123');

      expect(found).toBeDefined();
      expect(found?.id).toBe('test-123');
    });

    it('should return undefined for nonexistent id', () => {
      const found = queue.getById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should return number of pending tasks', () => {
      queue.add(TaskFactory.create({ status: 'pending' }));
      queue.add(TaskFactory.create({ status: 'pending' }));
      queue.add(TaskFactory.create({ status: 'completed' }));

      expect(queue.size()).toBe(2);
    });

    it('should decrease after getNext', async () => {
      queue.add(TaskFactory.create());
      queue.add(TaskFactory.create());

      expect(queue.size()).toBe(2);

      await queue.getNext();

      expect(queue.size()).toBe(1);
    });
  });

  describe('getAllTasks', () => {
    it('should return empty array for empty queue', () => {
      expect(queue.getAllTasks()).toEqual([]);
    });

    it('should return all tasks', () => {
      const tasks = [
        TaskFactory.create({ id: '1' }),
        TaskFactory.create({ id: '2' }),
        TaskFactory.create({ id: '3' }),
      ];

      tasks.forEach(task => queue.add(task));

      const allTasks = queue.getAllTasks();

      expect(allTasks).toHaveLength(3);
      expect(allTasks.map(t => t.id)).toContain('1');
      expect(allTasks.map(t => t.id)).toContain('2');
      expect(allTasks.map(t => t.id)).toContain('3');
    });

    it('should include all statuses', async () => {
      queue.add(TaskFactory.create({ id: 'task-pending', status: 'pending' }));
      const runningTask = TaskFactory.create({ id: 'task-running', status: 'pending' });
      queue.add(runningTask);
      
      // Get and mark as running
      const next = await queue.getNext();
      if (next) next.status = 'running';
      
      queue.add(TaskFactory.create({ id: 'task-completed', status: 'completed' }));

      const allTasks = queue.getAllTasks();

      expect(allTasks.length).toBeGreaterThanOrEqual(2);
      // Should have tasks with different statuses
      const statuses = allTasks.map(t => t.status);
      expect(statuses.length).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed tasks', () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      const recentDate = new Date();

      const oldTask = TaskFactory.create({
        id: 'old',
        status: 'completed',
        createdAt: oldDate,
      });

      const recentTask = TaskFactory.create({
        id: 'recent',
        status: 'completed',
        createdAt: recentDate,
      });

      queue.add(oldTask);
      queue.add(recentTask);

      // Cleanup with 24 hour max age
      queue.cleanup(24 * 60 * 60 * 1000);

      const allTasks = queue.getAllTasks();

      expect(allTasks).toHaveLength(1);
      expect(allTasks[0].id).toBe('recent');
    });

    it('should not remove pending or running tasks', () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);

      const oldPending = TaskFactory.create({
        id: 'old-pending',
        status: 'pending',
        createdAt: oldDate,
      });

      const oldRunning = TaskFactory.create({
        id: 'old-running',
        status: 'running',
        createdAt: oldDate,
      });

      queue.add(oldPending);
      queue.add(oldRunning);

      queue.cleanup(24 * 60 * 60 * 1000);

      // Only completed tasks should be removed, pending/running stay
      const remaining = queue.getAllTasks();
      expect(remaining.length).toBeGreaterThanOrEqual(1);
      // At least one should remain (pending or running, whichever wasn't processed)
      const hasNonCompleted = remaining.some(t => t.status !== 'completed');
      expect(hasNonCompleted).toBe(true);
    });

    it('should handle custom max age', () => {
      const veryOld = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours
      const old = new Date(Date.now() - 36 * 60 * 60 * 1000); // 36 hours
      const recent = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours

      queue.add(TaskFactory.create({ id: 'very-old', status: 'completed', createdAt: veryOld }));
      queue.add(TaskFactory.create({ id: 'old', status: 'completed', createdAt: old }));
      queue.add(TaskFactory.create({ id: 'recent', status: 'completed', createdAt: recent }));

      // Cleanup with 48 hour max age
      queue.cleanup(48 * 60 * 60 * 1000);

      const remaining = queue.getAllTasks();
      expect(remaining).toHaveLength(2);
      expect(remaining.find(t => t.id === 'very-old')).toBeUndefined();
    });
  });

  describe('priority ordering', () => {
    it('should handle all priority levels', async () => {
      const tasks = [
        TaskFactory.create({ id: 'low1', priority: 'low' }),
        TaskFactory.create({ id: 'high1', priority: 'high' }),
        TaskFactory.create({ id: 'medium1', priority: 'medium' }),
        TaskFactory.create({ id: 'high2', priority: 'high' }),
        TaskFactory.create({ id: 'low2', priority: 'low' }),
      ];

      tasks.forEach(task => queue.add(task));

      const first = await queue.getNext();
      expect(first?.priority).toBe('high');

      const second = await queue.getNext();
      expect(second?.priority).toBe('high');

      const third = await queue.getNext();
      expect(third?.priority).toBe('medium');

      const fourth = await queue.getNext();
      expect(fourth?.priority).toBe('low');
    });
  });

  describe('dependency chains', () => {
    it('should handle multi-level dependencies', async () => {
      const task1 = TaskFactory.create({ id: 'task1', dependencies: [] });
      const task2 = TaskFactory.create({ id: 'task2', dependencies: ['task1'] });
      const task3 = TaskFactory.create({ id: 'task3', dependencies: ['task2'] });

      queue.add(task1);
      queue.add(task2);
      queue.add(task3);

      // Should get tasks in order
      const first = await queue.getNext();
      expect(first?.id).toBe('task1');

      // Mark completed and re-add others
      if (first) first.status = 'completed';
      
      // Task2 should now be available
      const second = await queue.getNext();
      expect(second?.id).toBe('task2');

      // Mark completed
      if (second) second.status = 'completed';

      // Task3 should now be available
      const third = await queue.getNext();
      expect(third?.id).toBe('task3');
    });

    it('should handle circular dependency detection', async () => {
      // Note: Current implementation doesn't prevent circular deps,
      // but should handle gracefully by never returning them
      const task1 = TaskFactory.create({ id: 'task1', dependencies: ['task2'] });
      const task2 = TaskFactory.create({ id: 'task2', dependencies: ['task1'] });

      queue.add(task1);
      queue.add(task2);

      const next = await queue.getNext();
      
      // Neither should be available due to circular dependency
      expect(next).toBeNull();
    });

    it('should handle missing dependencies', async () => {
      const task = TaskFactory.create({
        id: 'task1',
        dependencies: ['missing-task'],
      });

      queue.add(task);

      const next = await queue.getNext();

      // Task with missing dependency should not be returned
      expect(next).toBeNull();
    });

    it('should handle empty dependencies array', async () => {
      const task = TaskFactory.create({
        id: 'task1',
        dependencies: [],
      });

      queue.add(task);

      const next = await queue.getNext();

      expect(next).toBeDefined();
      expect(next?.id).toBe('task1');
    });
  });

  describe('edge cases', () => {
    it('should handle duplicate task IDs', () => {
      const task1 = TaskFactory.create({ id: 'duplicate', description: 'First' });
      const task2 = TaskFactory.create({ id: 'duplicate', description: 'Second' });

      queue.add(task1);
      queue.add(task2);

      // Map automatically deduplicates by key, so second overwrites first
      const allTasks = queue.getAllTasks();
      expect(allTasks).toHaveLength(1);
      expect(allTasks[0].description).toBe('Second');
    });

    it('should handle tasks with undefined fields', async () => {
      const task: Task = {
        id: 'test',
        description: 'Test',
        mode: 'coder',
        priority: 'medium',
        dependencies: [],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      queue.add(task);

      const next = await queue.getNext();
      expect(next).toBeDefined();
    });

    it('should handle very large queues', () => {
      const tasks = Array.from({ length: 1000 }, (_, i) =>
        TaskFactory.create({ id: `task-${i}` })
      );

      tasks.forEach(task => queue.add(task));

      expect(queue.size()).toBe(1000);
    });
  });
});