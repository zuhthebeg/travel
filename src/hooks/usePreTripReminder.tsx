/**
 * Pre-trip Reminder Hook — V3
 *
 * Checks if any trip starts tomorrow and prompts user to enable offline mode.
 * Fires once per trip per day (dedup via localStorage).
 */
import { useEffect, useState, useCallback } from 'react';
import { plansAPI } from '../lib/api';
import type { Plan } from '../store/types';

interface PreTripReminder {
  plan: Plan;
  message: string;
}

export function usePreTripReminder() {
  const [reminder, setReminder] = useState<PreTripReminder | null>(null);

  const checkTrips = useCallback(async () => {
    // Skip if offline mode already enabled
    if (localStorage.getItem('offline_mode') === 'true') return;

    try {
      const plans = await plansAPI.getAll({ mine: true });
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

      for (const plan of plans) {
        if (!plan.start_date) continue;
        const startDate = plan.start_date.slice(0, 10);

        // Trip starts tomorrow?
        if (startDate !== tomorrowStr) continue;

        // Already reminded today?
        const todayStr = now.toISOString().slice(0, 10);
        const dedupKey = `offlineReminder:${plan.id}:${todayStr}`;
        if (localStorage.getItem(dedupKey)) continue;

        // Fire reminder
        localStorage.setItem(dedupKey, 'true');
        const regionText = plan.region || plan.title;
        setReminder({
          plan,
          message: `내일 "${regionText}" 여행이 시작됩니다! 오프라인 모드를 켜서 여행 데이터를 미리 다운로드하세요.`,
        });
        break; // One reminder at a time
      }
    } catch {
      // Network error — can't check, skip silently
    }
  }, []);

  useEffect(() => {
    // Check on mount
    checkTrips();

    // Check on focus (returning to app)
    const handleFocus = () => checkTrips();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [checkTrips]);

  const dismiss = useCallback(() => setReminder(null), []);

  return { reminder, dismiss };
}

/**
 * Pre-trip Reminder Banner Component
 */
export function PreTripReminderBanner({
  onEnableOffline,
}: {
  onEnableOffline?: () => void;
}) {
  const { reminder, dismiss } = usePreTripReminder();

  if (!reminder) return null;

  return (
    <div className="alert alert-info shadow-lg mb-4">
      <div className="flex-1">
        <span className="text-sm">✈️ {reminder.message}</span>
      </div>
      <div className="flex gap-2">
        <button
          className="btn btn-sm btn-primary"
          onClick={() => {
            localStorage.setItem('offline_mode', 'true');
            onEnableOffline?.();
            dismiss();
          }}
        >
          오프라인 모드 켜기
        </button>
        <button className="btn btn-sm btn-ghost" onClick={dismiss}>
          닫기
        </button>
      </div>
    </div>
  );
}
