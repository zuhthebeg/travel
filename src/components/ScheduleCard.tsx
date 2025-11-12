import { formatDisplayDate } from '../lib/utils';
import type { Schedule } from '../store/types';

interface ScheduleCardProps {
  schedule: Schedule;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: number) => void;
  onView: (schedule: Schedule) => void;
}

// Helper function to get time period icon and color
function getTimePeriod(time: string): { icon: string; color: string; bgColor: string } {
  const [hours] = time.split(':').map(Number);

  if (hours >= 0 && hours < 6) {
    return { icon: '🌙', color: 'badge-secondary', bgColor: 'bg-secondary' }; // Dawn/Night
  } else if (hours >= 6 && hours < 12) {
    return { icon: '🌅', color: 'badge-warning', bgColor: 'bg-warning' }; // Morning
  } else if (hours >= 12 && hours < 18) {
    return { icon: '☀️', color: 'badge-accent', bgColor: 'bg-accent' }; // Afternoon
  } else {
    return { icon: '🌆', color: 'badge-info', bgColor: 'bg-info' }; // Evening
  }
}

// Helper function to determine schedule status
function getScheduleStatus(schedule: Schedule): 'upcoming' | 'current' | 'past' | 'normal' {
  if (!schedule.time) return 'normal'; // No time set, can't determine status

  const now = new Date();
  const [year, month, day] = schedule.date.split('-').map(Number);
  const [hours, minutes] = schedule.time.split(':').map(Number);
  const scheduleDateTime = new Date(year, month - 1, day, hours, minutes);

  const timeDiff = scheduleDateTime.getTime() - now.getTime();
  const minutesDiff = Math.round(timeDiff / (1000 * 60));

  // Past: schedule time has passed
  if (minutesDiff < 0) return 'past';

  // Current: within 30 minutes before schedule time
  if (minutesDiff >= 0 && minutesDiff <= 30) return 'current';

  // Upcoming: within 2 hours before schedule time
  if (minutesDiff > 30 && minutesDiff <= 120) return 'upcoming';

  return 'normal';
}

function getStatusStyles(status: string): string {
  switch (status) {
    case 'current':
      return 'bg-warning/20 border-2 border-warning shadow-warning/50';
    case 'upcoming':
      return 'bg-info/20 border-2 border-info';
    case 'past':
      return 'bg-base-100 border-2 border-base-300 opacity-60';
    default:
      return 'bg-base-100';
  }
}

export function ScheduleCard({ schedule, onView }: ScheduleCardProps) {
  const status = getScheduleStatus(schedule);
  const statusStyles = getStatusStyles(status);
  const timePeriod = schedule.time ? getTimePeriod(schedule.time) : null;

  return (
    <div
      className={`card shadow-xl hover:shadow-2xl transition-all cursor-pointer ${statusStyles} ${status === 'past' ? 'grayscale-[30%]' : ''}`}
      onClick={() => onView(schedule)}
    >
      <div className="card-body">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {schedule.time && timePeriod && (
                <div className={`badge ${timePeriod.color} badge-lg font-mono gap-1`}>
                  <span>{timePeriod.icon}</span>
                  <span>{schedule.time}</span>
                </div>
              )}
              <div className="text-sm text-base-content/70">
                {formatDisplayDate(schedule.date)}
              </div>
            </div>
            <h3 className="card-title text-xl">
              {(schedule.title as string) || ''}
            </h3>
          </div>
          {/* 삭제 버튼 제거 - 상세보기에서만 삭제 가능 */}
        </div>

        {schedule.place && (
          <p className="text-sm text-base-content/80 mb-2 flex items-center gap-1">
            <span className="text-lg">📍</span>
            <span className="font-medium">
              {(schedule.place as string) || ''}
            </span>
          </p>
        )}

        {schedule.memo && (
          <p className="text-sm text-base-content/90 mb-3 whitespace-pre-wrap bg-base-200 p-3 rounded-lg">
            {schedule.memo}
          </p>
        )}

        {schedule.rating && schedule.rating > 0 && (
          <div className="flex items-center gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <span
                key={star}
                className={`text-lg ${star <= schedule.rating! ? 'text-warning' : 'text-base-300'}`}
              >
                ★
              </span>
            ))}
          </div>
        )}

        {(schedule.plan_b || schedule.plan_c) && (
          <div className="divider">대안 계획</div>
        )}

        {schedule.plan_b && (
          <div className="alert alert-info shadow-sm mb-2">
            <div>
              <span className="font-bold">Plan B:</span> {schedule.plan_b}
            </div>
          </div>
        )}
        {schedule.plan_c && (
          <div className="alert alert-warning shadow-sm">
            <div>
              <span className="font-bold">Plan C:</span> {schedule.plan_c}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
