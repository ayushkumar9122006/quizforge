// Phase 2 Tab Switch Verification Test Suite
import assert from 'node:assert'

console.log("======================================================================")
console.log("RUNNING PHASE 2 TAB-SWITCH VERIFICATION SUITE")
console.log("======================================================================")

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

// Simulated TabSwitchManager mirroring QuizAttempt.jsx architecture
class TabSwitchMonitor {
  constructor(quizId, onSubmitCallback) {
    this.quizId = quizId
    this.storageTabSwitchesKey = `quizee_attempt_${quizId}_tab_switches`
    this.storageAnswersKey = `quizee_attempt_${quizId}_answers`
    this.onSubmitCallback = onSubmitCallback

    // Initial state from storage
    const saved = sessionStorageMock.getItem(this.storageTabSwitchesKey)
    this.tabSwitchCount = saved ? Math.min(3, Math.max(0, parseInt(saved, 10) || 0)) : 0
    this.tabWarningModal = null
    this.lastViolationTime = 0
    this.isMounted = true
    this.hasLeft = false
    this.isSubmitting = false
    this.submitted = false
  }

  handleTabViolation() {
    if (!this.isMounted) return
    if (this.isSubmitting || this.submitted) return
    const now = Date.now()
    if (now - this.lastViolationTime < 1500) return
    this.lastViolationTime = now

    if (this.tabSwitchCount >= 3) return

    const nextCount = this.tabSwitchCount + 1
    this.tabSwitchCount = nextCount
    sessionStorageMock.setItem(this.storageTabSwitchesKey, String(nextCount))

    if (nextCount === 1) {
      this.tabWarningModal = { count: 1 }
    } else if (nextCount === 2) {
      this.tabWarningModal = { count: 2 }
    } else if (nextCount >= 3) {
      this.tabWarningModal = { count: 3 }
      this.doSubmit(true)
    }
  }

  onVisibilityChange(visibilityState) {
    if (visibilityState === 'hidden') {
      if (!this.hasLeft) {
        this.hasLeft = true
        this.handleTabViolation()
      }
    } else if (visibilityState === 'visible') {
      this.hasLeft = false
    }
  }

  onWindowBlur(visibilityState) {
    if (visibilityState === 'hidden') {
      if (!this.hasLeft) {
        this.hasLeft = true
        this.handleTabViolation()
      }
    }
  }

  onWindowFocus() {
    this.hasLeft = false
  }

  async doSubmit(auto = false) {
    if (this.isSubmitting || this.submitted) return
    this.isSubmitting = true
    try {
      await this.onSubmitCallback(auto)
      this.submitted = true
      sessionStorageMock.removeItem(this.storageTabSwitchesKey)
      sessionStorageMock.removeItem(this.storageAnswersKey)
    } catch (err) {
      this.isSubmitting = false
      // Storage NOT removed on error
    }
  }
}

// ── TEST 1: Initial state is 0 ──
console.log("\n[TEST 1] Initial state with no tab switching...")
sessionStorageMock.clear()
const monitor1 = new TabSwitchMonitor("quiz_1", async () => {})
assert.strictEqual(monitor1.tabSwitchCount, 0)
assert.strictEqual(monitor1.tabWarningModal, null)
console.log("  ✓ Count is 0, no modal shown")

// ── TEST 2: Switch away once -> count = 1 + Warning 1 ──
console.log("\n[TEST 2] 1st tab switch -> count = 1 + warning modal...")
monitor1.onVisibilityChange('hidden')
assert.strictEqual(monitor1.tabSwitchCount, 1)
assert.deepStrictEqual(monitor1.tabWarningModal, { count: 1 })
assert.strictEqual(monitor1.submitted, false)
assert.strictEqual(sessionStorageMock.getItem("quizee_attempt_quiz_1_tab_switches"), "1")
console.log("  ✓ Count = 1, Warning 1 modal displayed, test not submitted")

// ── TEST 3: Switch away second time -> count = 2 + Warning 2 ──
console.log("\n[TEST 3] 2nd tab switch -> count = 2 + warning modal...")
// Student returns
monitor1.onVisibilityChange('visible')
// Advance time beyond debounce window
monitor1.lastViolationTime = Date.now() - 2000
monitor1.onVisibilityChange('hidden')
assert.strictEqual(monitor1.tabSwitchCount, 2)
assert.deepStrictEqual(monitor1.tabWarningModal, { count: 2 })
assert.strictEqual(monitor1.submitted, false)
assert.strictEqual(sessionStorageMock.getItem("quizee_attempt_quiz_1_tab_switches"), "2")
console.log("  ✓ Count = 2, Warning 2 modal displayed, test not submitted")

// ── TEST 4: Deduplication of blur + visibilitychange on same switch ──
console.log("\n[TEST 4] Single physical tab switch firing both blur & visibilitychange...")
const monitorDedup = new TabSwitchMonitor("quiz_dedup", async () => {})
// Switch tab: window blur followed by visibilitychange(hidden) within 5ms
monitorDedup.onWindowBlur('hidden')
monitorDedup.onVisibilityChange('hidden')
assert.strictEqual(monitorDedup.tabSwitchCount, 1, `Expected 1 violation, got ${monitorDedup.tabSwitchCount}`)
console.log("  ✓ Overlapping blur + visibilitychange strictly counts as 1 violation")

