import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Schedule } from '../store/types';
import { parseDateLocal } from '../lib/utils';

interface CalendarViewProps {
  schedules: Schedule[];
  startDate: string;
  endDate: string;
  onScheduleClick: (schedule: Schedule) => void;
}

// 스케줄 → 색상 (날짜 기반 Day 넘버로)
const DAY_COLORS = [
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
  'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800',
  'bg-lime-100 border-lime-300 text-lime-800',
  'bg-indigo-100 border-indigo-300 text-indigo-800',
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getDaysBetween(start: string, end: string): number {
  return Math.ceil((parseDateLocal(end).getTime() - parseDateLocal(start).getTime()) / 86400000) + 1;
}

function formatShortDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getDayNum(scheduleDate: string, startDate: string): number {
  return Math.ceil((parseDateLocal(scheduleDate).getTime() - parseDateLocal(startDate).getTime()) / 86400000) + 1;
}

function getColorClass(dayNum: number): string {
  return DAY_COLORS[(dayNum - 1) % DAY_COLORS.length];
}

// 날짜 배열 생성
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// 월의 전체 날짜 그리드 (일요일 시작)
function getMonthGrid(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (string | null)[] = [];

  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    grid.push(date);
  }
  return grid;
}

export default function CalendarView({ schedules, startDate, endDate, onScheduleClick }: CalendarViewProps) {
  const totalDays = getDaysBetween(startDate, endDate);
  const dates = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

  // 스케줄을 날짜별로 그룹핑
  const schedulesByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    schedules.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    // 시간순 정렬
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
    return map;
  }, [schedules]);

  // 자동 뷰 결정: ≤7일 = day, 8~21일 = week, 22+ = month
  const autoMode = totalDays <= 7 ? 'day' : totalDays <= 21 ? 'week' : 'month';

  if (autoMode === 'month') {
    return <MonthView dates={dates} startDate={startDate} endDate={endDate} schedulesByDate={schedulesByDate} onScheduleClick={onScheduleClick} />;
  }
  if (autoMode === 'week') {
    return <WeekView dates={dates} startDate={startDate} schedulesByDate={schedulesByDate} onScheduleClick={onScheduleClick} />;
  }
  return <DayView dates={dates} startDate={startDate} schedulesByDate={schedulesByDate} onScheduleClick={onScheduleClick} />;
}

