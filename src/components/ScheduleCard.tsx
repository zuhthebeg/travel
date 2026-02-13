import { formatDisplayDate } from '../lib/utils';
import type { Schedule } from '../store/types';
import { MapPin, Plane, Sunrise, Sun, Sunset, Moon } from 'lucide-react';

interface ScheduleCardProps {
  schedule: Schedule;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: number) => void;
  onView: (schedule: Schedule) => void;
}

// Helper function to detect and linkify flight numbers
function linkifyFlightNumbers(text: string) {
  // Pattern: 2-3 uppercase letters followed by 1-4 digits
  // Matches: KE123, OZ456, AA1234, CAL161, etc.
  const flightPattern = /\b([A-Z]{2,3})(\d{1,4})\b/g;

  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  while ((match = flightPattern.exec(text)) !== null) {
    const flightCode = match[0]; // Full match (e.g., "KE123")
    const matchIndex = match.index;

    // Add text before the match
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    // Add flight number as a clickable link
    parts.push(
      <a
        key={`flight-${keyCounter++}`}
        href={`https://ko.flightaware.com/live/flight/${flightCode}`}
        target="_blank"
        rel="noopener noreferrer"
        className="link link-primary font-semibold inline-flex items-center gap-1 hover:gap-2 transition-all"
        onClick={(e) => e.stopPropagation()} // Prevent card click
        title={`${flightCode} 항공편 정보 보기`}
      >
        <Plane className="w-4 h-4" /> {flightCode}
      </a>
    );

    lastIndex = matchIndex + flightCode.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// Helper function to get time period icon and color
function getTimePeriod(time: string): { icon: React.ReactNode; color: string; bgColor: string } {
  const [hours] = time.split(':').map(Number);

  if (hours >= 0 && hours < 6) {
    return { icon: <Moon className="w-4 h-4" />, color: 'badge-secondary', bgColor: 'bg-secondary' }; // Dawn/Night
  } else if (hours >= 6 && hours < 12) {
    return { icon: <Sunrise className="w-4 h-4" />, color: 'badge-warning', bgColor: 'bg-warning' }; // Morning
  } else if (hours >= 12 && hours < 18) {
    return { icon: <Sun className="w-4 h-4" />, color: 'badge-accent', bgColor: 'bg-accent' }; // Afternoon
  } else {
    return { icon: <Sunset className="w-4 h-4" />, color: 'badge-info', bgColor: 'bg-info' }; // Evening
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
                  {timePeriod.icon}
                  <span>{schedule.time}</span>
                </div>
              )}
              <div className="text-sm text-base-content/70">
                {formatDisplayDate(schedule.date)}
              </div>
            </div>
            <h3 className="card-title text-xl">
              {schedule.title ? linkifyFlightNumbers(schedule.title as string) : ''}
            </h3>
          </div>
          {/* 삭제 버튼 제거 - 상세보기에서만 삭제 가능 */}
        </div>

        {schedule.place && (
          <p className="text-sm text-base-content/80 mb-2 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="font-medium">
              {linkifyFlightNumbers(schedule.place as string)}
            </span>
          </p>
        )}

        {schedule.memo && (
          <div className="text-sm text-base-content/90 mb-3 whitespace-pre-wrap bg-base-200 p-3 rounded-lg">
            {linkifyFlightNumbers(schedule.memo)}
          </div>
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
