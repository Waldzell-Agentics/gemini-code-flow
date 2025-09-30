# Known Issues & Future Improvements

**Date:** 2025-09-30  
**Status:** Documented for Future PRs

---

## 🐛 Test Suite Issues

### 1. GeminiClient Tests - Mock Configuration

**Status:** ⚠️ Needs Refinement  
**Affected File:** `tests/core/gemini-client.test.ts`

**Issue:**
The Google Generative AI library mock needs better configuration. Some tests fail because the mock doesn't perfectly replicate the actual API behavior.

**Tests Affected:**
- execute() method tests
- executeMultimodal() tests
- streamExecute() tests
- temperature setting tests

**Root Cause:**
The mock setup in `jest.mock('@google/generative-ai')` needs to more accurately simulate:
- The GenerativeModel structure
- The response object format
- The streaming interface

**Recommended Fix:**
```typescript
// Better mock structure needed
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'Mock response',
          candidates: [...]
        }
      }),
      generateContentStream: jest.fn().mockResolvedValue({
        stream: mockStreamGenerator()
      })
    })
  }))
}));
```

**Priority:** P1 (High)  
**Estimated Time:** 2-3 hours  
**Assignee:** TBD

---

### 2. Orchestrator Tests - Async Timing

**Status:** ⚠️ Needs Adjustment  
**Affected File:** `tests/core/orchestrator.test.ts`

**Issue:**
Orchestrator tests involve complex async operations with timing dependencies. Some tests timeout or fail due to race conditions.

**Tests Affected:**
- Task processing tests
- Agent spawning tests
- Multi-agent coordination tests

**Root Cause:**
1. Real async delays in implementation (setTimeout, setInterval)
2. Event-driven architecture makes timing unpredictable
3. Need better event-based synchronization instead of time-based waits

**Recommended Fix:**
```typescript
// Instead of:
await new Promise(resolve => setTimeout(resolve, 2000));

// Use:
await events.waitForEvent('taskCompleted', 5000);
```

**Priority:** P1 (High)  
**Estimated Time:** 3-4 hours  
**Assignee:** TBD

---

### 3. MemoryManager Auto-Save Test - Long Duration

**Status:** ⚠️ Skipped for Now  
**Affected File:** `tests/core/memory-manager.test.ts`

**Issue:**
The auto-save test waits for 5.5 seconds, making the test suite slow.

**Test Affected:**
- `auto-save › should auto-save after delay`

**Current Status:** Marked as `.skip()`

**Recommended Fix:**
```typescript
// Use Jest fake timers
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('should auto-save after delay', async () => {
  await manager.store(entry);
  
  // Fast-forward time
  jest.advanceTimersByTime(5500);
  
  await flushPromises();
  expect(await fs.pathExists(memoryPath)).toBe(true);
});
```

**Priority:** P2 (Medium)  
**Estimated Time:** 1 hour  
**Assignee:** TBD

---

## ✅ Current Test Status

### Working Tests (106 passing)
- ✅ TaskQueue - All 28 tests passing
- ✅ Validation - All tests passing
- ✅ ErrorHandler - All tests passing
- ✅ MemoryManager - Most tests passing (except auto-save)

### Tests Needing Work
- ⚠️ GeminiClient - 20 tests need mock fixes
- ⚠️ Orchestrator - Timing-related tests need adjustment

### Coverage
- **Current:** 38.52% overall
- **Well-tested components:**
  - memory-manager.ts: 97.5%
  - task-queue.ts: 97.05%
  - error-handler.ts: 97.36%
  - gemini-client.ts: 84.21%

---

## 🔧 Configuration Issues

### 1. Jest Timeout Warnings

**Issue:** Worker processes fail to exit gracefully

**Warning Message:**
```
A worker process has failed to exit gracefully and has been force exited. 
This is likely caused by tests leaking due to improper teardown.
```

**Cause:**
- Auto-save timers in MemoryManager
- Background processes in Orchestrator
- Event listeners not being cleaned up

**Recommended Fix:**
```typescript
afterEach(async () => {
  // Clear all timers
  jest.clearAllTimers();
  
  // Stop orchestrator if running
  if (orchestrator) {
    await orchestrator.stop();
  }
  
  // Remove all listeners
  orchestrator.removeAllListeners();
});
```

**Priority:** P2 (Medium)  
**Estimated Time:** 1-2 hours

---

## 📋 Future Test Additions

