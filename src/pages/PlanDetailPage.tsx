import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { plansAPI as rawPlansAPI, schedulesAPI as rawSchedulesAPI } from '../lib/api';
import { offlinePlansAPI, offlineSchedulesAPI, offlineMomentsAPI } from '../lib/offlineAPI';

const plansAPI = localStorage.getItem('offline_mode') === 'true' ? offlinePlansAPI : rawPlansAPI;
const schedulesAPI = localStorage.getItem('offline_mode') === 'true' ? offlineSchedulesAPI : rawSchedulesAPI;
import { formatDateRange, getDaysDifference, formatDate, formatDisplayDate, parseDateLocal } from '../lib/utils';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScheduleCard } from '../components/ScheduleCard';
import { Loading } from '../components/Loading';
import { TravelMap, schedulesToMapPoints } from '../components/TravelMap'; // ?�행 ?�선 지??
import { TravelAssistantChat } from '../components/TravelAssistantChat'; // Import the new component
import { TravelProgressBar } from '../components/TravelProgressBar';
// ReviewSection removed ??merged into MomentSection
import MomentSection from '../components/MomentSection'; // Album - ?�간 기록
import { PlaceAutocomplete } from '../components/PlaceAutocomplete';
import TripNotes from '../components/TripNotes'; // Import TripNotes
import CalendarView from '../components/CalendarView';
import DayView from '../components/DayView';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import { downloadICS } from '../lib/ics';
import MemberAvatars from '../components/MemberAvatars';
import ForkButton from '../components/ForkButton';
import GoogleLoginButton from '../components/GoogleLoginButton';
import GuestLoginButton from '../components/GuestLoginButton';
import { TravelMemoList } from '../components/travel/TravelMemoList';
import BulkMomentImporter from '../components/BulkMomentImporter';
import type { Schedule, Plan, Comment } from '../store/types';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import useBrowserNotifications from '../hooks/useBrowserNotifications'; // Import the new hook
import { MapPin, Calendar, Cloud, Map, Plane, Clock, FileText, Sparkles, AlertCircle, Search } from 'lucide-react';
import ConflictBanner from '../components/ConflictBanner';
import ConflictResolver from '../components/ConflictResolver';
import type { OpLogEntry } from '../lib/offline/types';
import AutoTranslate from '../components/AutoTranslate';

type ViewMode = 'vertical' | 'horizontal' | 'calendar' | 'daily';
type MainTab = 'schedule' | 'notes' | 'album';

// AI 처리 �?롤링 ??
const AI_TIP_KEYS = [
  'planDetail.aiTips.0',
  'planDetail.aiTips.1',
  'planDetail.aiTips.2',
  'planDetail.aiTips.3',
  'planDetail.aiTips.4',
  'planDetail.aiTips.5',
  'planDetail.aiTips.6',
];

function AIProcessingTip() {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => { setIdx(i => (i + 1) % AI_TIP_KEYS.length); setFade(true); }, 300);
    }, 3000);
    return () => clearInterval(iv);
  }, []);
  return (
    <p className={`text-xs text-base-content/60 text-center mt-2 transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
      {t(AI_TIP_KEYS[idx])}
    </p>
  );
}

interface PlanUIState {
  mapOpen: boolean;
  mainTab: MainTab;
  viewMode: ViewMode;
  scrollX: number;
  focusedDate: string | null;
}

const DEFAULT_PLAN_UI_STATE: PlanUIState = {
  mapOpen: true,
  mainTab: 'schedule',
  viewMode: 'horizontal',
  scrollX: 0,
  focusedDate: null,
};

function readPlanUIState(planId?: string): PlanUIState {
  if (!planId) return DEFAULT_PLAN_UI_STATE;

  try {
    const saved = localStorage.getItem(`plan-ui-${planId}`);
    if (!saved) return DEFAULT_PLAN_UI_STATE;

    const parsed = JSON.parse(saved);
    return {
      mapOpen: typeof parsed?.mapOpen === 'boolean' ? parsed.mapOpen : DEFAULT_PLAN_UI_STATE.mapOpen,
      mainTab: ['schedule', 'notes', 'album'].includes(parsed?.mainTab) ? parsed.mainTab : DEFAULT_PLAN_UI_STATE.mainTab,
      viewMode: ['vertical', 'horizontal', 'calendar', 'daily'].includes(parsed?.viewMode) ? parsed.viewMode : DEFAULT_PLAN_UI_STATE.viewMode,
      scrollX: typeof parsed?.scrollX === 'number' ? parsed.scrollX : DEFAULT_PLAN_UI_STATE.scrollX,
      focusedDate: typeof parsed?.focusedDate === 'string' ? parsed.focusedDate : null,
    } as PlanUIState;
  } catch {
    return DEFAULT_PLAN_UI_STATE;
  }
}

// Helper function to sort schedules by date, then order_index, then time
function sortSchedulesByDateTime(schedules: Schedule[]): Schedule[] {
  return [...schedules].sort((a, b) => {
    // First sort by date
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    // Then by order_index (if both have it)
    const oa = a.order_index ?? 999;
    const ob = b.order_index ?? 999;
    if (oa !== ob) return oa - ob;
    // Then sort by time (schedules without time go last)
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

// Helper function to detect and linkify flight numbers
function linkifyFlightNumbers(text: string): (string | JSX.Element)[] {
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
        title={`${flightCode} flight info`}
      >
        <Plane className="w-4 h-4 inline" /> {flightCode}
      </a>
    );

    lastIndex = matchIndex + flightCode.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// Helper function to convert URLs and flight numbers in text to clickable links
function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={`url-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="link link-primary hover:link-hover"
        >
          {part}
        </a>
      );
    }
    // Also linkify flight numbers in non-URL parts
    return <span key={`text-${index}`}>{linkifyFlightNumbers(part)}</span>;
  });
}

