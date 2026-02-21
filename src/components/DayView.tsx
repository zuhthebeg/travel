import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, MapPin, FileText, Plane, StickyNote } from 'lucide-react';
// 년도 없는 날짜 표시: "3월 20일 (목)"
function formatShortDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}
import type { Schedule } from '../store/types';

interface DayNote {
  id: number;
  plan_id: number;
  date: string;
  content: string;
}

interface DayViewProps {
  schedules: Schedule[];
  startDate: string;
  endDate: string;
  planId: number;
  onScheduleClick: (schedule: Schedule) => void;
  onDateChange?: (date: string) => void;
  initialDate?: string | null;
}

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';

// 시간대 아이콘
function getTimeIcon(time: string | null) {
  if (!time) return '📌';
  const h = parseInt(time.split(':')[0]);
  if (h < 6) return '🌙';
  if (h < 12) return '🌅';
  if (h < 18) return '☀️';
  return '🌆';
}

// 항공편 번호 감지
function isFlightSchedule(title: string): boolean {
  return /\b[A-Z]{2,3}\d{1,4}\b/.test(title);
}

export default function DayView({ schedules, startDate, endDate, planId, onScheduleClick, onDateChange, initialDate }: DayViewProps) {
  // 날짜 리스트 생성 (로컬 타임존 기준)
  const dates = useMemo(() => {
    const result: string[] = [];
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const cur = new Date(start);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      result.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [startDate, endDate]);

  const initialIndex = useMemo(() => {
    if (initialDate) {
      const idx = dates.indexOf(initialDate);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [dates, initialDate]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [dayNotes, setDayNotes] = useState<Record<string, DayNote>>({});
  const [editingNote, setEditingNote] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  const currentDate = dates[currentIndex] || startDate;

  // 해당 날짜 일정
  const daySchedules = useMemo(() => {
    return schedules.filter(s => s.date === currentDate);
  }, [schedules, currentDate]);

  // 일별 메모 로드
  useEffect(() => {
    loadDayNotes();
  }, [planId]);

  const loadDayNotes = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/day-notes?plan_id=${planId}`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, DayNote> = {};
        (data.notes || []).forEach((n: DayNote) => { map[n.date] = n; });
        setDayNotes(map);
      }
    } catch (e) {
      console.error('Failed to load day notes:', e);
    }
  };

  const saveDayNote = async () => {
    setSavingNote(true);
    try {
      const res = await fetch(`${API_BASE}/api/day-notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, date: currentDate, content: noteContent }),
      });
      if (res.ok) {
        const data = await res.json();
        setDayNotes(prev => ({ ...prev, [currentDate]: data.note }));
        setEditingNote(false);
      }
    } catch (e) {
      console.error('Failed to save day note:', e);
    } finally {
      setSavingNote(false);
    }
  };

  const deleteDayNote = async () => {
    try {
      await fetch(`${API_BASE}/api/day-notes?plan_id=${planId}&date=${currentDate}`, { method: 'DELETE' });
      setDayNotes(prev => {
        const next = { ...prev };
        delete next[currentDate];
        return next;
      });
      setNoteContent('');
      setEditingNote(false);
    } catch (e) {
      console.error('Failed to delete day note:', e);
    }
  };

  // 스와이프 핸들러
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const handleTouchEnd = () => {
    if (Math.abs(touchDeltaX.current) > 50) {
      if (touchDeltaX.current < 0 && currentIndex < dates.length - 1) {
        const next = currentIndex + 1;
        setCurrentIndex(next);
        onDateChange?.(dates[next]);
      } else if (touchDeltaX.current > 0 && currentIndex > 0) {
        const prev = currentIndex - 1;
        setCurrentIndex(prev);
        onDateChange?.(dates[prev]);
      }
    }
  };

  const goTo = (idx: number) => {
    if (idx >= 0 && idx < dates.length) {
      setCurrentIndex(idx);
      onDateChange?.(dates[idx]);
    }
  };

  // initialDate 또는 날짜 범위가 바뀌면 인덱스 동기화
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  // 현재 선택 날짜를 상위로 전달
  useEffect(() => {
    if (dates[currentIndex]) onDateChange?.(dates[currentIndex]);
  }, [currentIndex, dates, onDateChange]);

  // 지도 번호 매핑 (좌표 있는 일정만 순서대로 1, 2, 3...)
  const mapOrderMap = useMemo(() => {
    const map = new Map<number, number>();
    let order = 1;
    daySchedules.forEach(s => {
      if (s.latitude != null && s.longitude != null && !(s.latitude === 0 && s.longitude === 0)) {
        map.set(s.id, order++);
      }
    });
    return map;
  }, [daySchedules]);

  const currentNote = dayNotes[currentDate];

  return (
    <div
      className="space-y-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Day 네비게이션 */}
      <div className="flex items-center justify-between bg-base-100 rounded-xl px-4 py-3 shadow-sm">
        <button
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="btn btn-ghost btn-sm btn-circle disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        <div className="text-center">
          <div className="font-bold text-lg">Day {currentIndex + 1}</div>
          <div className="text-sm text-base-content/60">{formatShortDate(currentDate)}</div>
        </div>

        <button
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === dates.length - 1}
          className="btn btn-ghost btn-sm btn-circle disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Day 인디케이터 (pill) */}
      <div className="flex justify-center gap-1 flex-wrap">
        {dates.map((d, i) => {
          const count = schedules.filter(s => s.date === d).length;
          const hasNote = !!dayNotes[d];
          const isActive = i === currentIndex;
          return (
            <button
              key={d}
              onClick={() => goTo(i)}
              className={`px-2 py-0.5 rounded-full text-xs font-bold transition-all ${
                isActive
                  ? 'bg-primary text-primary-content shadow-sm'
                  : count > 0
                    ? 'bg-base-300 text-base-content/70 hover:bg-base-content/20'
                    : 'bg-base-200 text-base-content/30 hover:bg-base-300'
              } ${hasNote ? 'ring-1 ring-warning' : ''}`}
              title={`Day ${i + 1} · ${d} · ${count}개 일정${hasNote ? ' + 메모' : ''}`}
            >
              D{i + 1}
            </button>
          );
        })}
      </div>

      {/* 일별 메모 */}
      <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-warning/10 cursor-pointer"
          onClick={() => {
            if (!editingNote) {
              setNoteContent(currentNote?.content || '');
              setEditingNote(true);
            }
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-warning-content/80">
            <StickyNote className="w-4 h-4" />
            오늘의 메모
          </div>
          {!editingNote && !currentNote && (
            <span className="text-xs text-base-content/40">+ 추가</span>
          )}
        </div>

        {editingNote ? (
          <div className="p-3 space-y-2 border-t border-base-200">
            <textarea
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              placeholder="오늘의 메모... (날씨, 컨디션, 꿀팁 등)"
              rows={3}
              className="textarea textarea-bordered w-full text-sm"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <div>
                {currentNote && (
                  <button onClick={deleteDayNote} className="btn btn-ghost btn-xs text-error">삭제</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingNote(false)} className="btn btn-ghost btn-xs">취소</button>
                <button onClick={saveDayNote} disabled={savingNote} className="btn btn-primary btn-xs">
                  {savingNote ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        ) : currentNote?.content ? (
          <div
            className="px-4 py-3 text-sm whitespace-pre-wrap text-base-content/80 border-t border-base-200 cursor-pointer hover:bg-base-200/50"
            onClick={() => { setNoteContent(currentNote.content); setEditingNote(true); }}
          >
            {currentNote.content}
          </div>
        ) : null}
      </div>

      {/* 컴팩트 타임라인 */}
      {daySchedules.length === 0 ? (
        <div className="text-center py-12 text-base-content/40">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm">이 날은 일정이 없어요</p>
        </div>
      ) : (
        <div className="relative">
          {/* 세로 타임라인 라인 */}
          <div className="absolute left-[39px] top-0 bottom-0 w-0.5 bg-primary/20" />

          <div className="space-y-1">
            {daySchedules.map((schedule, idx) => {
              const isFlight = isFlightSchedule(schedule.title as string);
              const prevTime = idx > 0 ? daySchedules[idx - 1].time : null;
              const showTimeGap = schedule.time && prevTime && (() => {
                const [h1, m1] = prevTime.split(':').map(Number);
                const [h2, m2] = schedule.time!.split(':').map(Number);
                return (h2 * 60 + m2) - (h1 * 60 + m1) > 90;
              })();

              return (
                <div key={schedule.id}>
                  {/* 시간 갭 표시 */}
                  {showTimeGap && (
                    <div className="flex items-center gap-2 pl-[30px] py-1">
                      <div className="w-[18px] flex justify-center">
                        <div className="w-1 h-4 bg-primary/10 rounded" />
                      </div>
                    </div>
                  )}

                  <div
                    className={`flex items-start gap-3 px-2 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-base-100 active:bg-base-200 group ${
                      isFlight ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                    }`}
                    onClick={() => onScheduleClick(schedule)}
                    data-schedule-id={schedule.id}
                  >
                    {/* 시간 */}
                    <div className="w-[30px] flex-shrink-0 text-right">
                      {schedule.time ? (
                        <span className="text-xs font-mono font-semibold text-primary">
                          {schedule.time}
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/30">--:--</span>
                      )}
                    </div>

                    {/* 타임라인 도트 */}
                    <div className="flex-shrink-0 mt-1">
                      <div className={`w-3 h-3 rounded-full border-2 ${
                        isFlight
                          ? 'bg-blue-500 border-blue-300'
                          : 'bg-primary border-primary/30'
                      }`} />
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isFlight && <Plane className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                        <span className="font-medium text-sm truncate">{schedule.title}</span>
                      </div>
                      {schedule.place && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {mapOrderMap.has(schedule.id) ? (
                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                              {mapOrderMap.get(schedule.id)}
                            </span>
                          ) : (
                            <MapPin className="w-3 h-3 text-base-content/40 flex-shrink-0" />
                          )}
                          <span className="text-xs text-base-content/50 truncate">{schedule.place}</span>
                        </div>
                      )}
                      {schedule.memo && (
                        <div className="flex items-start gap-1 mt-1">
                          <FileText className="w-3 h-3 text-base-content/30 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-base-content/40 line-clamp-1">{schedule.memo}</span>
                        </div>
                      )}
                    </div>

                    {/* 시간대 이모지 */}
                    <span className="text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {getTimeIcon(schedule.time)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 하단 요약 */}
      <div className="flex items-center justify-center gap-4 text-xs text-base-content/40 py-2">
        <span>📍 {daySchedules.filter(s => s.place).length}곳</span>
        <span>📋 {daySchedules.length}개 일정</span>
        {daySchedules[0]?.time && daySchedules[daySchedules.length - 1]?.time && (
          <span>⏱ {daySchedules[0].time} ~ {daySchedules[daySchedules.length - 1].time}</span>
        )}
      </div>
    </div>
  );
}
