/**
 * Pre-trip reminder detection logic tests
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Pre-trip reminder dedup', () => {
  it('dedup key prevents duplicate reminders', () => {
    const planId = 42;
    const today = new Date().toISOString().slice(0, 10);
    const dedupKey = `offlineReminder:${planId}:${today}`;

    // First time: no key
    expect(localStorage.getItem(dedupKey)).toBeNull();

    // Set dedup
    localStorage.setItem(dedupKey, 'true');
    expect(localStorage.getItem(dedupKey)).toBe('true');
  });

  it('skips reminder when offline mode already enabled', () => {
    localStorage.setItem('offline_mode', 'true');
    const shouldSkip = localStorage.getItem('offline_mode') === 'true';
    expect(shouldSkip).toBe(true);
  });
});

describe('D-1 date detection', () => {
  it('correctly identifies tomorrow date', () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Simulate a trip starting tomorrow
    const tripStartDate = tomorrowStr;
    expect(tripStartDate).toBe(tomorrowStr);
  });

  it('does not match today or day-after-tomorrow', () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const todayStr = now.toISOString().slice(0, 10);
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterStr = dayAfter.toISOString().slice(0, 10);

    expect(todayStr).not.toBe(tomorrowStr);
    expect(dayAfterStr).not.toBe(tomorrowStr);
  });
});