export function PlanDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, selectedPlan, setSelectedPlan, schedules, setSchedules } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  // const [mapLoadError, setMapLoadError] = useState(false); // 지??기능 ?�시 비활?�화

  const [error, setError] = useState<string | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<Schedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [pendingScrollIds, setPendingScrollIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(() => readPlanUIState(id).viewMode);
  const [mapOpen, setMapOpen] = useState<boolean>(() => readPlanUIState(id).mapOpen);
  const [timelineScrollX, setTimelineScrollX] = useState<number>(() => readPlanUIState(id).scrollX);
  const [mapExcludeCountries, setMapExcludeCountries] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`map-exclude-${id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [mainTab, setMainTab] = useState<MainTab>(() => readPlanUIState(id).mainTab);
  const [focusedDate, setFocusedDate] = useState<string | null>(() => readPlanUIState(id).focusedDate);
  const [geocodeFailed, setGeocodeFailed] = useState<any[]>([]);
  const [geocodeFailedCollapsed, setGeocodeFailedCollapsed] = useState(() => {
    try { return localStorage.getItem('geocodeFailed_collapsed') === 'true'; } catch { return false; }
  });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; city?: string } | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [albumFocusScheduleId, setAlbumFocusScheduleId] = useState<number | null>(null);
  const [albumHideNoPhoto, setAlbumHideNoPhoto] = useState<boolean>(() => {
    try { return localStorage.getItem(`plan-album-hide-no-photo-${id}`) === 'true'; } catch { return false; }
  });
  const [albumHideNoText, setAlbumHideNoText] = useState<boolean>(() => {
    try { return localStorage.getItem(`plan-album-hide-no-text-${id}`) === 'true'; } catch { return false; }
  });
  const [albumStats, setAlbumStats] = useState<Record<number, { hasPhoto: boolean; hasText: boolean }>>({});
  const [conflictOps, setConflictOps] = useState<OpLogEntry[]>([]);
  const [showConflictResolver, setShowConflictResolver] = useState(false);
  const viewModalRef = useRef<HTMLDialogElement>(null);
  const editModalRef = useRef<HTMLDialogElement>(null);
  const planEditModalRef = useRef<HTMLDialogElement>(null);
  const chatbotModalRef = useRef<HTMLDialogElement>(null);
  const horizontalTimelineRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragScrollLeftRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = horizontalTimelineRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.pageX - el.offsetLeft;
    dragScrollLeftRef.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const el = horizontalTimelineRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    el.scrollLeft = dragScrollLeftRef.current - (x - dragStartXRef.current);
  };
  const handleMouseUp = () => {
    isDraggingRef.current = false;
    const el = horizontalTimelineRef.current;
    if (el) {
      el.style.cursor = 'grab';
      el.style.userSelect = '';
    }
  };

  const { requestPermission, showNotification } = useBrowserNotifications(); // Use the notification hook
  const notifiedSchedules = useRef<Set<number>>(new Set()); // To track notified schedules

  useEffect(() => {
    requestPermission(); // Request notification permission on component mount

    // Get user location for weather
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          // Try to get city name using reverse geocoding
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ko`
            );
            const data = await response.json();
            const city = data.address?.city || data.address?.town || data.address?.county || data.address?.state;

            setUserLocation({ lat: latitude, lng: longitude, city });
          } catch (error) {
            console.error('Failed to get city name:', error);
            setUserLocation({ lat: latitude, lng: longitude });
          }
        },
        (error) => {
          // Silently ignore - location is optional (weather feature)
          console.debug('Geolocation unavailable:', error.code, error.message);
        },
        { timeout: 5000 }
      );
    }
  }, []);

  // Removed textToScheduleInput and isTextToScheduleLoading as functionality moved to modal
  // const [textToScheduleInput, setTextToScheduleInput] = useState('');
  // const [isTextToScheduleLoading, setIsTextToScheduleLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadPlanDetail(parseInt(id));
    }
  }, [id]);

  useEffect(() => {
    const uiState = readPlanUIState(id);
    setMapOpen(uiState.mapOpen);
    setMainTab(uiState.mainTab);
    setViewMode(uiState.viewMode);
    setTimelineScrollX(uiState.scrollX);
    setFocusedDate(uiState.focusedDate);
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const uiState: PlanUIState = {
      mapOpen,
      mainTab,
      viewMode,
      scrollX: timelineScrollX,
      focusedDate,
    };

    localStorage.setItem(`plan-ui-${id}`, JSON.stringify(uiState));
  }, [id, mapOpen, mainTab, viewMode, timelineScrollX, focusedDate]);

  useEffect(() => {
    if (!id) return;
    localStorage.setItem(`plan-album-hide-no-photo-${id}`, String(albumHideNoPhoto));
    localStorage.setItem(`plan-album-hide-no-text-${id}`, String(albumHideNoText));
  }, [id, albumHideNoPhoto, albumHideNoText]);

  useEffect(() => {
    const run = async () => {
      if (mainTab !== 'album' || schedules.length === 0) return;
      const entries = await Promise.all(
        schedules.map(async (s) => {
          const mres = await offlineMomentsAPI.getByScheduleId(s.id);
          const ms = mres.moments || [];
          const hasPhoto = ms.some((m: any) => !!m.photo_data);
          const hasText = ms.some((m: any) => !!(m.note || '').trim());
          return [s.id, { hasPhoto, hasText }] as const;
        })
      );
      setAlbumStats(Object.fromEntries(entries));
    };
    run();
  }, [mainTab, schedules]);

  useEffect(() => {
    if (!albumFocusScheduleId || mainTab !== 'album') return;
    const t = setTimeout(() => {
      const el = document.getElementById(`album-schedule-${albumFocusScheduleId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setAlbumFocusScheduleId(null);
    }, 250);
    return () => clearTimeout(t);
  }, [albumFocusScheduleId, mainTab, schedules]);

  useEffect(() => {
    if (mainTab !== 'schedule' || viewMode !== 'horizontal') return;

    const raf = requestAnimationFrame(() => {
      if (horizontalTimelineRef.current) {
        horizontalTimelineRef.current.scrollLeft = timelineScrollX;
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [id, mainTab, viewMode, timelineScrollX, schedules.length]);

  useEffect(() => {
    return () => {
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (viewingSchedule && viewModalRef.current) {
      viewModalRef.current.showModal();
    }
  }, [viewingSchedule]);

  useEffect(() => {
    if (editingSchedule && editModalRef.current) {
      editModalRef.current.showModal();
    }
  }, [editingSchedule]);

  useEffect(() => {
    if (editingPlan && planEditModalRef.current) {
      planEditModalRef.current.showModal();
    }
  }, [editingPlan]);

  useEffect(() => {
    if (showChatbot && chatbotModalRef.current) {
      chatbotModalRef.current.showModal();
    } else if (!showChatbot && chatbotModalRef.current) {
      chatbotModalRef.current.close();
      
      // When chat closes, scroll to and highlight modified schedules
      if (pendingScrollIds.length > 0) {
        setTimeout(() => {
          const firstId = pendingScrollIds[0];
          const element = document.querySelector(`[data-schedule-id="${firstId}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add highlight animation
            element.classList.add('schedule-highlight');
            setTimeout(() => {
              element.classList.remove('schedule-highlight');
            }, 2000);
          }
          setPendingScrollIds([]);
        }, 300); // Wait for modal close animation
      }
    }
  }, [showChatbot, pendingScrollIds]);

  useEffect(() => {
    if (!selectedPlan || schedules.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      schedules.forEach(schedule => {
        if (schedule.date && schedule.time && !notifiedSchedules.current.has(schedule.id)) {
          const [year, month, day] = schedule.date.split('-').map(Number);
          const [hours, minutes] = schedule.time.split(':').map(Number);
          const scheduleDateTime = new Date(year, month - 1, day, hours, minutes);

          const timeDiff = scheduleDateTime.getTime() - now.getTime(); // Difference in milliseconds
          const minutesDiff = Math.round(timeDiff / (1000 * 60));

          // Notify if schedule is within 10 minutes and in the future
          if (minutesDiff > 0 && minutesDiff <= 10) {
            const scheduleTitle = schedule.title || t('planDetail.defaultSchedule');
            const schedulePlace = schedule.place || '';

            showNotification(t('planDetail.upcomingScheduleTitle', { title: scheduleTitle }), {
              body: t('planDetail.upcomingScheduleBody', { minutes: minutesDiff, place: schedulePlace }),
              icon: '/favicon.ico', // Optional: add an icon
              onClick: () => navigate(`/plan/${selectedPlan.id}`),
            });
            notifiedSchedules.current.add(schedule.id); // Mark as notified
          }
        }
      });
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval); // Clean up interval on unmount
  }, [selectedPlan, schedules, showNotification, navigate]);

  const loadPlanDetail = async (planId: number, soft = false) => {
    try {
      if (!soft) setIsLoading(true);
      setError(null);
      const data = await plansAPI.getById(planId);
      setSelectedPlan(data.plan);
      setSchedules(sortSchedulesByDateTime(data.schedules));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('planDetail.errors.loadFailed'));
      console.error('Failed to load plan detail:', err);
    } finally {
      if (!soft) setIsLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    try {
      await schedulesAPI.delete(scheduleId);
      const remainingSchedules = schedules.filter((s) => s.id !== scheduleId);
      setSchedules(sortSchedulesByDateTime(remainingSchedules));

      // Update plan dates based on remaining schedules
      if (remainingSchedules.length > 0 && selectedPlan) {
        const dates = remainingSchedules.map(s => parseDateLocal(s.date));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

        const newStartDate = formatDate(minDate);
        const newEndDate = formatDate(maxDate);

        // Only update if dates have changed
        if (newStartDate !== selectedPlan.start_date || newEndDate !== selectedPlan.end_date) {
          try {
            const updatedPlan = await plansAPI.update(selectedPlan.id, {
              start_date: newStartDate,
              end_date: newEndDate,
            });
            setSelectedPlan(updatedPlan);
          } catch (error) {
            console.error('Failed to update plan dates:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      alert(t('planDetail.errors.deleteScheduleFailed'));
    }
  };

  const handleDeletePlan = async () => {
    if (!selectedPlan) return;

    if (!confirm(t('planDetail.confirmDeletePlan'))) {
      return;
    }

    try {
      
      await plansAPI.delete(selectedPlan.id);
      navigate('/my');
    } catch (error) {
      console.error('Failed to delete plan:', error);
      alert(t('planDetail.errors.deletePlanFailed'));
      
    }
  };

  // Removed handleTextToSchedule as functionality moved to modal
  // const handleTextToSchedule = async () => {
  //   if (!textToScheduleInput.trim() || !selectedPlan) return;

  //   setIsTextToScheduleLoading(true);
  //   try {
  //     const userLang = navigator.language.split('-')[0]; // e.g., "ko"
  //     const destLang = selectedPlan.region === 'Taiwan' ? 'zh' : 'en'; // Simple inference, can be improved

  //     const response = await fetch('/api/schedules/from-text', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         text: textToScheduleInput,
  //         planId: selectedPlan.id,
  //         userLang,
  //         destLang,
  //         planTitle: selectedPlan.title,
  //         planRegion: selectedPlan.region,
  //         planStartDate: selectedPlan.start_date,
  //         planEndDate: selectedPlan.end_date,
  //       }),
  //     });

  //     if (!response.ok) {
  //       throw new Error('Failed to create schedule from text');
  //     }

  //     const newSchedule = (await response.json()) as Schedule;
  //     // The API returns multi-language titles and places, need to convert to string
  //     // For now, I'll use the user's language, but this should be handled more robustly
  //     newSchedule.title = (newSchedule.title as any)[userLang] || (newSchedule.title as any)['en'] || newSchedule.title;
  //     newSchedule.place = (newSchedule.place as any)[userLang] || (newSchedule.place as any)['en'] || newSchedule.place;

  //     await schedulesAPI.create({
  //       ...newSchedule,
  //       time: newSchedule.time === null ? undefined : newSchedule.time,
  //       memo: newSchedule.memo === null ? undefined : newSchedule.memo,
  //       plan_b: newSchedule.plan_b === null ? undefined : newSchedule.plan_b,
  //       plan_c: newSchedule.plan_c === null ? undefined : newSchedule.plan_c,
  //     }); // Persist to database
  //     setSchedules([...schedules, newSchedule]); // Update local state
  //     setTextToScheduleInput('');

  //   } catch (error) {
  //     console.error('Failed to create schedule from text:', error);
  //     alert('?�스?�로 ?�정 ?�성???�패?�습?�다.');
  //   } finally {
  //     setIsTextToScheduleLoading(false);
  //   }
  // };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination } = result;

    if (!destination) {
      return;
    }

    // Find the dragged schedule
    let draggedSchedule: Schedule | undefined;

    if (source.droppableId === 'schedules') {
      // Vertical view - all schedules in one list
      draggedSchedule = schedules[source.index];
    } else {
      // Horizontal view - schedules grouped by date
      const sourceSchedules = schedules.filter(s => s.date === source.droppableId);
      draggedSchedule = sourceSchedules[source.index];
    }

    if (!draggedSchedule) return;

    // If moving to a different date, confirm first
    if (source.droppableId !== destination.droppableId) {
      const newDate = destination.droppableId;
      const formatKo = (d: string) => {
        const dt = new Date(d + 'T00:00:00');
        return t('planDetail.dateShort', { month: dt.getMonth() + 1, day: dt.getDate() });
      };
      const confirmed = window.confirm(
        t('planDetail.confirmMoveSchedule', {
          title: draggedSchedule.title,
          from: formatKo(draggedSchedule.date),
          to: formatKo(newDate),
        })
      );
      if (!confirmed) return;

      try {
        await schedulesAPI.update(draggedSchedule.id, { date: newDate });

        const updatedSchedules = schedules.map(s =>
          s.id === draggedSchedule.id ? { ...s, date: newDate } : s
        );

        setSchedules(sortSchedulesByDateTime(updatedSchedules));
      } catch (error) {
        console.error('Failed to update schedule date:', error);
        alert(t('planDetail.errors.moveScheduleFailed'));
      }
    } else {
      // Same date - just reorder and sort
      setSchedules(sortSchedulesByDateTime(schedules));
    }
  };



  // 지??기능 ?�시 비활?�화
  // const schedulePlaces = useMemo(() => {
  //   return schedules.map((s) => s.place)
  //     .filter((p): p is string => !!p);
  // }, [schedules]);

  const groupedSchedules = useMemo(() => {
    return schedules.reduce((acc, schedule) => {
      const date = schedule.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(schedule);
      return acc;
    }, {} as Record<string, Schedule[]>);
  }, [schedules]);

  const albumGroupedSchedules = useMemo(() => {
    const filtered = schedules.filter((s) => {
      const st = albumStats[s.id];
      if (albumHideNoPhoto && st && !st.hasPhoto) return false;
      if (albumHideNoText && st && !st.hasText) return false;
      return true;
    });
    return filtered.reduce((acc, schedule) => {
      const date = schedule.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(schedule);
      return acc;
    }, {} as Record<string, Schedule[]>);
  }, [schedules, albumStats, albumHideNoPhoto, albumHideNoText]);

  const handleHorizontalTimelineScroll = () => {
    if (!horizontalTimelineRef.current) return;

    const nextScrollX = horizontalTimelineRef.current.scrollLeft;

    if (scrollSaveTimeoutRef.current) {
      clearTimeout(scrollSaveTimeoutRef.current);
    }

    scrollSaveTimeoutRef.current = setTimeout(() => {
      setTimelineScrollX(nextScrollX);
    }, 200);
  };

  // cleanup assistant removed - AI memo update handles this now

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-200">
        <Loading />
      </div>
    );
  }

  if (error || !selectedPlan) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="alert alert-error max-w-md">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{error || t('planDetail.notFound')}</span>
          </div>
          <div className="flex-none">
            <Button variant="ghost" onClick={() => navigate(-1)}>{t('planDetail.back')}</Button>
          </div>
        </div>
      </div>
    );
  }

  const days = getDaysDifference(selectedPlan.start_date, selectedPlan.end_date);
  const isOwner = currentUser?.id === selectedPlan.user_id;
  const isLoggedIn = !!currentUser;
  const canEditPlan = isOwner;
  const canUseAssistant = !!currentUser && (isOwner || selectedPlan.visibility !== 'private');

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/album/${selectedPlan.id}`);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    } catch (error) {
      console.error('공유 링크 복사 ?�패:', error);
      alert(t('planDetail.errors.copyLinkFailed'));
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const cred = localStorage.getItem('X-Auth-Credential') || localStorage.getItem('google_credential') || '';
        if (cred) headers['X-Auth-Credential'] = cred;
      } catch {}
      const res = await fetch(`/api/plans/${selectedPlan.id}/invite`, { method: 'POST', headers });
      const data = await res.json();
      if (data.invite_code) {
        const link = `${window.location.origin}/invite/${data.invite_code}`;
        await navigator.clipboard.writeText(link);
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 2000);
      } else {
        alert(data.error || t('planDetail.errors.createInviteFailed'));
      }
    } catch {
      alert(t('planDetail.errors.createInviteFailed'));
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      
      {/* Conflict Banner */}
      <div className="container mx-auto px-3 sm:px-4 pt-2">
        <ConflictBanner
          planId={Number(id)}
          onResolve={(ops) => { setConflictOps(ops); setShowConflictResolver(true); }}
        />
      </div>

      {/* Conflict Resolver Modal */}
      {showConflictResolver && conflictOps.length > 0 && (
        <ConflictResolver
          conflicts={conflictOps}
          onClose={() => setShowConflictResolver(false)}
          onResolved={() => {
            setConflictOps([]);
            // Refresh page data
            window.location.reload();
          }}
        />
      )}

      {/* Header */}
      <header className="bg-base-100 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
          {/* 1�? ?�목 + 공개?��? + ... ?�정 */}
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold truncate flex-1 min-w-0"><AutoTranslate text={selectedPlan.title} /></h1>
            {localStorage.getItem('offline_mode') === 'true' && (
              <span className="badge badge-warning badge-xs font-bold flex-shrink-0 cursor-pointer" onClick={() => navigate('/profile')}>{t('planDetail.offlineBadge')}</span>
            )}
            {isOwner ? (
              <div className="dropdown dropdown-end flex-shrink-0">
                <label tabIndex={0} className="btn btn-xs btn-ghost gap-0.5 px-1.5 h-6 min-h-0">
                  <span className="text-xs font-medium">{
                    (selectedPlan.visibility || (selectedPlan.is_public ? 'public' : 'private')) === 'private' ? t('planDetail.visibility.private') :
                    (selectedPlan.visibility || (selectedPlan.is_public ? 'public' : 'private')) === 'shared' ? t('planDetail.visibility.shared') : t('planDetail.visibility.public')
                  }</span>
                  <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </label>
                <ul tabIndex={0} className="dropdown-content menu menu-sm p-1 shadow-lg bg-base-100 rounded-lg w-32 z-50 border border-base-200">
                  {([
                    { value: 'private', label: t('planDetail.visibility.private'), desc: t('planDetail.visibilityDesc.private') },
                    { value: 'shared', label: t('planDetail.visibility.shared'), desc: t('planDetail.visibilityDesc.shared') },
                    { value: 'public', label: t('planDetail.visibility.public'), desc: t('planDetail.visibilityDesc.public') },
                  ] as const).map(opt => (
                    <li key={opt.value}>
                      <a
                        className={`text-xs py-1.5 ${(selectedPlan.visibility || (selectedPlan.is_public ? 'public' : 'private')) === opt.value ? 'active' : ''}`}
                        onClick={async () => {
                          try {
                            await plansAPI.update(selectedPlan.id, { visibility: opt.value });
                            setSelectedPlan({ ...selectedPlan, visibility: opt.value });
                            (document.activeElement as HTMLElement)?.blur();
                          } catch (err) {
                            console.error('Failed to update visibility:', err);
                          }
                        }}
                      >
                        {opt.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <span className="text-xs font-medium flex-shrink-0">
                {(selectedPlan.visibility || (selectedPlan.is_public ? 'public' : 'private')) === 'private' ? t('planDetail.visibility.private') :
                 (selectedPlan.visibility || (selectedPlan.is_public ? 'public' : 'private')) === 'shared' ? t('planDetail.visibility.shared') : t('planDetail.visibility.public')}
              </span>
            )}
            {isOwner && (
              <div className="dropdown dropdown-end flex-shrink-0">
                <label tabIndex={0} className="btn btn-ghost btn-xs btn-circle" title={t('planDetail.settings')}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                  </svg>
                </label>
                <ul tabIndex={0} className="dropdown-content z-50 menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-200">
                  <li><a onClick={() => { setEditingPlan(true); (document.activeElement as HTMLElement)?.blur(); }}>{t('planDetail.tripSettings')}</a></li>
                  {selectedPlan.visibility !== 'private' && (
                    <li><a onClick={() => { handleCopyInviteLink(); (document.activeElement as HTMLElement)?.blur(); }}>{t('planDetail.copyInviteLink')}</a></li>
                  )}
                  <li><a onClick={() => { downloadICS(selectedPlan.title, schedules); (document.activeElement as HTMLElement)?.blur(); }}>{t('planDetail.exportCalendar')}</a></li>
                </ul>
              </div>
            )}
          </div>

          {/* 2�? 메�??�보 + 멤버 + ?�로가�?*/}
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-base-content/70 flex-wrap flex-1 min-w-0">
              {selectedPlan.region && (
                <span className="whitespace-nowrap flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {selectedPlan.region}</span>
              )}
              {(userLocation?.city || selectedPlan.region) && (
                <a
                  href={`https://www.google.com/search?q=weather+${encodeURIComponent(userLocation?.city || selectedPlan.region || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap hover:text-primary transition-colors flex items-center gap-0.5"
                >
                  <Cloud className="w-3 h-3" /> <span className="hidden xs:inline">{userLocation?.city ? t('planDetail.currentWeather') : t('planDetail.weather')}</span>
                </a>
              )}
              <span className="whitespace-nowrap flex items-center gap-0.5"><Calendar className="w-3 h-3" /> {formatDateRange(selectedPlan.start_date, selectedPlan.end_date)}</span>
              <span className="font-medium whitespace-nowrap">{t('planDetail.days', { days })}</span>
              <div className="ml-1">
                <MemberAvatars planId={selectedPlan.id} isOwner={isOwner} />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="btn-circle btn-xs flex-shrink-0"
              title={t('planDetail.back')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-4 pb-32">

        {!isOwner && !isLoggedIn && (
          <div className="alert alert-info mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
              <span>{t('planDetail.loginImportPrompt')}</span>
              <div className="flex gap-2">
                <GoogleLoginButton onSuccess={() => window.location.reload()} />
                <GuestLoginButton onSuccess={() => window.location.reload()} />
              </div>
            </div>
          </div>
        )}

        {!isOwner && isLoggedIn && (
          <div className="alert alert-success mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
              <span>{t('planDetail.importPrompt')}</span>
              <ForkButton
                planId={selectedPlan.id}
                onForked={(newPlan) => navigate(`/plans/${newPlan.id}`)}
              />
            </div>
          </div>
        )}

        {/* ?�행 ?�선 지??(좌표가 ?�는 ?�정???�을 ?�만 ?�시) */}
        {(() => {
          // �??�??�???집계
          const countryCounts: Record<string, number> = {};
          schedules.forEach(s => {
            if (s.latitude && s.longitude && s.country_code) {
              countryCounts[s.country_code] = (countryCounts[s.country_code] || 0) + 1;
            }
          });
          const countries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
          // 가??많�? �??가 주요 ?�행지, ?�머지??기본 ?��? ?�보
          const _mainCountry = countries[0]?.[0]; void _mainCountry;
          const filteredForMap = focusedDate 
            ? schedules.filter(s => s.date === focusedDate)
            : schedules;
          const mapPoints = schedulesToMapPoints(filteredForMap, 
            mapExcludeCountries.length > 0 ? mapExcludeCountries : undefined
          );
          if (schedulesToMapPoints(schedules).length > 0) {
            return (
              <div className="mb-4">
                <div className="collapse collapse-arrow bg-base-100 shadow-sm rounded-lg">
                  <input type="checkbox" checked={mapOpen} onChange={(e) => setMapOpen(e.target.checked)} />
                  <div className="collapse-title text-sm font-medium flex items-center gap-2 min-h-0 py-2">
                    <Map className="w-4 h-4" /> {t('planDetail.route')}
                    <span className="badge badge-primary badge-xs">{t('planDetail.placesCount', { count: mapPoints.length })}</span>
                    {focusedDate && (
                      <button
                        className="badge badge-warning badge-sm gap-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setFocusedDate(null); }}
                        title={t('planDetail.showAll')}
                      >
                        Day {getDaysDifference(selectedPlan.start_date, focusedDate) + 1} ??
                      </button>
                    )}
                  </div>
                  <div className="collapse-content">
                    {/* �?? ?�터 (2개국 ?�상???�만 ?�시) */}
                    {countries.length > 1 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {countries.map(([code, count]) => {
                          const excluded = mapExcludeCountries.includes(code);
                          return (
                            <button
                              key={code}
                              onClick={() => {
                                setMapExcludeCountries(prev => {
                                  const next = excluded ? prev.filter(c => c !== code) : [...prev, code];
                                  localStorage.setItem(`map-exclude-${id}`, JSON.stringify(next));
                                  return next;
                                });
                              }}
                              className={`btn btn-xs ${excluded ? 'btn-ghost opacity-50 line-through' : 'btn-outline btn-primary'}`}
                            >
                              {code} ({count})
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <TravelMap 
                      points={mapPoints} 
                      showRoute={true}
                      height={window.innerWidth < 640 ? '200px' : '300px'}
                      className="mt-2"
                    />
                    {/* 좌표 ?�태 + 보정 UI */}
                    {canEditPlan && (() => {
                      const withCoords = schedules.filter(s => s.latitude && s.longitude).length;
                      const missingCoords = schedules.filter(s => s.place && s.place.trim() && (!s.latitude || !s.longitude));

                      return (
                        <div className="mt-3 space-y-2">
                          {/* 좌표 ?�태 ?�약 */}
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-base-content/60 flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {t('planDetail.coordsSummary', { withCoords, total: schedules.length })}
                              {missingCoords.length > 0 && (
                                <span className="text-warning">{t('planDetail.coordsMissing', { count: missingCoords.length })}</span>
                              )}
                            </p>
                            <button
                              onClick={async () => {
                                const btn = document.activeElement as HTMLButtonElement;
                                if (btn) { btn.disabled = true; btn.textContent = t('planDetail.geocodeProcessing'); }
                                try {
                                  // 1?�계: AI?�게 ?�소�??�문 번역 + 보정 ?�청
                                  const schedulesWithPlace = schedules.filter(s => s.place && s.place.trim());
                                  const places = schedulesWithPlace.map(s => ({ id: s.id, place: s.place, place_en: (s as any).place_en }));
                                  
                                  // OpenAI�??�소�?검�?+ ?�문 변??
                                  const aiRes = await fetch('/api/assistant/verify-places', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ places, region: selectedPlan.region }),
                                  });
                                  
                                  if (aiRes.ok) {
                                    const aiData = await aiRes.json() as any;
                                    // AI가 ?�정??place_en ?�데?�트
                                    if (aiData.corrections?.length > 0) {
                                      for (const c of aiData.corrections) {
                                        await fetch(`/api/schedules/${c.id}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ place_en: c.place_en }),
                                        });
                                      }
                                    }
                                  }
                                  
                                  // 2?�계: ?�체 좌표 보정 ?�행
                                  const res = await fetch(`/api/plans/${selectedPlan.id}/geocode-schedules`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ mode: 'all' }),
                                  });
                                  const data = await res.json() as any;
                                  // ?��?�?리로??
                                  try {
                                    const freshData = await plansAPI.getById(selectedPlan.id);
                                    setSchedules(sortSchedulesByDateTime(freshData.schedules));
                                  } catch {}
                                  const failedItems = (data.results || []).filter((r: any) => r.status === 'not_found');
                                  setGeocodeFailed(failedItems);
                                  alert(t('planDetail.geocodeDone', { updated: data.updated || 0, failed: failedItems.length }));
                                } catch {
                                  alert(t('planDetail.errors.geocodeFailed'));
                                }
                                if (btn) { btn.disabled = false; btn.textContent = t('planDetail.geocodeButton'); }
                              }}
                              className="btn btn-xs btn-primary"
                            >
                              {t('planDetail.geocodeButton')}
                            </button>
                          </div>

                          {/* 보정 ?�내 메시지 */}
                          {missingCoords.length > 0 && geocodeFailed.length === 0 && (
                            <div className="alert alert-warning py-2 text-sm">
                              <span>{t('planDetail.missingCoordsNotice', { count: missingCoords.length })}</span>
                            </div>
                          )}

                          {/* 보정 결과: 미보???�소 ?�정 UI */}
                          {geocodeFailed.length > 0 && (
                            <div className="bg-base-200 rounded-lg p-3 space-y-2">
                              <button onClick={() => {
                                const next = !geocodeFailedCollapsed;
                                setGeocodeFailedCollapsed(next);
                                try { localStorage.setItem('geocodeFailed_collapsed', String(next)); } catch {}
                              }} className="flex items-center gap-2 w-full text-left">
                                <span className={`transition-transform ${geocodeFailedCollapsed ? '' : 'rotate-90'}`}>?</span>
                                <span className="text-sm font-medium text-warning flex-1">
                                  {t('planDetail.geocodeNotFoundCount', { count: geocodeFailed.length })}
                                </span>
                              </button>
                              {!geocodeFailedCollapsed && <p className="text-xs text-base-content/60 ml-5">{t('planDetail.editPlaceRetry')}</p>}
                              {!geocodeFailedCollapsed && geocodeFailed.map((item: any) => (
                                <div key={item.id} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    defaultValue={item.place}
                                    className="input input-sm input-bordered flex-1"
                                    onKeyDown={async (e) => {
                                      if (e.key !== 'Enter') return;
                                      const input = e.currentTarget;
                                      const newPlace = input.value.trim();
                                      if (!newPlace) return;
                                      input.disabled = true;
                                      try {
                                        // ?�소�??�데?�트
                                        await fetch(`/api/schedules/${item.id}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ place: newPlace }),
                                        });
                                        // ?�당 ?�정�??��???
                                        const res = await fetch(`/api/plans/${selectedPlan!.id}/geocode-schedules`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ mode: 'missing' }),
                                        });
                                        const data = await res.json();
                                        const stillFailed = (data.results || []).filter((r: any) => r.status === 'not_found');
                                        setGeocodeFailed(stillFailed);
                                        try {
                                          const freshData = await plansAPI.getById(selectedPlan!.id);
                                          setSchedules(sortSchedulesByDateTime(freshData.schedules));
                                        } catch {}
                                      } catch {
                                        alert(t('planDetail.errors.updateFailed'));
                                      } finally {
                                        input.disabled = false;
                                      }
                                    }}
                                    placeholder={t('planDetail.placeCityPlaceholder')}
                                  />
                                  <span className="text-xs text-base-content/40">{t('planDetail.enterToSearch')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          }
          // 좌표 ?�어??보정 UI???�시
          const missingAll = schedules.filter(s => s.place && s.place.trim() && (!s.latitude || !s.longitude));
          if (canEditPlan && missingAll.length > 0) {
            return (
              <div className="mb-8 p-4 bg-base-100 shadow-lg rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-5 h-5 text-warning" />
                  <span className="font-medium">{t('planDetail.noMapCoordsTitle')}</span>
                </div>
                <p className="text-sm text-base-content/60 mb-3">
                  {t('planDetail.noMapCoordsDesc', { count: missingAll.length })}
                </p>
                <button
                  onClick={async () => {
                    const btn = document.activeElement as HTMLButtonElement;
                    if (btn) { btn.disabled = true; btn.textContent = t('planDetail.geocodeProcessing'); }
                    try {
                      // AI ?�소�?검�?+ ?�문 변??
                      const schedulesWithPlace = schedules.filter(s => s.place && s.place.trim());
                      const places = schedulesWithPlace.map(s => ({ id: s.id, place: s.place, place_en: (s as any).place_en }));
                      const aiRes = await fetch('/api/assistant/verify-places', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ places, region: selectedPlan!.region }),
                      });
                      if (aiRes.ok) {
                        const aiData = await aiRes.json() as any;
                        if (aiData.corrections?.length > 0) {
                          for (const c of aiData.corrections) {
                            await fetch(`/api/schedules/${c.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ place_en: c.place_en }),
                            });
                          }
                        }
                      }
                      // 좌표 보정
                      const res = await fetch(`/api/plans/${selectedPlan!.id}/geocode-schedules`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: 'all' }),
                      });
                      const data = await res.json() as any;
                      if (data.updated > 0) {
                        alert(t('planDetail.geocodeDoneSimple', { updated: data.updated }));
                        window.location.reload();
                      } else {
                        alert(t('planDetail.noGeocodablePlaces'));
                      }
                    } catch {
                      alert(t('planDetail.errors.geocodeFailed'));
                    }
                    if (btn) { btn.disabled = false; btn.textContent = t('planDetail.geocodeButton'); }
                  }}
                  className="btn btn-sm btn-primary"
                >
                  {t('planDetail.geocodeButton')}
                </button>
              </div>
            );
          }
          return null;
        })()}

        {/* 메인 ??*/}
        <div className="tabs tabs-bordered w-full mb-3">
          <a className={`tab tab-sm flex-1 ${mainTab === 'schedule' ? 'tab-active !text-primary font-bold' : 'text-base-content/50'}`} onClick={() => setMainTab('schedule')}>{t('planDetail.tabs.schedule')}</a>
          <a className={`tab tab-sm flex-1 ${mainTab === 'notes' ? 'tab-active !text-primary font-bold' : 'text-base-content/50'}`} onClick={() => setMainTab('notes')}>{t('planDetail.tabs.notes')}</a>
          <a className={`tab tab-sm flex-1 ${mainTab === 'album' ? 'tab-active !text-primary font-bold' : 'text-base-content/50'}`} onClick={() => setMainTab('album')}>{t('planDetail.tabs.album')}</a>
        </div>

        {/* �?컨트�?(?�정 ??�� ?�만) */}
        {mainTab === 'schedule' && (
          <div className="flex items-center justify-between mb-3">
            <div className="tabs tabs-boxed tabs-xs bg-base-200/80">
              <a className={`tab tab-xs ${viewMode === 'vertical' ? 'tab-active !bg-primary !text-primary-content font-bold' : 'text-base-content/60'}`} onClick={() => { setViewMode('vertical'); setFocusedDate(null); }}>{t('planDetail.view.list')}</a>
              <a className={`tab tab-xs ${viewMode === 'horizontal' ? 'tab-active !bg-primary !text-primary-content font-bold' : 'text-base-content/60'}`} onClick={() => { setViewMode('horizontal'); setFocusedDate(null); }}>{t('planDetail.view.timeline')}</a>
              <a className={`tab tab-xs ${viewMode === 'daily' ? 'tab-active !bg-primary !text-primary-content font-bold' : 'text-base-content/60'}`} onClick={() => setViewMode('daily')}>{t('planDetail.view.daily')}</a>
              <a className={`tab tab-xs ${viewMode === 'calendar' ? 'tab-active !bg-primary !text-primary-content font-bold' : 'text-base-content/60'}`} onClick={() => { setViewMode('calendar'); setFocusedDate(null); }}>{t('planDetail.view.calendar')}</a>
            </div>
            {canEditPlan && (
              <button className="btn btn-primary btn-xs gap-1" onClick={() => setEditingSchedule({} as Schedule)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                {t('planDetail.add')}
              </button>
            )}
          </div>
        )}

        {/* 메모 ??*/}
        {mainTab === 'notes' && selectedPlan && (
          <div className="space-y-6">
            {/* ?�행 ?�보 (비자, ?�차, ?�율 ?? */}
            <TravelMemoList planId={selectedPlan.id} planRegion={selectedPlan.region} />
            
            {/* 기존 메모/체크리스??*/}
            <TripNotes planId={selectedPlan.id} />

            {/* ?�이??보정?�?AI ?�행?�보 ?�데?�트�??�합 */}
          </div>
        )}

        {/* ?�범 ??*/}
        {mainTab === 'album' && selectedPlan && schedules.length > 0 && (
          <div className="space-y-8">
            <BulkMomentImporter
              planId={selectedPlan.id}
              schedules={schedules}
              onDone={(focusIds) => {
                const first = (focusIds || [])[0] || null;
                setAlbumFocusScheduleId(first);
                loadPlanDetail(selectedPlan.id, true);
              }}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3 text-sm">
                <label className="label cursor-pointer gap-2 py-0">
                  <input type="checkbox" className="checkbox checkbox-xs" checked={albumHideNoPhoto} onChange={(e) => setAlbumHideNoPhoto(e.target.checked)} />
                  <span className="label-text">���� ���� ���� �����</span>
                </label>
                <label className="label cursor-pointer gap-2 py-0">
                  <input type="checkbox" className="checkbox checkbox-xs" checked={albumHideNoText} onChange={(e) => setAlbumHideNoText(e.target.checked)} />
                  <span className="label-text">���� ���� ���� �����</span>
                </label>
              </div>
              <Button variant="ghost" outline size="sm" onClick={handleCopyShareLink}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0-12.814a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0 12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                {t('planDetail.shareAlbum')}
              </Button>
            </div>
            {Object.entries(albumGroupedSchedules).sort(([a], [b]) => a.localeCompare(b)).map(([date, daySchedules]) => (
              <div key={date}>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> {formatDisplayDate(date)}
                  <span className="text-sm font-normal text-gray-500">
                    Day {getDaysDifference(selectedPlan.start_date, date) + 1}
                  </span>
                </h3>
                <div className="space-y-4">
                  {daySchedules.map((schedule: Schedule) => (
                    <div id={`album-schedule-${schedule.id}`} key={schedule.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-3">
                        {schedule.time && (
                          <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
                            {schedule.time}
                          </span>
                        )}
                        <h4 className="font-semibold"><AutoTranslate text={schedule.title as string} /></h4>
                        {schedule.place && (
                          <span className="text-xs text-gray-500 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> <AutoTranslate text={schedule.place} /></span>
                        )}
                      </div>
                      <MomentSection scheduleId={schedule.id} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {mainTab === 'album' && (!schedules || schedules.length === 0) && (
          <p className="text-center text-gray-400 py-10">{t('planDetail.addScheduleFirst')}</p>
        )}

        {/* ?�정 ??*/}
        {mainTab === 'schedule' && (
          <>
            {canEditPlan ? <DragDropContext onDragEnd={onDragEnd}>
          {schedules.length === 0 ? (
            <Card>
              <Card.Body className="text-center py-12" centered>
                <p className="text-lg mb-4">
                  {t('planDetail.noSchedules')}
                </p>
                <Card.Actions>
                  <Button variant="primary" onClick={() => setEditingSchedule({} as Schedule)}>
                    {t('planDetail.addFirstSchedule')}
                  </Button>
                </Card.Actions>
              </Card.Body>
            </Card>
          ) : viewMode === 'daily' ? (
            <DayView
              schedules={schedules}
              startDate={selectedPlan.start_date}
              endDate={selectedPlan.end_date}
              planId={selectedPlan.id}
              onScheduleClick={setViewingSchedule}
              onDateChange={setFocusedDate}
              initialDate={focusedDate}
            />
          ) : viewMode === 'calendar' ? (
            <div className="card bg-base-100 shadow-sm p-4">
              <CalendarView
                schedules={schedules}
                startDate={selectedPlan.start_date}
                endDate={selectedPlan.end_date}
                onScheduleClick={(s) => setViewingSchedule(s)}
              />
            </div>
          ) : viewMode === 'vertical' ? (
            <div className="space-y-6">
              {Object.entries(groupedSchedules).sort(([a], [b]) => a.localeCompare(b)).map(([date, schedulesForDate]) => (
                <div key={date}>
                  <div
                    className={`flex items-center gap-2 mb-3 pb-2 border-b border-base-300 cursor-pointer transition-colors ${focusedDate === date ? 'border-primary' : ''}`}
                    onClick={() => setFocusedDate(prev => prev === date ? null : date)}
                  >
                    <span className={`badge ${focusedDate === date ? 'badge-primary' : 'badge-ghost'} badge-sm font-bold`}>Day {getDaysDifference(selectedPlan.start_date, date) + 1}</span>
                    <span className="text-sm font-medium text-base-content/70">{formatDisplayDate(date)}</span>
                    <span className="text-xs text-base-content/40">{t('planDetail.count', { count: schedulesForDate.length })}</span>
                  </div>
                  <Droppable droppableId={date}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                        {schedulesForDate.map((schedule, index) => (
                          <Draggable key={schedule.id} draggableId={schedule.id.toString()} index={index}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.dragHandleProps} data-schedule-id={schedule.id}>
                                <ScheduleCard schedule={schedule} onEdit={setEditingSchedule} onDelete={handleDeleteSchedule} onView={setViewingSchedule} compact />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          ) : (
            <div ref={horizontalTimelineRef} onScroll={handleHorizontalTimelineScroll} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} className="overflow-x-auto pb-4 cursor-grab">
              <div className="flex gap-4" style={{ minWidth: 'min-content' }}>
                {Object.entries(groupedSchedules).map(([date, schedulesForDate]) => (
                  <Droppable droppableId={date} key={date}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="flex-shrink-0" style={{ width: '260px' }}>
                        <div
                          className={`sticky top-0 bg-base-200 py-2 z-5 mb-2 cursor-pointer rounded px-2 transition-colors ${focusedDate === date ? 'bg-primary/10' : 'hover:bg-base-300'}`}
                          onClick={() => setFocusedDate(prev => prev === date ? null : date)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`badge ${focusedDate === date ? 'badge-primary' : 'badge-ghost'} badge-xs font-bold`}>D{getDaysDifference(selectedPlan.start_date, date) + 1}</span>
                            <span className="text-sm font-bold">{formatDisplayDate(date)}</span>
                          </div>
                        </div>
                        <div className="space-y-2 overflow-hidden">
                          {schedulesForDate.map((schedule, index) => (
                            <Draggable key={schedule.id} draggableId={schedule.id.toString()} index={index}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} data-schedule-id={schedule.id} className="w-full">
                                  <ScheduleCard schedule={schedule} onEdit={setEditingSchedule} onDelete={handleDeleteSchedule} onView={setViewingSchedule} compact />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                ))}
              </div>
            </div>
          )}
        </DragDropContext> : <div className="space-y-4">
          {schedules.length === 0 ? (
            <Card>
              <Card.Body className="text-center py-12" centered>
                <p className="text-lg">{t('planDetail.noSchedules')}</p>
              </Card.Body>
            </Card>
          ) : viewMode === 'daily' ? (
            <DayView
              schedules={schedules}
              startDate={selectedPlan.start_date}
              endDate={selectedPlan.end_date}
              planId={selectedPlan.id}
              onScheduleClick={setViewingSchedule}
              onDateChange={setFocusedDate}
              initialDate={focusedDate}
            />
          ) : viewMode === 'calendar' ? (
            <div className="card bg-base-100 shadow-sm p-4">
              <CalendarView
                schedules={schedules}
                startDate={selectedPlan.start_date}
                endDate={selectedPlan.end_date}
                onScheduleClick={(s) => setViewingSchedule(s)}
              />
            </div>
          ) : viewMode === 'vertical' ? (
            <div className="space-y-6">
              {Object.entries(groupedSchedules).sort(([a], [b]) => a.localeCompare(b)).map(([date, schedulesForDate]) => (
                <div key={date}>
                  <div
                    className={`flex items-center gap-2 mb-3 pb-2 border-b border-base-300 cursor-pointer transition-colors ${focusedDate === date ? 'border-primary' : ''}`}
                    onClick={() => setFocusedDate(prev => prev === date ? null : date)}
                  >
                    <span className={`badge ${focusedDate === date ? 'badge-primary' : 'badge-ghost'} badge-sm font-bold`}>Day {getDaysDifference(selectedPlan.start_date, date) + 1}</span>
                    <span className="text-sm font-medium text-base-content/70">{formatDisplayDate(date)}</span>
                    <span className="text-xs text-base-content/40">{t('planDetail.count', { count: schedulesForDate.length })}</span>
                  </div>
                  <div className="space-y-3">
                    {schedulesForDate.map((schedule) => (
                      <div key={schedule.id} data-schedule-id={schedule.id}>
                        <ScheduleCard schedule={schedule} onEdit={setEditingSchedule} onDelete={handleDeleteSchedule} onView={setViewingSchedule} compact />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div ref={horizontalTimelineRef} onScroll={handleHorizontalTimelineScroll} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} className="overflow-x-auto pb-4 cursor-grab">
              <div className="flex gap-4" style={{ minWidth: 'min-content' }}>
                {Object.entries(groupedSchedules).map(([date, schedulesForDate]) => (
                  <div key={date} className="flex-shrink-0" style={{ width: '260px' }}>
                    <div
                      className={`sticky top-0 bg-base-200 py-2 z-5 mb-2 cursor-pointer rounded px-2 transition-colors ${focusedDate === date ? 'bg-primary/10' : 'hover:bg-base-300'}`}
                      onClick={() => setFocusedDate(prev => prev === date ? null : date)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`badge ${focusedDate === date ? 'badge-primary' : 'badge-ghost'} badge-xs font-bold`}>D{getDaysDifference(selectedPlan.start_date, date) + 1}</span>
                        <span className="text-sm font-bold">{formatDisplayDate(date)}</span>
                      </div>
                    </div>
                    <div className="space-y-2 overflow-hidden">
                      {schedulesForDate.map((schedule) => (
                        <div key={schedule.id} data-schedule-id={schedule.id} className="w-full">
                          <ScheduleCard schedule={schedule} onEdit={setEditingSchedule} onDelete={handleDeleteSchedule} onView={setViewingSchedule} compact />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>}
          </>
        )}

        {/* ?�정 ?�세보기 모달 */}
        {viewingSchedule && (
          <ScheduleDetailModal
            modalRef={viewModalRef}
            schedule={viewingSchedule}
            schedules={schedules}
            onClose={() => setViewingSchedule(null)}
            onEdit={() => {
              setEditingSchedule(viewingSchedule);
              setViewingSchedule(null);
            }}
            onDelete={handleDeleteSchedule}
            onUpdate={(id, updates) => {
              const updatedSchedules = schedules.map((s) =>
                s.id === id ? { ...s, ...updates } : s
              );
              setSchedules(updatedSchedules);
              setViewingSchedule({ ...viewingSchedule, ...updates });
            }}
            canEdit={canEditPlan}
            isLoggedIn={isLoggedIn}
            onLogin={() => navigate('/login')}
            userLocation={userLocation}
            planRegion={selectedPlan.region}
          />
        )}

        {/* ?�행 ?�정 모달 */}
        {editingPlan && selectedPlan && (
          <PlanEditModal
            modalRef={planEditModalRef}
            plan={selectedPlan}
            onClose={() => setEditingPlan(false)}
            onSave={async (updatedPlan) => {
              setSelectedPlan(updatedPlan);
              setEditingPlan(false);
            }}
            onDelete={handleDeletePlan}
          />
        )}

        {/* ?�정 추�?/?�정 ??모달 */}
        {canEditPlan && (
          <ScheduleFormModal
            key={editingSchedule?.id}
            modalRef={editModalRef}
            planId={selectedPlan.id}
            planTitle={selectedPlan.title}
            planRegion={selectedPlan.region}
            planStartDate={selectedPlan.start_date}
            planEndDate={selectedPlan.end_date}
            schedule={editingSchedule}
            onClose={() => { editModalRef.current?.close(); setEditingSchedule(null); }}
            onSave={async (schedule) => {
              if (editingSchedule?.id) {
                // Update existing schedule and sort
                const updatedSchedules = schedules.map((s) => (s.id === schedule.id ? schedule : s));
                setSchedules(sortSchedulesByDateTime(updatedSchedules));
              } else {
                // Add new schedule and sort
                const newSchedules = sortSchedulesByDateTime([...schedules, schedule]);
                setSchedules(newSchedules);

                // Check if schedule date is outside plan range and update plan dates
                const scheduleDate = parseDateLocal(schedule.date);
                const planStart = parseDateLocal(selectedPlan.start_date);
                const planEnd = parseDateLocal(selectedPlan.end_date);

                let needsUpdate = false;
                let newStartDate = selectedPlan.start_date;
                let newEndDate = selectedPlan.end_date;

                if (scheduleDate < planStart) {
                  newStartDate = schedule.date;
                  needsUpdate = true;
                }
                if (scheduleDate > planEnd) {
                  newEndDate = schedule.date;
                  needsUpdate = true;
                }

                if (needsUpdate) {
                  try {
                    const updatedPlan = await plansAPI.update(selectedPlan.id, {
                      start_date: newStartDate,
                      end_date: newEndDate,
                    });
                    setSelectedPlan(updatedPlan);
                  } catch (error) {
                    console.error('Failed to update plan dates:', error);
                  }
                }

                // Scroll to the newly added schedule after a short delay
                setTimeout(() => {
                  const scheduleElement = document.querySelector(`[data-schedule-id="${schedule.id}"]`);
                  if (scheduleElement) {
                    scheduleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 100);
              }
              setEditingSchedule(null);
            }}
          />
        )}

        {/* AI 비서 FAB (?�너 + 공유 멤버) */}
        {canUseAssistant && selectedPlan && !showChatbot && (
          <button
            onClick={() => setShowChatbot(true)}
            className="fixed bottom-20 right-6 z-40 w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
            title={t('planDetail.aiAssistant')}
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={1.5}>
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white animate-pulse ${localStorage.getItem('offline_mode') === 'true' ? 'bg-orange-400' : 'bg-green-400'}`} />
          </button>
        )}

        {/* ?�행 비서 챗봇 모달 */}
        {canUseAssistant && selectedPlan && (
          <dialog ref={chatbotModalRef} className="modal modal-bottom sm:modal-middle">
            <div className="modal-box max-w-4xl h-[80vh] flex flex-col p-0">
              <div className="sticky top-0 bg-base-100 border-b border-base-200 px-6 py-4 flex items-center justify-between z-10">
                <h3 className="font-bold text-xl">{t('planDetail.travelAssistant')}</h3>
                <button className="btn btn-sm btn-circle btn-ghost" onClick={() => setShowChatbot(false)}>?</button>
              </div>
              <div className="flex-1 overflow-hidden">
                <TravelAssistantChat
                  planId={selectedPlan.id}
                  planTitle={selectedPlan.title}
                  planRegion={selectedPlan.region}
                  planStartDate={selectedPlan.start_date}
                  planEndDate={selectedPlan.end_date}
                  schedules={schedules}
                  onScheduleChange={(modifiedIds) => {
                    if (confirm(t('planDetail.confirmReloadAfterChange'))) {
                      loadPlanDetail(selectedPlan.id, true);
                      if (modifiedIds && modifiedIds.length > 0) {
                        setPendingScrollIds(modifiedIds);
                      }
                    }
                  }}
                />
              </div>
            </div>
            <form method="dialog" className="modal-backdrop">
              <button onClick={() => setShowChatbot(false)}>close</button>
            </form>
          </dialog>
        )}
      </main>

      {showShareToast && (
        <div className="toast toast-top toast-center z-50">
          <div className="alert alert-success">
            <span>{t('planDetail.linkCopied')}</span>
          </div>
        </div>
      )}

      {/* Floating Travel Progress Bar */}
      {schedules.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-base-100 shadow-lg border-t border-base-200 z-20 px-4 py-3">
          <div className="container mx-auto">
            <TravelProgressBar
              startDate={selectedPlan.start_date}
              endDate={selectedPlan.end_date}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ?�정 추�?/?�정 모달
interface ScheduleFormModalProps {
  modalRef: React.RefObject<HTMLDialogElement>;
  planId: number;
  planTitle: string; // Add planTitle
  planRegion: string | null; // Add planRegion
  planStartDate: string; // Add planStartDate
  planEndDate: string; // Add planEndDate
  schedule: Schedule | null;
  onClose: () => void;
  onSave: (schedule: Schedule) => void;
}

function ScheduleFormModal({ modalRef, planId, planTitle, planRegion, planStartDate, planEndDate, schedule, onClose, onSave }: ScheduleFormModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<{
    date: string;
    time: string;
    title: string;
    place: string | null;
    memo: string;
    plan_b: string;
    plan_c: string;
    latitude: number | null;
    longitude: number | null;
  }>({
    date: schedule?.date || formatDate(new Date()),
    time: schedule?.time || '',
    title: (schedule?.title as string) || '',
    place: (schedule?.place as string | null) || '',
    memo: schedule?.memo || '',
    plan_b: schedule?.plan_b || '',
    plan_c: schedule?.plan_c || '',
    latitude: schedule?.latitude || null,
    longitude: schedule?.longitude || null,
  });

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);

  const [textInputForAI, setTextInputForAI] = useState('');
  const { transcript: aiSttTranscript, isListening: aiSttListening, startListening: aiSttStart, stopListening: aiSttStop, browserSupportsSpeechRecognition: aiSttSupported } = useSpeechRecognition();
  const [isAIProcessing, setIsAIProcessing] = useState(false);

  // ?�소 검???�태
  const [placeResults, setPlaceResults] = useState<Array<{ id: number; name: string; lat: number; lng: number }>>([]);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [showPlaceResults, setShowPlaceResults] = useState(false);
  const placeSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Photon 결과 ?�싱
  const parsePhotonResults = (features: any[]) => {
    return features.map((f: any, idx: number) => {
      const props = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const parts: string[] = [];
      if (props.name) parts.push(props.name);
      if (props.city && props.city !== props.name) parts.push(props.city);
      if (props.state && props.state !== props.city) parts.push(props.state);
      if (props.country) parts.push(props.country);
      return { id: idx, name: parts.join(', '), lat, lng };
    });
  };

  // Nominatim 결과 ?�싱
  const parseNominatimResults = (data: any[]) => {
    return data.map((item: any, idx: number) => ({
      id: idx + 100,
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));
  };

  // ?�소 검???�수 (Photon ??Nominatim fallback)
  const searchPlace = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setPlaceResults([]);
      return;
    }

    setIsSearchingPlace(true);
    try {
      const searchQuery = planRegion ? `${query}, ${planRegion}` : query;
      
      // 1�? Photon API
      const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=7`);
      
      if (photonRes.ok) {
        const photonData = await photonRes.json();
        const places = parsePhotonResults(photonData.features || []);
        
        if (places.length > 0) {
          setPlaceResults(places);
          setShowPlaceResults(true);
          return;
        }
      }

      // 2�? Nominatim fallback (?��? ?�호�???
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=7&accept-language=ko`,
        { headers: { 'User-Agent': 'TravelApp/1.0' } }
      );
      
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        const places = parseNominatimResults(nomData);
        setPlaceResults(places);
        setShowPlaceResults(true);
      }
    } catch (error) {
      console.error('Place search error:', error);
    } finally {
      setIsSearchingPlace(false);
    }
  };

  // ?�바?�스???�소 검??
  const handlePlaceInputChange = (value: string) => {
    setFormData({ ...formData, place: value, latitude: null, longitude: null });

    if (placeSearchTimeout.current) {
      clearTimeout(placeSearchTimeout.current);
    }

    placeSearchTimeout.current = setTimeout(() => {
      searchPlace(value);
    }, 300);
  };

  // ?�소 ?�택
  const selectPlace = (place: { id: number; name: string; lat: number; lng: number }) => {
    // 짧�? ?�름 추출 (�?번째 콤마 ?�까지)
    const shortName = place.name.split(',')[0].trim();
    setFormData({
      ...formData,
      place: shortName,
      latitude: place.lat,
      longitude: place.lng,
    });
    setShowPlaceResults(false);
    setPlaceResults([]);
  };

  // STT 결과�?AI ?�력??반영
  useEffect(() => {
    if (aiSttTranscript) {
      setTextInputForAI(prev => prev ? prev + ' ' + aiSttTranscript : aiSttTranscript);
    }
  }, [aiSttTranscript]);

  const handleAICreateSchedule = async () => {
    if (!textInputForAI.trim()) return;

    setIsAIProcessing(true);
    try {
      const userLang = navigator.language.split('-')[0];
      const destLang = 'en'; // Placeholder, ideally from plan details

      const response = await fetch('/api/schedules/from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textInputForAI,
          planId: planId,
          userLang,
          destLang,
          planTitle,
          planRegion,
          planStartDate,
          planEndDate,
          defaultDate: formData.date, // ?�짜 미�????????�짜 ?�용
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create schedule from text via AI');
      }

      const newScheduleData = (await response.json()) as Schedule; // Renamed to newScheduleData to avoid confusion
      console.log('newSchedule.title from API:', newScheduleData.title);
      // const convertedTitle = typeof newScheduleData.title === 'object' ? (newScheduleData.title as any)[userLang] || (newScheduleData.title as any)['en'] || '' : newScheduleData.title; // Removed
      console.log('Converted title for form:', newScheduleData.title); // Simplified log

      // Always create a new schedule when using AI
      const createdSchedule = await schedulesAPI.create({
        plan_id: planId,
        date: newScheduleData.date,
        time: newScheduleData.time || undefined,
        title: newScheduleData.title as string,
        place: newScheduleData.place as string | null,
        memo: newScheduleData.memo || undefined,
        plan_b: newScheduleData.plan_b || undefined,
        plan_c: newScheduleData.plan_c || undefined,
      });

      onSave(createdSchedule); // Update parent state
      setTextInputForAI('');
      onClose(); // Close modal after saving
    } catch (error) {
      console.error('Failed to create schedule from text via AI:', error);
      alert(t('planDetail.errors.aiCreateFailed'));
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.date) {
      return;
    }

    setSaveStatus('saving');
    try {
      let { latitude, longitude } = formData;

      // place가 비면 좌표???�거
      if (!formData.place || !formData.place.trim()) {
        latitude = null as any;
        longitude = null as any;
      }

      // ?�소가 변경됐?�데 좌표가 ?�으�?geocode ?�도
      if (formData.place && !latitude && !longitude) {
        try {
          const q = planRegion && !formData.place.includes(planRegion)
            ? `${formData.place}, ${planRegion}` : formData.place;
          const geoRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.features?.length > 0) {
              // Pick first result; region context in query helps accuracy
              const [lng, lat] = geoData.features[0].geometry.coordinates;
              latitude = lat;
              longitude = lng;
            }
          }
        } catch { /* geocode failure is non-critical */ }
      }

      const savedSchedule = schedule?.id
        ? await schedulesAPI.update(schedule.id, {
            date: formData.date,
            time: formData.time || undefined,
            title: formData.title,
            place: formData.place,
            memo: formData.memo || undefined,
            plan_b: formData.plan_b || undefined,
            plan_c: formData.plan_c || undefined,
            latitude: latitude != null ? latitude : undefined,
            longitude: longitude != null ? longitude : undefined,
          })
        : await schedulesAPI.create({
            plan_id: planId,
            date: formData.date,
            time: formData.time || undefined,
            title: formData.title,
            place: formData.place,
            memo: formData.memo || undefined,
            plan_b: formData.plan_b || undefined,
            plan_c: formData.plan_c || undefined,
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
          });

      onSave(savedSchedule);
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to save schedule:', error);
      setSaveStatus('error');
    }
  };

  // ?�동?�???�거 - ?�동 ?�?�만 ?�용

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSave();
    if (saveStatus !== 'error') {
      onClose();
    }
  };

  return (
    <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
      <div className="modal-box max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-base-100 border-b px-4 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {schedule?.id ? t('planDetail.editSchedule') : t('planDetail.newSchedule')}
          </h3>
          <button className="btn btn-sm btn-circle btn-ghost" onClick={onClose}>?</button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {/* AI ?�스???�력?�로 ?�정 ?�성 */}
          <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <p className="font-semibold">{t('planDetail.aiQuickAdd')}</p>
            </div>
            <p className="text-xs text-base-content/70 mb-3">
              {t('planDetail.aiQuickAddHint')}
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={textInputForAI}
                  onChange={(e) => setTextInputForAI(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleAICreateSchedule();
                    }
                  }}
                  placeholder={t('planDetail.aiInputPlaceholder')}
                  className="textarea textarea-bordered text-sm w-full min-h-[56px] leading-relaxed pr-10"
                  rows={2}
                  disabled={isAIProcessing}
                />
                {aiSttSupported && (
                  <button
                    type="button"
                    onClick={aiSttListening ? aiSttStop : aiSttStart}
                    className={`absolute right-2 bottom-2 btn btn-ghost btn-xs btn-circle ${aiSttListening ? 'text-error animate-pulse' : 'text-base-content/40 hover:text-primary'}`}
                    title={aiSttListening ? t('planDetail.stopVoiceInput') : t('planDetail.voiceInput')}
                    disabled={isAIProcessing}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                )}
              </div>
              <Button 
                onClick={handleAICreateSchedule} 
                disabled={isAIProcessing || !textInputForAI.trim()} 
                variant="primary"
                size="sm"
                className="h-[56px] px-4 flex-shrink-0"
              >
                {isAIProcessing ? <Loading /> : <><Sparkles className="w-4 h-4" /> {t('planDetail.generate')}</>}
              </Button>
            </div>
            <p className="text-[10px] text-base-content/40 mt-1">{aiSttListening ? t('planDetail.listening') : t('planDetail.ctrlEnterHint')}</p>
            {isAIProcessing && <AIProcessingTip />}
          </div>

          <div className="divider text-xs text-base-content/50">{t('planDetail.orDirectInput')}</div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ?�짜 & ?�간 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text font-medium flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary" /> {t('planDetail.dateRequired')}
                  </span>
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="input input-bordered h-12 text-base"
                  required
                />
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text font-medium flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-secondary" /> {t('planDetail.time')}
                  </span>
                </label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="input input-bordered h-12 text-base font-mono"
                />
              </div>
            </div>

            {/* ?�목 */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-medium flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-accent" /> {t('planDetail.titleRequired')}
                </span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('planDetail.titlePlaceholder')}
                className="input input-bordered h-12 text-base"
                required
              />
            </div>

            {/* ?�소 */}
            <div className="form-control relative">
              <label className="label py-1">
                <span className="label-text font-medium flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-error" /> {t('planDetail.place')}
                </span>
                {formData.latitude && formData.longitude && (
                  <span className="label-text-alt text-success flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {t('planDetail.locationSaved')}
                  </span>
                )}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                <input
                  type="text"
                  value={formData.place || ''}
                  onChange={(e) => handlePlaceInputChange(e.target.value)}
                  onFocus={() => placeResults.length > 0 && setShowPlaceResults(true)}
                  onBlur={() => setTimeout(() => setShowPlaceResults(false), 200)}
                  placeholder={t('planDetail.placeSearchPlaceholder')}
                  className="input input-bordered h-12 text-base w-full pl-10 pr-10"
                />
                {isSearchingPlace && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="loading loading-spinner loading-sm text-primary"></span>
                  </span>
                )}
              </div>
              
              {/* 검??결과 ?�롭?�운 */}
              {showPlaceResults && placeResults.length > 0 && (
                <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-xl max-h-60 overflow-auto">
                  {placeResults.map((place) => (
                    <li
                      key={place.id}
                      className="px-4 py-3 hover:bg-primary/10 cursor-pointer border-b border-base-200 last:border-b-0 transition-colors"
                      onMouseDown={() => selectPlace(place)}
                    >
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium">{place.name.split(',')[0]}</div>
                          <div className="text-xs text-base-content/60 truncate">{place.name}</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* 미니 �??�리�?*/}
              {formData.latitude && formData.longitude && (
                <div className="mt-2 rounded-lg overflow-hidden border border-base-300">
                  <TravelMap
                    points={[{
                      id: 1,
                      lat: formData.latitude,
                      lng: formData.longitude,
                      title: formData.title || t('planDetail.selectedLocation'),
                      date: formData.date,
                      order: 1,
                    }]}
                    height="120px"
                    showRoute={false}
                  />
                </div>
              )}
              
              <label className="label py-1">
                <span className="label-text-alt text-base-content/50">
                  {t('planDetail.selectFromResults')}
                </span>
              </label>
            </div>

            {/* 메모 */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-medium">{t('planDetail.memo')}</span>
              </label>
              <textarea
                value={formData.memo}
                onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                placeholder={t('planDetail.memoPlaceholder')}
                rows={3}
                className="textarea textarea-bordered text-base leading-relaxed"
              />
            </div>

            {/* ?�??계획 - ?�이??*/}
            <div className="collapse collapse-arrow bg-base-200 rounded-lg">
              <input type="checkbox" />
              <div className="collapse-title py-3 min-h-0 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                <span className="font-medium text-sm">{t('planDetail.alternativePlanOptional')}</span>
              </div>
              <div className="collapse-content space-y-3">
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-sm">Plan B</span>
                  </label>
                  <input
                    type="text"
                    value={formData.plan_b}
                    onChange={(e) => setFormData({ ...formData, plan_b: e.target.value })}
                    placeholder={t('planDetail.planBPlaceholder')}
                    className="input input-bordered input-sm h-10"
                  />
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-sm">Plan C</span>
                  </label>
                  <input
                    type="text"
                    value={formData.plan_c}
                    onChange={(e) => setFormData({ ...formData, plan_c: e.target.value })}
                    placeholder={t('planDetail.planCPlaceholder')}
                    className="input input-bordered input-sm h-10"
                  />
                </div>
              </div>
            </div>

            {/* ?�??버튼 */}
            <div className="sticky bottom-0 bg-base-100 pt-3 -mx-4 px-4 -mb-4 pb-4 border-t">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  {saveStatus === 'saving' && <span className="text-primary">{t('planDetail.saving')}</span>}
                  {saveStatus === 'saved' && <span className="text-success">{t('planDetail.saved')}</span>}
                  {saveStatus === 'error' && <span className="text-error">{t('planDetail.saveFailed')}</span>}
                </div>
                <Button 
                  type="submit" 
                  variant="primary" 
                  disabled={saveStatus === 'saving' || !formData.title || !formData.date}
                  className="h-12 px-6"
                >
                  {schedule?.id ? t('planDetail.updateDone') : t('planDetail.addSchedule')}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>{t('planDetail.close')}</button>
      </form>
    </dialog>
  );
}

// ?�정 ?�세보기 모달
interface ScheduleDetailModalProps {
  modalRef: React.RefObject<HTMLDialogElement>;
  schedule: Schedule;
  schedules: Schedule[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, updates: Partial<Schedule>) => void;
  canEdit: boolean;
  isLoggedIn: boolean;
  onLogin: () => void;
  userLocation?: { lat: number; lng: number; city?: string } | null;
  planRegion?: string | null;
}

function ScheduleDetailModal({ modalRef, schedule, schedules, onClose, onEdit, onDelete, onUpdate, canEdit, isLoggedIn, onLogin: _onLogin, userLocation, planRegion }: ScheduleDetailModalProps) {
  const { t } = useTranslation();
  // Tab state
  const [detailTab, setDetailTab] = useState<'moments' | 'comments'>('moments');

  // Inline place edit
  const [editingPlace, setEditingPlace] = useState(false);
  const [placeValue, setPlaceValue] = useState(schedule.place || '');
  const [savingPlace, setSavingPlace] = useState(false);

  // Sync placeValue when schedule changes
  useEffect(() => {
    setPlaceValue(schedule.place || '');
    setEditingPlace(false);
  }, [schedule.id, schedule.place]);

  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number; countryCode?: string; city?: string } | null>(null);

  const handleSavePlace = async () => {
    if (placeValue === (schedule.place || '') && !pendingCoords) {
      setEditingPlace(false);
      return;
    }
    setSavingPlace(true);
    try {
      const updates: Record<string, any> = { place: placeValue || null };
      if (!placeValue || !placeValue.trim()) {
        // place 비우�?좌표???�거
        updates.lat = null;
        updates.lng = null;
        updates.country_code = null;
      } else if (pendingCoords) {
        updates.lat = pendingCoords.lat;
        updates.lng = pendingCoords.lng;
        if (pendingCoords.countryCode) updates.country_code = pendingCoords.countryCode;
      } else if (placeValue && placeValue !== (schedule.place || '')) {
        // ?�소 ?�스?�만 변경됐?????�동 geocode ?�도
        try {
          const q = planRegion && !placeValue.includes(planRegion) ? `${placeValue}, ${planRegion}` : placeValue;
          const geoRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.features?.length > 0) {
              // Find result matching expected country if possible
              const expectedCC = schedule.country_code?.toLowerCase();
              let best = geoData.features[0];
              if (expectedCC) {
                const match = geoData.features.find((f: any) =>
                  f.properties?.countrycode?.toLowerCase() === expectedCC
                );
                if (match) best = match;
              }
              const [lng, lat] = best.geometry.coordinates;
              const cc = best.properties?.countrycode?.toUpperCase();
              updates.lat = lat;
              updates.lng = lng;
              if (cc) updates.country_code = cc;
            }
          }
        } catch {}
      }
      // Map lat/lng to latitude/longitude for server API
      const apiUpdates: Record<string, any> = {};
      if (updates.place !== undefined) apiUpdates.place = updates.place;
      if (updates.lat !== undefined) apiUpdates.latitude = updates.lat;
      if (updates.lng !== undefined) apiUpdates.longitude = updates.lng;
      if (updates.country_code !== undefined) apiUpdates.country_code = updates.country_code;
      await schedulesAPI.update(schedule.id, apiUpdates);
      onUpdate(schedule.id, { ...apiUpdates, latitude: updates.lat, longitude: updates.lng });
      setEditingPlace(false);
      setPendingCoords(null);
    } catch (e) {
      console.error('Failed to save place:', e);
      alert(t('planDetail.errors.savePlaceFailed'));
    } finally {
      setSavingPlace(false);
    }
  };

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [authorName, setAuthorName] = useState<string>('');
  const [commentContent, setCommentContent] = useState<string>('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Load comments when schedule changes
  useEffect(() => {
    loadComments();
    // Load saved author name from localStorage
    const savedName = localStorage.getItem('comment_author_name');
    if (savedName) {
      setAuthorName(savedName);
    }
  }, [schedule.id]);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const response = await fetch(`/api/schedules/${schedule.id}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentContent.trim()) {
      return;
    }

    setIsSubmittingComment(true);
    try {
      const response = await fetch(`/api/schedules/${schedule.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: authorName.trim() || t('planDetail.anonymous'),
          content: commentContent.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setComments([data.comment, ...comments]);
        setCommentContent('');

        // Save author name to localStorage
        if (authorName.trim()) {
          localStorage.setItem('comment_author_name', authorName.trim());
        }
      } else {
        alert(t('planDetail.errors.writeCommentFailed'));
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
      alert(t('planDetail.errors.writeCommentFailed'));
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm(t('planDetail.confirmDeleteComment'))) {
      return;
    }

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setComments(comments.filter(c => c.id !== commentId));
      } else {
        alert(t('planDetail.errors.deleteCommentFailed'));
      }
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert(t('planDetail.errors.deleteCommentFailed'));
    }
  };

  // Check if schedule is in the past
  const isPast = useMemo(() => {
    if (!schedule.time) return false;
    const now = new Date();
    const [year, month, day] = schedule.date.split('-').map(Number);
    const [hours, minutes] = schedule.time.split(':').map(Number);
    const scheduleDateTime = new Date(year, month - 1, day, hours, minutes);
    return scheduleDateTime.getTime() < now.getTime();
  }, [schedule.date, schedule.time]);

  const sameDayMapPoints = useMemo(() => {
    const sameDay = schedules
      .filter(s => s.date === schedule.date && s.latitude != null && s.longitude != null)
      .sort((a, b) => {
        if ((a.time || '') !== (b.time || '')) return (a.time || '').localeCompare(b.time || '');
        return (a.order_index || 0) - (b.order_index || 0);
      });

    return sameDay.map((s, idx) => ({
      id: s.id,
      lat: s.latitude as number,
      lng: s.longitude as number,
      title: (s.place as string) || (s.title as string),
      date: s.date,
      order: idx + 1,
    }));
  }, [schedules, schedule.date]);

  return (
    <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
      <div className="modal-box max-w-2xl">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>?</button>
        </form>

        <h3 className="font-bold text-2xl mb-6">
          <AutoTranslate text={schedule.title as string}>
            {(tText) => <>{linkifyFlightNumbers(tText)}</>}
          </AutoTranslate>
        </h3>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="badge badge-lg badge-primary font-mono">{schedule.date}</div>
            {schedule.time && <div className="badge badge-lg font-mono">{schedule.time}</div>}
            {isPast && <div className="badge badge-success badge-lg">{t('planDetail.completed')}</div>}
          </div>

          <div className="flex items-start gap-2">
            <MapPin className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
            <div className="flex-1">
              <div className="font-semibold text-sm text-base-content/70 mb-1">{t('planDetail.place')}</div>
              {canEdit && editingPlace ? (
                <>
                  <div className="flex items-center gap-2">
                    <PlaceAutocomplete
                      value={placeValue}
                      onChange={(v) => setPlaceValue(v)}
                      onSelect={(place) => {
                        setPlaceValue(place.name);
                        setPendingCoords({ lat: place.lat, lng: place.lng, countryCode: place.countryCode, city: place.city });
                      }}
                      placeholder={t('planDetail.placeSearch')}
                      className="flex-1"
                      regionHint={planRegion || ''}
                    />
                    <button
                      onClick={handleSavePlace}
                      disabled={savingPlace}
                      className="btn btn-primary btn-sm btn-square"
                    >
                      {savingPlace ? '������' : '����'}
                    </button>
                    <button
                      onClick={() => { setEditingPlace(false); setPlaceValue(schedule.place || ''); setPendingCoords(null); }}
                      className="btn btn-ghost btn-sm btn-square"
                    >
                      취소
                    </button>
                  </div>
                  {pendingCoords && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-base-300">
                      <TravelMap
                        points={[{
                          id: 1,
                          lat: pendingCoords.lat,
                          lng: pendingCoords.lng,
                          title: placeValue || t('planDetail.selectedLocation'),
                          date: schedule.date,
                          order: 1,
                        }]}
                        height="120px"
                        showRoute={false}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-lg flex items-center gap-2 flex-wrap group">
                    {schedule.place ? (
                      <>
                        <AutoTranslate text={schedule.place as string}>
                          {(tText) => <>{linkifyFlightNumbers(tText)}</>}
                        </AutoTranslate>
                        <a
                          href={(() => {
                            const place = schedule.place as string;
                            const shouldAddLocation = place.length < 10 && (userLocation?.city || planRegion);
                            const searchQuery = shouldAddLocation
                              ? `${place} ${userLocation?.city || planRegion}`
                              : place;
                            return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
                          })()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link link-secondary hover:link-hover inline-flex items-center gap-1"
                          title={t('planDetail.viewOnMap')}
                        >
                          <Map className="w-4 h-4" />
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </>
                    ) : (
                      <span className="text-base-content/40 text-sm">{t('planDetail.noPlace')}</span>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setEditingPlace(true)}
                        className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                        title={t('planDetail.editPlace')}
                      >
                        ?�️
                      </button>
                    )}
                  </div>
                  {sameDayMapPoints.length > 0 && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-base-300">
                      <TravelMap
                        points={sameDayMapPoints}
                        height="140px"
                        showRoute={true}
                        highlightPointId={schedule.id}
                      />
                      <div className="px-2 py-1 text-[10px] text-base-content/50 bg-base-200 border-t border-base-300">
                        {t('planDetail.sameDayPins', { count: sameDayMapPoints.length })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {schedule.memo && (
            <div>
              <div className="font-semibold text-sm text-base-content/70 mb-2">{t('planDetail.memo')}</div>
              <div className="bg-base-200 p-4 rounded-lg whitespace-pre-wrap">
                <AutoTranslate text={schedule.memo}>
                  {(tText) => <>{linkifyText(tText)}</>}
                </AutoTranslate>
              </div>
            </div>
          )}

          {(schedule.plan_b || schedule.plan_c) && (
            <>
              <div className="divider">{t('planDetail.alternativePlan')}</div>
              {schedule.plan_b && (
                <div className="alert alert-info">
                  <div>
                    <div className="font-bold mb-1">Plan B</div>
                    <div><AutoTranslate text={schedule.plan_b} /></div>
                  </div>
                </div>
              )}
              {schedule.plan_c && (
                <div className="alert alert-warning">
                  <div>
                    <div className="font-bold mb-1">Plan C</div>
                    <div><AutoTranslate text={schedule.plan_c} /></div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ?? 기록 | ?��? */}
          <div className="mt-4">
            <div className="flex border-b border-base-300">
              <button
                onClick={() => setDetailTab('moments')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  detailTab === 'moments'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-base-content/50 hover:text-base-content/80'
                }`}
              >
                {t('planDetail.recordsTab')}
              </button>
              <button
                onClick={() => setDetailTab('comments')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  detailTab === 'comments'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-base-content/50 hover:text-base-content/80'
                }`}
              >
                {t('planDetail.commentsTab')} {comments.length > 0 && `(${comments.length})`}
              </button>
            </div>

            {/* 기록 ??*/}
            {detailTab === 'moments' && (
              <div className="pt-4">
                <MomentSection scheduleId={schedule.id} />
              </div>
            )}

            {/* ?��? ??*/}
            {detailTab === 'comments' && (
              <div className="pt-4 space-y-4">
                {/* Comment Form */}
                {isLoggedIn ? (
                  <div className="bg-base-200 p-4 rounded-lg space-y-3">
                    <input
                      type="text"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder={t('planDetail.nameOptional')}
                      className="input input-bordered input-sm w-full max-w-xs"
                    />
                    <textarea
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      placeholder={t('planDetail.commentPlaceholder')}
                      rows={2}
                      className="textarea textarea-bordered w-full"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={handleSubmitComment}
                        disabled={isSubmittingComment || !commentContent.trim()}
                      >
                        {isSubmittingComment ? t('planDetail.writing') : t('planDetail.writeComment')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="alert alert-info">
                    <div className="flex items-center justify-between gap-3 w-full">
                      <span>{t('planDetail.loginToComment')}</span>
                      <GoogleLoginButton onSuccess={() => window.location.reload()} />
                    </div>
                  </div>
                )}

                {/* Comments List */}
                {isLoadingComments ? (
                  <div className="text-center py-4"><Loading /></div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-4 text-base-content/50 text-sm">
                    {t('planDetail.noComments')}
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-base-200 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm"><AutoTranslate text={comment.author_name} /></span>
                            <span className="text-xs text-base-content/50">
                              {new Date(comment.created_at).toLocaleString('ko-KR', {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="btn btn-ghost btn-xs text-error"
                          >
                            {t('planDetail.delete')}
                          </button>
                        </div>
                        <p className="text-sm whitespace-pre-wrap"><AutoTranslate text={comment.content} /></p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="modal-action">
            <Button variant="error" onClick={() => {
              if (confirm(t('planDetail.confirmDeleteSchedule'))) {
                onDelete(schedule.id);
                onClose();
              }
            }}>
              {t('planDetail.delete')}
            </Button>
            <Button variant="primary" onClick={onEdit}>
              {t('planDetail.edit')}
            </Button>
          </div>
        )}
      </div>
    </dialog>
  );
}

// ?�행 ?�정 모달
interface PlanEditModalProps {
  modalRef: React.RefObject<HTMLDialogElement>;
  plan: Plan;
  onClose: () => void;
  onSave: (plan: Plan) => void;
  onDelete: () => void;
}

function PlanEditModal({ modalRef, plan, onClose, onSave, onDelete }: PlanEditModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    title: plan.title,
    region: plan.region || '',
    start_date: plan.start_date,
    end_date: plan.end_date,
    visibility: (plan.visibility || (plan.is_public ? 'public' : 'private')) as 'public' | 'shared' | 'private',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.title || !formData.start_date || !formData.end_date) {
      alert(t('planDetail.errors.requiredPlanFields'));
      return;
    }

    setIsSaving(true);
    try {
      const updatedPlan = await plansAPI.update(plan.id, {
        title: formData.title,
        region: formData.region || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date,
        visibility: formData.visibility,
      });
      onSave(updatedPlan);
    } catch (error) {
      console.error('Failed to update plan:', error);
      alert(t('planDetail.errors.updatePlanFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  return (
    <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
      <div className="modal-box max-w-2xl">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>?</button>
        </form>

        <h3 className="font-bold text-2xl mb-6">{t('planDetail.tripDetails')}</h3>

        <div className="space-y-4">
          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">{t('planDetail.tripTitleRequired')}</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('planDetail.tripTitlePlaceholder')}
              className="input input-bordered w-full"
              required
            />
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">{t('planDetail.tripRegion')}</span>
            </label>
            <input
              type="text"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              placeholder={t('planDetail.tripRegionPlaceholder')}
              className="input input-bordered w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">{t('planDetail.startDateRequired')}</span>
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="input input-bordered w-full"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">{t('planDetail.endDateRequired')}</span>
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="input input-bordered w-full"
                required
              />
            </div>
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">{t('planDetail.visibilityLabel')}</span>
            </label>
            <select
              value={formData.visibility}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  visibility: e.target.value as 'public' | 'shared' | 'private',
                })
              }
              className="select select-bordered w-full"
            >
              <option value="public">{t('planDetail.visibilityOption.public')}</option>
              <option value="shared">{t('planDetail.visibilityOption.shared')}</option>
              <option value="private">{t('planDetail.visibilityOption.private')}</option>
            </select>
          </div>
        </div>

        <div className="modal-action">
          <Button variant="error" onClick={handleDelete}>
            {t('planDetail.deleteTrip')}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? t('planDetail.saving') : t('planDetail.save')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}