// === Day View (≤7일) — 시간축 기반 ===
function DayView({ dates, startDate, schedulesByDate, onScheduleClick }: {
  dates: string[];
  startDate: string;
  schedulesByDate: Record<string, Schedule[]>;
  onScheduleClick: (s: Schedule) => void;
}) {
  const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 ~ 21:00

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* 헤더 */}
        <div className="grid gap-px bg-base-300" style={{ gridTemplateColumns: `48px repeat(${dates.length}, 1fr)` }}>
          <div className="bg-base-100 p-1" />
          {dates.map(date => {
            const d = new Date(date + 'T00:00:00');
            const dayNum = getDayNum(date, startDate);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div key={date} className={`bg-base-100 p-2 text-center ${isWeekend ? 'bg-base-200/50' : ''}`}>
                <div className="text-[10px] text-base-content/50">{WEEKDAYS[d.getDay()]}</div>
                <div className="font-bold text-sm">{d.getDate()}</div>
                <div className={`text-[9px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 ${getColorClass(dayNum)}`}>
                  Day {dayNum}
                </div>
              </div>
            );
          })}
        </div>

        {/* 시간 그리드 */}
        {hours.map(hour => (
          <div key={hour} className="grid gap-px bg-base-300" style={{ gridTemplateColumns: `48px repeat(${dates.length}, 1fr)` }}>
            <div className="bg-base-100 px-1 py-2 text-[10px] text-base-content/40 text-right pr-2">
              {hour}:00
            </div>
            {dates.map(date => {
              const items = (schedulesByDate[date] || []).filter(s => {
                if (!s.time) return hour === 9; // 시간 없는 일정은 09:00에
                return parseInt(s.time.split(':')[0]) === hour;
              });
              const dayNum = getDayNum(date, startDate);
              return (
                <div key={date} className="bg-base-100 px-1 py-1 min-h-[36px] border-t border-base-200/50">
                  {items.map(s => (
                    <button
                      key={s.id}
                      onClick={() => onScheduleClick(s)}
                      className={`w-full text-left px-1.5 py-1 rounded text-[11px] leading-tight border mb-0.5 hover:opacity-80 transition-opacity truncate ${getColorClass(dayNum)}`}
                    >
                      {s.time && <span className="font-mono opacity-60">{s.time} </span>}
                      {s.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// === Week View (8~21일) — 주 단위 카드 ===
function WeekView({ dates, startDate, schedulesByDate, onScheduleClick }: {
  dates: string[];
  startDate: string;
  schedulesByDate: Record<string, Schedule[]>;
  onScheduleClick: (s: Schedule) => void;
}) {
  // 7일씩 나누기
  const weeks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) {
    weeks.push(dates.slice(i, i + 7));
  }

  return (
    <div className="space-y-4">
      {weeks.map((week, wi) => (
        <div key={wi}>
          <div className="text-xs text-base-content/50 mb-2 font-medium">
            {formatShortDate(week[0])} ~ {formatShortDate(week[week.length - 1])}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* 요일 헤더 */}
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[10px] text-base-content/40 pb-1">{d}</div>
            ))}

            {/* 첫 주 시작 요일 맞추기 */}
            {(() => {
              const firstDow = new Date(week[0] + 'T00:00:00').getDay();
              const cells: React.ReactNode[] = [];

              // 빈 셀
              for (let i = 0; i < firstDow && wi === 0; i++) {
                cells.push(<div key={`empty-${i}`} className="min-h-[60px]" />);
              }

              week.forEach(date => {
                const d = new Date(date + 'T00:00:00');
                const dayNum = getDayNum(date, startDate);
                const items = schedulesByDate[date] || [];
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                cells.push(
                  <div
                    key={date}
                    className={`rounded-lg p-1 min-h-[60px] border ${
                      items.length > 0 ? 'border-base-300 bg-base-100' : 'border-transparent bg-base-200/30'
                    } ${isWeekend ? 'bg-base-200/50' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold">{d.getDate()}</span>
                      <span className={`text-[8px] px-1 rounded ${getColorClass(dayNum)}`}>D{dayNum}</span>
                    </div>
                    <div className="space-y-0.5">
                      {items.slice(0, 3).map(s => (
                        <button
                          key={s.id}
                          onClick={() => onScheduleClick(s)}
                          className={`w-full text-left px-1 py-0.5 rounded text-[9px] leading-tight border truncate hover:opacity-80 ${getColorClass(dayNum)}`}
                        >
                          {s.title}
                        </button>
                      ))}
                      {items.length > 3 && (
                        <div className="text-[8px] text-base-content/40 text-center">+{items.length - 3}</div>
                      )}
                    </div>
                  </div>
                );
              });

              return cells;
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}

// === Month View (22일+) — 달력 그리드 ===
function MonthView({ dates, startDate, endDate, schedulesByDate, onScheduleClick }: {
  dates: string[];
  startDate: string;
  endDate: string;
  schedulesByDate: Record<string, Schedule[]>;
  onScheduleClick: (s: Schedule) => void;
}) {
  const startD = new Date(startDate + 'T00:00:00');
  const endD = new Date(endDate + 'T00:00:00');
  const todayLocal = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  // 포함된 월 목록
  const months: { year: number; month: number }[] = [];
  const cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
  while (cur <= endD) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }

  const [currentMonthIdx, setCurrentMonthIdx] = useState(0);
  const { year, month } = months[currentMonthIdx];
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const dateSet = useMemo(() => new Set(dates), [dates]);

  return (
    <div>
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-3">
        <button
          className="btn btn-ghost btn-sm btn-circle"
          onClick={() => setCurrentMonthIdx(Math.max(0, currentMonthIdx - 1))}
          disabled={currentMonthIdx === 0}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-bold text-base">
          {year}년 {month + 1}월
        </span>
        <button
          className="btn btn-ghost btn-sm btn-circle"
          onClick={() => setCurrentMonthIdx(Math.min(months.length - 1, currentMonthIdx + 1))}
          disabled={currentMonthIdx === months.length - 1}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-medium py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-base-content/50'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-px bg-base-300 rounded-xl overflow-hidden">
        {grid.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="bg-base-100 min-h-[52px]" />;

          const isTrip = dateSet.has(date);
          const items = schedulesByDate[date] || [];
          const dayNum = isTrip ? getDayNum(date, startDate) : 0;
          const d = new Date(date + 'T00:00:00');
          const isToday = date === todayLocal;
          const dow = d.getDay();

          return (
            <div
              key={date}
              className={`bg-base-100 p-1 min-h-[52px] ${
                isTrip ? '' : 'opacity-40'
              } ${isToday ? 'ring-2 ring-primary ring-inset' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : ''}`}>
                  {d.getDate()}
                </span>
                {isTrip && <span className={`text-[7px] px-1 rounded ${getColorClass(dayNum)}`}>D{dayNum}</span>}
              </div>
              {items.slice(0, 2).map(s => (
                <button
                  key={s.id}
                  onClick={() => onScheduleClick(s)}
                  className={`w-full text-left px-0.5 py-px rounded text-[8px] leading-tight truncate hover:opacity-80 mt-0.5 ${isTrip ? getColorClass(dayNum) : ''}`}
                >
                  {s.title}
                </button>
              ))}
              {items.length > 2 && (
                <div className="text-[7px] text-base-content/40 text-center">+{items.length - 2}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