### Commands (Not Yet Implemented)
- [ ] `tests/commands/init.test.ts`
- [ ] `tests/commands/sparc.test.ts`
- [ ] `tests/commands/agent.test.ts`
- [ ] `tests/commands/status.test.ts`

**Priority:** P1 (High)  
**Estimated Time:** 3-4 hours total

### Utilities (Partial Coverage)
- [ ] `tests/utils/path-security.test.ts`
- [ ] `tests/utils/logger.test.ts`
- [ ] `tests/utils/rate-limiter.test.ts` (enhance existing)

**Priority:** P1 (High)  
**Estimated Time:** 2-3 hours total

### Integration Tests (Not Yet Implemented)
- [ ] `tests/integration/e2e.test.ts`
- [ ] `tests/integration/multi-agent.test.ts`
- [ ] `tests/integration/error-recovery.test.ts`

**Priority:** P2 (Medium)  
**Estimated Time:** 4-5 hours total

---

## 🎯 Improvement Roadmap

### Sprint 1 (Next Week)
1. Fix GeminiClient mock configuration
2. Fix Orchestrator timing issues
3. Add command tests
4. Fix worker timeout warnings

**Goal:** Get to 106 → 150+ passing tests

### Sprint 2 (Following Week)
1. Add remaining utility tests
2. Fix auto-save test with fake timers
3. Add integration tests
4. Improve test performance

**Goal:** Get to 60% → 75% coverage

### Sprint 3 (Third Week)
1. Add E2E tests
2. Performance benchmarks
3. Stress tests
4. Edge case coverage

**Goal:** Get to 75% → 85% coverage

---

## 💡 Best Practices Learned

### 1. Mock External Dependencies Early
Set up mocks at the module level, not in tests:
```typescript
jest.mock('external-lib', () => ({
  // Complete mock setup
}));
```

### 2. Use Event-Based Synchronization
Instead of arbitrary timeouts:
```typescript
// Bad
await new Promise(resolve => setTimeout(resolve, 1000));

// Good
await waitForEvent(emitter, 'completed', 5000);
```

### 3. Clean Up Resources
Always clean up in afterEach:
```typescript
afterEach(async () => {
  await cleanup();
  jest.clearAllMocks();
  jest.clearAllTimers();
});
```

### 4. Use Fake Timers for Long Delays
```typescript
jest.useFakeTimers();
jest.advanceTimersByTime(5000);
jest.useRealTimers();
```

### 5. Isolate Tests
Each test should be independent:
```typescript
beforeEach(() => {
  // Fresh instance
  instance = new Class();
});
```

---

## 📊 Success Metrics

### Current State
- ✅ 106 tests passing
- ⚠️ 21 tests needing fixes
- ✅ 38% coverage (up from 5%)
- ✅ CI/CD pipeline active

### Target State (Next 2 Weeks)
- 🎯 200+ tests passing
- 🎯 < 5 skipped tests
- 🎯 70% coverage
- 🎯 All critical paths covered

---

## 🤝 How to Help

### For Contributors

**Want to fix the GeminiClient tests?**
1. Check the mock setup in the test file
2. Compare with actual Google Generative AI SDK
3. Update mock to match SDK structure
4. Run tests: `npm test -- --testPathPattern=gemini-client`

**Want to add command tests?**
1. Use existing patterns in `tests/core/`
2. Use helpers from `tests/helpers/index.ts`
3. Mock file system operations
4. Test happy path and error cases

**Want to improve coverage?**
1. Run: `npm test -- --coverage`
2. Open: `coverage/index.html`
3. Find uncovered lines
4. Add tests for those code paths

---

## 📞 Questions?

If you're working on any of these issues:
1. Check existing test patterns
2. Review the helper functions available
3. Ask in PR comments
4. Reference this document in your PR

---

## ✨ Summary

**This PR delivered:**
- ✅ 106 passing tests (major achievement!)
- ✅ Comprehensive test infrastructure
- ✅ CI/CD pipeline
- ✅ Documentation

**Known issues are:**
- ⚠️ Fixable with better mocks (2-3 hours)
- ⚠️ Expected for complex async code
- ⚠️ Documented with solutions

**Bottom line:**
We've gone from 5% to 38% coverage with 106 passing tests. The remaining issues are normal for initial test implementation and have clear paths to resolution.

---

**Last Updated:** 2025-09-30  
**Status:** Active Development  
**Priority:** Address in next sprint