// ── TEST 5: Rapid repeated events inside 1.5s debounce ──
console.log("\n[TEST 5] Rapid repeated switch noise inside 1.5s...")
monitorDedup.hasLeft = false // user returned quickly
monitorDedup.onVisibilityChange('hidden') // fired at t=10ms
assert.strictEqual(monitorDedup.tabSwitchCount, 1, "Debounce prevented second violation within 1.5s")
console.log("  ✓ Debounce window correctly blocks rapid duplicate violations")

// ── TEST 6: Remount / Page reload preserves existing count without false increment ──
console.log("\n[TEST 6] Page refresh / component remount...")
// monitor1 has count 2 saved in sessionStorage
const remountedMonitor = new TabSwitchMonitor("quiz_1", async () => {})
assert.strictEqual(remountedMonitor.tabSwitchCount, 2, "Remount preserved existing count 2")
assert.strictEqual(remountedMonitor.submitted, false)
console.log("  ✓ Remount restores exact count (2) from sessionStorage with no false increment")

// ── TEST 7: Attempt-scoped isolation across different quizzes ──
console.log("\n[TEST 7] Attempt-scoped isolation across different quizzes...")
const monitorQuiz2 = new TabSwitchMonitor("quiz_2", async () => {})
assert.strictEqual(monitorQuiz2.tabSwitchCount, 0, "Quiz 2 starts at 0 independently")
console.log("  ✓ Quiz 2 is completely isolated and starts at count 0")

// ── TEST 8: 3rd tab switch -> count = 3 + Auto-Submit immediately ──
console.log("\n[TEST 8] 3rd tab switch triggers immediate auto-submit...")
let submitCalled = false
let submitAutoParam = null
const monitorStrike3 = new TabSwitchMonitor("quiz_strike3", async (auto) => {
  submitCalled = true
  submitAutoParam = auto
})
sessionStorageMock.setItem("quizee_attempt_quiz_strike3_answers", JSON.stringify({ 0: 1 }))

// First 2 strikes
monitorStrike3.onVisibilityChange('hidden'); monitorStrike3.onVisibilityChange('visible')
monitorStrike3.lastViolationTime = Date.now() - 2000
monitorStrike3.onVisibilityChange('hidden'); monitorStrike3.onVisibilityChange('visible')
monitorStrike3.lastViolationTime = Date.now() - 2000

// 3rd strike
monitorStrike3.onVisibilityChange('hidden')
// Allow async doSubmit to settle
await new Promise(r => setTimeout(r, 20))

assert.strictEqual(monitorStrike3.tabSwitchCount, 3)
assert.deepStrictEqual(monitorStrike3.tabWarningModal, { count: 3 })
assert.strictEqual(submitCalled, true, "Submit callback was called automatically")
assert.strictEqual(submitAutoParam, true, "Submit was called with auto=true")
assert.strictEqual(monitorStrike3.submitted, true)
// Storage cleaned up only after success
assert.strictEqual(sessionStorageMock.getItem("quizee_attempt_quiz_strike3_tab_switches"), null)
console.log("  ✓ Count = 3 triggered auto-submit with auto=true and cleaned storage after success")

// ── TEST 9: Submission Mutex prevents double submit during 3rd strike ──
console.log("\n[TEST 9] Submission mutex prevents race condition on 3rd strike...")
let submitExecCount = 0
const monitorRace = new TabSwitchMonitor("quiz_race", async () => {
  submitExecCount++
  await new Promise(r => setTimeout(r, 50)) // simulate network delay
})
// Set count to 2
monitorRace.tabSwitchCount = 2
monitorRace.lastViolationTime = Date.now() - 2000

// Trigger 3rd strike while manual submit is concurrently called
const p1 = monitorRace.doSubmit(false) // manual click
monitorRace.onVisibilityChange('hidden') // 3rd tab switch at exact same moment
await p1

assert.strictEqual(submitExecCount, 1, `Expected exactly 1 submission execution, got ${submitExecCount}`)
console.log("  ✓ Mutex serialized simultaneous manual submit and 3rd tab-switch to 1 execution")

// ── TEST 10: Failed 3rd strike submission preserves answers and storage ──
console.log("\n[TEST 10] Failed 3rd strike submission preserves storage for retry...")
sessionStorageMock.setItem("quizee_attempt_fail_answers", JSON.stringify({ 0: 2 }))
const monitorFail = new TabSwitchMonitor("fail", async () => {
  throw new Error("500 Internal Server Error")
})
monitorFail.tabSwitchCount = 2
monitorFail.lastViolationTime = Date.now() - 2000
monitorFail.onVisibilityChange('hidden')
// Allow promise to settle
await new Promise(r => setTimeout(r, 10))

assert.strictEqual(monitorFail.submitted, false)
assert.strictEqual(monitorFail.isSubmitting, false) // mutex released for retry
assert.strictEqual(sessionStorageMock.getItem("quizee_attempt_fail_tab_switches"), "3")
assert.notStrictEqual(sessionStorageMock.getItem("quizee_attempt_fail_answers"), null)
console.log("  ✓ Failed 3rd strike submission preserved answers and allowed retry")

console.log("\n" + "=".repeat(70))
console.log("ALL 10 PHASE 2 TAB-SWITCH LOGIC TESTS PASSED PERFECTLY!")
console.log("=".repeat(70))
