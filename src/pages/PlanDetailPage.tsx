import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI, schedulesAPI } from '../lib/api';
import { formatDateRange, getDaysDifference, formatDate, formatDisplayDate } from '../lib/utils';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScheduleCard } from '../components/ScheduleCard';
import { Loading } from '../components/Loading';
import { TravelMap, schedulesToMapPoints } from '../components/TravelMap'; // 여행 동선 지도
import { TravelAssistantChat } from '../components/TravelAssistantChat'; // Import the new component
import { TravelProgressBar } from '../components/TravelProgressBar';
// ReviewSection removed — merged into MomentSection
import MomentSection from '../components/MomentSection'; // Album - 순간 기록
import { PlaceAutocomplete } from '../components/PlaceAutocomplete';
import TripNotes from '../components/TripNotes'; // Import TripNotes
import MemberAvatars from '../components/MemberAvatars';
import ForkButton from '../components/ForkButton';
import { TravelMemoList } from '../components/travel/TravelMemoList';
import type { Schedule, Plan, Comment } from '../store/types';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import useBrowserNotifications from '../hooks/useBrowserNotifications'; // Import the new hook
import { MapPin, Calendar, Cloud, Map, Plane, Clock, FileText, Sparkles, AlertCircle, Search } from 'lucide-react';

type ViewMode = 'vertical' | 'horizontal';

// Helper function to sort schedules by date and time
function sortSchedulesByDateTime(schedules: Schedule[]): Schedule[] {
  return [...schedules].sort((a, b) => {
    // First sort by date
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
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
        title={`${flightCode} 항공편 정보 보기`}
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, selectedPlan, setSelectedPlan, schedules, setSchedules } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  // const [mapLoadError, setMapLoadError] = useState(false); // 지도 기능 임시 비활성화

  const [error, setError] = useState<string | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<Schedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [pendingScrollIds, setPendingScrollIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('horizontal');
  const [mainTab, setMainTab] = useState<'schedule' | 'notes' | 'album'>('schedule');
  const [geocodeFailed, setGeocodeFailed] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; city?: string } | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const viewModalRef = useRef<HTMLDialogElement>(null);
  const editModalRef = useRef<HTMLDialogElement>(null);
  const planEditModalRef = useRef<HTMLDialogElement>(null);
  const chatbotModalRef = useRef<HTMLDialogElement>(null);

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
          console.error('Failed to get user location:', error);
        }
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
            const scheduleTitle = schedule.title || '일정';
            const schedulePlace = schedule.place || '';

            showNotification(`다가오는 일정: ${scheduleTitle}`, {
              body: `${minutesDiff}분 후 ${schedulePlace}에서 시작합니다.`,
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

  const loadPlanDetail = async (planId: number) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await plansAPI.getById(planId);
      setSelectedPlan(data.plan);
      setSchedules(sortSchedulesByDateTime(data.schedules));
    } catch (err) {
      setError(err instanceof Error ? err.message : '여행 정보를 불러오는데 실패했습니다.');
      console.error('Failed to load plan detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    try {
      await schedulesAPI.delete(scheduleId);
      const remainingSchedules = schedules.filter((s) => s.id !== scheduleId);
      setSchedules(sortSchedulesByDateTime(remainingSchedules));

      // Update plan dates based on remaining schedules
      if (remainingSchedules.length > 0 && selectedPlan) {
        const dates = remainingSchedules.map(s => new Date(s.date));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

        const newStartDate = minDate.toISOString().split('T')[0];
        const newEndDate = maxDate.toISOString().split('T')[0];

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
      alert('일정 삭제에 실패했습니다.');
    }
  };

  const handleDeletePlan = async () => {
    if (!selectedPlan) return;

    if (!confirm('이 여행을 삭제하시겠습니까? 모든 일정이 함께 삭제됩니다.')) {
      return;
    }

    try {
      
      await plansAPI.delete(selectedPlan.id);
      navigate('/my');
    } catch (error) {
      console.error('Failed to delete plan:', error);
      alert('여행 삭제에 실패했습니다.');
      
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
  //     alert('텍스트로 일정 생성에 실패했습니다.');
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

    // If moving to a different date, update the schedule
    if (source.droppableId !== destination.droppableId) {
      const newDate = destination.droppableId;

      try {
        await schedulesAPI.update(draggedSchedule.id, { date: newDate });

        // Update local state
        const updatedSchedules = schedules.map(s =>
          s.id === draggedSchedule.id ? { ...s, date: newDate } : s
        );

        // Sort by date and time
        setSchedules(sortSchedulesByDateTime(updatedSchedules));
      } catch (error) {
        console.error('Failed to update schedule date:', error);
        alert('일정 이동에 실패했습니다.');
      }
    } else {
      // Same date - just reorder and sort
      setSchedules(sortSchedulesByDateTime(schedules));
    }
  };



  // 지도 기능 임시 비활성화
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
            <span>{error || '여행을 찾을 수 없습니다.'}</span>
          </div>
          <div className="flex-none">
            <Button variant="ghost" onClick={() => navigate(-1)}>돌아가기</Button>
          </div>
        </div>
      </div>
    );
  }

  const days = getDaysDifference(selectedPlan.start_date, selectedPlan.end_date);
  const isOwner = currentUser?.id === selectedPlan.user_id;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/album/${selectedPlan.id}`);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    } catch (error) {
      console.error('공유 링크 복사 실패:', error);
      alert('링크 복사에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      

      {/* Header - Compact version */}
      <header className="bg-base-100 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-base sm:text-lg md:text-xl font-bold truncate">{selectedPlan.title}</h1>
                <div className="badge badge-secondary badge-xs sm:badge-sm whitespace-nowrap flex-shrink-0">
                  {(selectedPlan.visibility || (selectedPlan.is_public ? 'public' : 'private')) === 'private'
                    ? '나만'
                    : (selectedPlan.visibility || (selectedPlan.is_public ? 'public' : 'private')) === 'shared'
                    ? '동행만'
                    : '공개'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-base-content/70 flex-wrap">
                {selectedPlan.region && (
                  <span className="whitespace-nowrap flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {selectedPlan.region}</span>
                )}
                {(userLocation?.city || selectedPlan.region) && (
                  <a
                    href={`https://www.google.com/search?q=weather+${encodeURIComponent(userLocation?.city || selectedPlan.region || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whitespace-nowrap hover:text-primary transition-colors flex items-center gap-0.5"
                    title={`${userLocation?.city ? `${userLocation.city} (현재 위치)` : selectedPlan.region} 날씨 보기`}
                  >
                    <Cloud className="w-3 h-3" /> <span className="hidden xs:inline">{userLocation?.city ? '현재 날씨' : '날씨'}</span>
                  </a>
                )}
                <span className="whitespace-nowrap flex items-center gap-0.5"><Calendar className="w-3 h-3" /> {formatDateRange(selectedPlan.start_date, selectedPlan.end_date)}</span>
                <span className="font-medium whitespace-nowrap">{days}일</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-auto">
                  <MemberAvatars planId={selectedPlan.id} isOwner={isOwner} />
                </div>
                <Button variant="primary" outline size="sm" onClick={handleCopyShareLink}>
                  🔗 공유 링크 복사
                </Button>
                {!isOwner && currentUser && (
                  <ForkButton
                    planId={selectedPlan.id}
                    onForked={(newPlan) => navigate(`/plans/${newPlan.id}`)}
                  />
                )}
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(-1)}
                className="btn-circle btn-xs sm:btn-sm"
                title="뒤로"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowChatbot(true)}
                className="btn-circle btn-xs sm:btn-sm"
                title="AI 비서"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditingPlan(true)}
                className="btn-circle btn-xs sm:btn-sm"
                title="설정"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 pb-32">

        {/* 여행 동선 지도 (좌표가 있는 일정이 있을 때만 표시) */}
        {(() => {
          const mapPoints = schedulesToMapPoints(schedules);
          if (mapPoints.length > 0) {
            return (
              <div className="mb-8">
                <div className="collapse collapse-arrow bg-base-100 shadow-lg rounded-lg">
                  <input type="checkbox" defaultChecked />
                  <div className="collapse-title text-xl font-medium flex items-center gap-2">
                    <Map className="w-5 h-5" /> 여행 동선
                    <span className="badge badge-primary badge-sm">{mapPoints.length}곳</span>
                  </div>
                  <div className="collapse-content">
                    <TravelMap 
                      points={mapPoints} 
                      showRoute={true}
                      height="350px"
                      className="mt-2"
                    />
                    {/* 좌표 상태 + 보정 UI */}
                    {(() => {
                      const withCoords = schedules.filter(s => s.latitude && s.longitude).length;
                      const missingCoords = schedules.filter(s => s.place && s.place.trim() && (!s.latitude || !s.longitude));

                      return (
                        <div className="mt-3 space-y-2">
                          {/* 좌표 상태 요약 */}
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-base-content/60 flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              📍 {withCoords}/{schedules.length}개 좌표
                              {missingCoords.length > 0 && (
                                <span className="text-warning"> · {missingCoords.length}개 미보정</span>
                              )}
                            </p>
                            <button
                              onClick={async () => {
                                if (!selectedPlan) return;
                                const btn = document.activeElement as HTMLButtonElement;
                                btn.disabled = true;
                                btn.textContent = '보정 중...';
                                try {
                                  const res = await fetch(`/api/plans/${selectedPlan.id}/geocode-schedules`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ mode: 'missing' }),
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    const failedItems = (data.results || []).filter((r: any) => r.status === 'not_found');
                                    const skipped = (data.results || []).filter((r: any) => r.status === 'skipped').length;
                                    const updated = data.updated || 0;
                                    // 스케줄만 다시 로드 (전체 로딩 없이)
                                    try {
                                      const freshData = await plansAPI.getById(selectedPlan.id);
                                      setSchedules(sortSchedulesByDateTime(freshData.schedules));
                                    } catch {}
                                    setGeocodeFailed(failedItems);
                                    alert(`📍 좌표 보정 완료!\n✅ 보정: ${updated}개\n❌ 실패: ${failedItems.length}개${skipped > 0 ? `\n⏭ 건너뜀: ${skipped}개` : ''}`);
                                  }
                                } catch (e) {
                                  alert('좌표 보정 실패');
                                } finally {
                                  btn.disabled = false;
                                  btn.textContent = '📍 좌표 보정';
                                }
                              }}
                              className="btn btn-xs btn-primary"
                            >
                              📍 좌표 보정
                            </button>
                          </div>

                          {/* 보정 안내 메시지 */}
                          {missingCoords.length > 0 && geocodeFailed.length === 0 && (
                            <div className="alert alert-warning py-2 text-sm">
                              <span>📍 좌표가 없는 일정이 {missingCoords.length}개 있어요. 위 버튼으로 보정해주세요!</span>
                            </div>
                          )}

                          {/* 보정 결과: 미보정 장소 수정 UI */}
                          {geocodeFailed.length > 0 && (
                            <div className="bg-base-200 rounded-lg p-3 space-y-2">
                              <p className="text-sm font-medium text-warning">
                                ⚠️ {geocodeFailed.length}개 장소를 찾지 못했어요. 장소명을 수정해서 다시 시도해보세요:
                              </p>
                              {geocodeFailed.map((item: any) => (
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
                                        // 장소명 업데이트
                                        await fetch(`/api/schedules/${item.id}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ place: newPlace }),
                                        });
                                        // 해당 일정만 재검색
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
                                        alert('업데이트 실패');
                                      } finally {
                                        input.disabled = false;
                                      }
                                    }}
                                    placeholder="장소명, 도시 (예: 에펠탑, 파리)"
                                  />
                                  <span className="text-xs text-base-content/40">Enter로 재검색</span>
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
          return null;
        })()}

        {/* 메인 탭: 일정 / 메모 */}
        <div className="tabs tabs-boxed mb-6 w-fit">
          <a 
            className={`tab gap-2 ${mainTab === 'schedule' ? 'tab-active' : ''}`} 
            onClick={() => setMainTab('schedule')}
          >
            📅 일정
          </a>
          <a 
            className={`tab gap-2 ${mainTab === 'notes' ? 'tab-active' : ''}`} 
            onClick={() => setMainTab('notes')}
          >
            📝 메모
          </a>
          <a 
            className={`tab gap-2 ${mainTab === 'album' ? 'tab-active' : ''}`} 
            onClick={() => setMainTab('album')}
          >
            📸 앨범
          </a>
        </div>

        {/* 메모 탭 */}
        {mainTab === 'notes' && selectedPlan && (
          <div className="space-y-6">
            {/* 여행 정보 (비자, 시차, 환율 등) */}
            <TravelMemoList planId={selectedPlan.id} planRegion={selectedPlan.region} />
            
            {/* 기존 메모/체크리스트 */}
            <TripNotes planId={selectedPlan.id} />
          </div>
        )}

        {/* 앨범 탭 */}
        {mainTab === 'album' && selectedPlan && schedules.length > 0 && (
          <div className="space-y-8">
            {Object.entries(groupedSchedules).sort(([a], [b]) => a.localeCompare(b)).map(([date, daySchedules]) => (
              <div key={date}>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  📅 {formatDisplayDate(date)}
                  <span className="text-sm font-normal text-gray-500">
                    Day {getDaysDifference(selectedPlan.start_date, date) + 1}
                  </span>
                </h3>
                <div className="space-y-4">
                  {daySchedules.map((schedule: Schedule) => (
                    <div key={schedule.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-3">
                        {schedule.time && (
                          <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
                            {schedule.time}
                          </span>
                        )}
                        <h4 className="font-semibold">{schedule.title}</h4>
                        {schedule.place && (
                          <span className="text-xs text-gray-500">📍 {schedule.place}</span>
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
          <p className="text-center text-gray-400 py-10">일정을 먼저 추가해주세요</p>
        )}

        {/* 일정 탭 */}
        {mainTab === 'schedule' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">일정</h2>
              <div className="flex items-center gap-4">
                <div className="tabs tabs-boxed">
                  <a className={`tab ${viewMode === 'vertical' ? 'tab-active' : ''}`} onClick={() => setViewMode('vertical')}>목록</a>
                  <a className={`tab ${viewMode === 'horizontal' ? 'tab-active' : ''}`} onClick={() => setViewMode('horizontal')}>타임라인</a>
                </div>
                <Button variant="primary" onClick={() => setEditingSchedule({} as Schedule)}>
                  일정 추가
                </Button>
              </div>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
          {schedules.length === 0 ? (
            <Card>
              <Card.Body className="text-center py-12" centered>
                <p className="text-lg mb-4">
                  아직 일정이 없습니다
                </p>
                <Card.Actions>
                  <Button variant="primary" onClick={() => setEditingSchedule({} as Schedule)}>
                    첫 번째 일정 추가하기
                  </Button>
                </Card.Actions>
              </Card.Body>
            </Card>
          ) : viewMode === 'vertical' ? (
            <Droppable droppableId="schedules">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                  {schedules.map((schedule, index) => (
                    <Draggable key={schedule.id} draggableId={schedule.id.toString()} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.dragHandleProps}
                          data-schedule-id={schedule.id}
                        >
                          <ScheduleCard
                            schedule={schedule}
                            onEdit={setEditingSchedule}
                            onDelete={handleDeleteSchedule}
                            onView={setViewingSchedule}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ) : (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-6" style={{ minWidth: 'min-content' }}>
                {Object.entries(groupedSchedules).map(([date, schedulesForDate]) => (
                  <Droppable droppableId={date} key={date}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="flex-shrink-0" style={{ width: '320px' }}>
                        <h3 className="text-base font-bold mb-3 sticky top-0 bg-base-200 py-2 z-5">{formatDisplayDate(date)}</h3>
                        <div className="space-y-3 overflow-hidden">
                          {schedulesForDate.map((schedule, index) => (
                            <Draggable key={schedule.id} draggableId={schedule.id.toString()} index={index}>
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  data-schedule-id={schedule.id}
                                  className="w-full"
                                >
                                  <ScheduleCard
                                    schedule={schedule}
                                    onEdit={setEditingSchedule}
                                    onDelete={handleDeleteSchedule}
                                    onView={setViewingSchedule}
                                  />
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
        </DragDropContext>
          </>
        )}

        {/* 일정 상세보기 모달 */}
        {viewingSchedule && (
          <ScheduleDetailModal
            modalRef={viewModalRef}
            schedule={viewingSchedule}
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
            userLocation={userLocation}
            planRegion={selectedPlan.region}
          />
        )}

        {/* 여행 수정 모달 */}
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

        {/* 일정 추가/수정 폼 모달 */}
        <ScheduleFormModal
          key={editingSchedule?.id}
          modalRef={editModalRef}
          planId={selectedPlan.id}
          planTitle={selectedPlan.title}
          planRegion={selectedPlan.region}
          planStartDate={selectedPlan.start_date}
          planEndDate={selectedPlan.end_date}
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
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
              const scheduleDate = new Date(schedule.date);
              const planStart = new Date(selectedPlan.start_date);
              const planEnd = new Date(selectedPlan.end_date);

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

        {/* 여행 비서 챗봇 모달 */}
        {selectedPlan && (
          <dialog ref={chatbotModalRef} className="modal modal-bottom sm:modal-middle">
            <div className="modal-box max-w-4xl h-[80vh] flex flex-col p-0">
              <div className="sticky top-0 bg-base-100 border-b border-base-200 px-6 py-4 flex items-center justify-between z-10">
                <h3 className="font-bold text-xl">여행 비서</h3>
                <button className="btn btn-sm btn-circle btn-ghost" onClick={() => setShowChatbot(false)}>✕</button>
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
                    loadPlanDetail(selectedPlan.id);
                    if (modifiedIds && modifiedIds.length > 0) {
                      setPendingScrollIds(modifiedIds);
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
            <span>링크가 복사되었습니다!</span>
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

// 일정 추가/수정 모달
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
  const [isAIProcessing, setIsAIProcessing] = useState(false);

  // 장소 검색 상태
  const [placeResults, setPlaceResults] = useState<Array<{ id: number; name: string; lat: number; lng: number }>>([]);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);
  const [showPlaceResults, setShowPlaceResults] = useState(false);
  const placeSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Photon 결과 파싱
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

  // Nominatim 결과 파싱
  const parseNominatimResults = (data: any[]) => {
    return data.map((item: any, idx: number) => ({
      id: idx + 100,
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));
  };

  // 장소 검색 함수 (Photon → Nominatim fallback)
  const searchPlace = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setPlaceResults([]);
      return;
    }

    setIsSearchingPlace(true);
    try {
      const searchQuery = planRegion ? `${query}, ${planRegion}` : query;
      
      // 1차: Photon API
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

      // 2차: Nominatim fallback (한글 상호명 등)
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

  // 디바운스된 장소 검색
  const handlePlaceInputChange = (value: string) => {
    setFormData({ ...formData, place: value, latitude: null, longitude: null });

    if (placeSearchTimeout.current) {
      clearTimeout(placeSearchTimeout.current);
    }

    placeSearchTimeout.current = setTimeout(() => {
      searchPlace(value);
    }, 300);
  };

  // 장소 선택
  const selectPlace = (place: { id: number; name: string; lat: number; lng: number }) => {
    // 짧은 이름 추출 (첫 번째 콤마 앞까지)
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

  const handleAICreateSchedule = async () => {
    if (!textInputForAI.trim()) return;

    setIsAIProcessing(true);
    try {
      const userLang = navigator.language.split('-')[0];
      const destLang = 'en'; // Placeholder, ideally from plan details

      const response = await fetch('/api/schedules/from-text', {
        method: 'POST', // Still POST to generate new schedule data
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
      alert('AI로 일정 생성에 실패했습니다.');
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
      // 좌표는 자동완성 선택 시에만 갱신됨 (formData에 이미 반영)
      const { latitude, longitude } = formData;

      const savedSchedule = schedule?.id
        ? await schedulesAPI.update(schedule.id, {
            date: formData.date,
            time: formData.time || undefined,
            title: formData.title,
            place: formData.place,
            memo: formData.memo || undefined,
            plan_b: formData.plan_b || undefined,
            plan_c: formData.plan_c || undefined,
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
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

  // 자동저장 제거 - 수동 저장만 사용

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
            {schedule?.id ? '일정 수정' : '새 일정'}
          </h3>
          <button className="btn btn-sm btn-circle btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {/* AI 텍스트 입력으로 일정 생성 */}
          <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <p className="font-semibold">AI로 빠르게 추가</p>
            </div>
            <p className="text-xs text-base-content/70 mb-3">
              "내일 10시 에펠탑 구경" 처럼 자연어로 입력하세요
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={textInputForAI}
                onChange={(e) => setTextInputForAI(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAICreateSchedule()}
                placeholder="예: 모레 오후 3시 루브르 박물관"
                className="input input-bordered input-sm flex-1 h-12 text-base"
                disabled={isAIProcessing}
              />
              <Button 
                onClick={handleAICreateSchedule} 
                disabled={isAIProcessing || !textInputForAI.trim()} 
                variant="primary"
                size="sm"
                className="h-12 px-4"
              >
                {isAIProcessing ? <Loading /> : <><Sparkles className="w-4 h-4" /> 생성</>}
              </Button>
            </div>
          </div>

          <div className="divider text-xs text-base-content/50">또는 직접 입력</div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 날짜 & 시간 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text font-medium flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary" /> 날짜 *
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
                    <Clock className="w-4 h-4 text-secondary" /> 시간
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

            {/* 제목 */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-medium flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-accent" /> 제목 *
                </span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="예: 에펠탑 야경 보기"
                className="input input-bordered h-12 text-base"
                required
              />
            </div>

            {/* 장소 */}
            <div className="form-control relative">
              <label className="label py-1">
                <span className="label-text font-medium flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-error" /> 장소
                </span>
                {formData.latitude && formData.longitude && (
                  <span className="label-text-alt text-success flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> 위치 저장됨
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
                  placeholder="장소 검색 (예: 에펠탑, 루브르)"
                  className="input input-bordered h-12 text-base w-full pl-10 pr-10"
                />
                {isSearchingPlace && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="loading loading-spinner loading-sm text-primary"></span>
                  </span>
                )}
              </div>
              
              {/* 검색 결과 드롭다운 */}
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

              {/* 미니 맵 프리뷰 */}
              {formData.latitude && formData.longitude && (
                <div className="mt-2 rounded-lg overflow-hidden border border-base-300">
                  <TravelMap
                    points={[{
                      id: 1,
                      lat: formData.latitude,
                      lng: formData.longitude,
                      title: formData.title || '선택한 위치',
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
                  검색 결과에서 선택하면 지도에 핀이 표시됩니다
                </span>
              </label>
            </div>

            {/* 메모 */}
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-medium">메모</span>
              </label>
              <textarea
                value={formData.memo}
                onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                placeholder="상세 내용, 예약 정보, 팁 등"
                rows={3}
                className="textarea textarea-bordered text-base leading-relaxed"
              />
            </div>

            {/* 대안 계획 - 접이식 */}
            <div className="collapse collapse-arrow bg-base-200 rounded-lg">
              <input type="checkbox" />
              <div className="collapse-title py-3 min-h-0 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                <span className="font-medium text-sm">대안 계획 (선택)</span>
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
                    placeholder="비 오면 실내 카페로"
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
                    placeholder="그것도 안되면..."
                    className="input input-bordered input-sm h-10"
                  />
                </div>
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="sticky bottom-0 bg-base-100 pt-3 -mx-4 px-4 -mb-4 pb-4 border-t">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  {saveStatus === 'saving' && <span className="text-primary">저장 중...</span>}
                  {saveStatus === 'saved' && <span className="text-success">✓ 저장됨</span>}
                  {saveStatus === 'error' && <span className="text-error">저장 실패</span>}
                </div>
                <Button 
                  type="submit" 
                  variant="primary" 
                  disabled={saveStatus === 'saving' || !formData.title || !formData.date}
                  className="h-12 px-6"
                >
                  {schedule?.id ? '수정 완료' : '일정 추가'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>닫기</button>
      </form>
    </dialog>
  );
}

// 일정 상세보기 모달
interface ScheduleDetailModalProps {
  modalRef: React.RefObject<HTMLDialogElement>;
  schedule: Schedule;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, updates: Partial<Schedule>) => void;
  userLocation?: { lat: number; lng: number; city?: string } | null;
  planRegion?: string | null;
}

function ScheduleDetailModal({ modalRef, schedule, onClose, onEdit, onDelete, onUpdate, userLocation, planRegion }: ScheduleDetailModalProps) {
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

  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);

  const handleSavePlace = async () => {
    if (placeValue === (schedule.place || '') && !pendingCoords) {
      setEditingPlace(false);
      return;
    }
    setSavingPlace(true);
    try {
      const updates: Record<string, any> = { place: placeValue || null };
      if (pendingCoords) {
        updates.lat = pendingCoords.lat;
        updates.lng = pendingCoords.lng;
      }
      await schedulesAPI.update(schedule.id, updates);
      onUpdate(schedule.id, updates);
      setEditingPlace(false);
      setPendingCoords(null);
    } catch (e) {
      console.error('Failed to save place:', e);
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
          author_name: authorName.trim() || '익명',
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
        alert('댓글 작성에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
      alert('댓글 작성에 실패했습니다.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('이 댓글을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setComments(comments.filter(c => c.id !== commentId));
      } else {
        alert('댓글 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('댓글 삭제에 실패했습니다.');
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

  return (
    <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
      <div className="modal-box max-w-2xl">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        </form>

        <h3 className="font-bold text-2xl mb-6">{linkifyFlightNumbers(schedule.title as string)}</h3>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="badge badge-lg badge-primary font-mono">{schedule.date}</div>
            {schedule.time && <div className="badge badge-lg font-mono">{schedule.time}</div>}
            {isPast && <div className="badge badge-success badge-lg">✓ 완료</div>}
          </div>

          <div className="flex items-start gap-2">
            <MapPin className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
            <div className="flex-1">
              <div className="font-semibold text-sm text-base-content/70 mb-1">장소</div>
              {editingPlace ? (
                <div className="flex items-center gap-2">
                  <PlaceAutocomplete
                    value={placeValue}
                    onChange={(v) => setPlaceValue(v)}
                    onSelect={(place) => {
                      setPlaceValue(place.name);
                      setPendingCoords({ lat: place.lat, lng: place.lng });
                    }}
                    placeholder="장소 검색..."
                    className="flex-1"
                  />
                  <button
                    onClick={handleSavePlace}
                    disabled={savingPlace}
                    className="btn btn-primary btn-sm btn-square"
                  >
                    {savingPlace ? '…' : '✓'}
                  </button>
                  <button
                    onClick={() => { setEditingPlace(false); setPlaceValue(schedule.place || ''); setPendingCoords(null); }}
                    className="btn btn-ghost btn-sm btn-square"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="text-lg flex items-center gap-2 flex-wrap group">
                  {schedule.place ? (
                    <>
                      {linkifyFlightNumbers(schedule.place as string)}
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
                        title="지도에서 보기"
                      >
                        <Map className="w-4 h-4" />
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    </>
                  ) : (
                    <span className="text-base-content/40 text-sm">장소 없음</span>
                  )}
                  <button
                    onClick={() => setEditingPlace(true)}
                    className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                    title="장소 수정"
                  >
                    ✏️
                  </button>
                </div>
              )}
            </div>
          </div>

          {schedule.memo && (
            <div>
              <div className="font-semibold text-sm text-base-content/70 mb-2">메모</div>
              <div className="bg-base-200 p-4 rounded-lg whitespace-pre-wrap">
                {linkifyText(schedule.memo)}
              </div>
            </div>
          )}

          {(schedule.plan_b || schedule.plan_c) && (
            <>
              <div className="divider">대안 계획</div>
              {schedule.plan_b && (
                <div className="alert alert-info">
                  <div>
                    <div className="font-bold mb-1">Plan B</div>
                    <div>{schedule.plan_b}</div>
                  </div>
                </div>
              )}
              {schedule.plan_c && (
                <div className="alert alert-warning">
                  <div>
                    <div className="font-bold mb-1">Plan C</div>
                    <div>{schedule.plan_c}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 탭: 기록 | 댓글 */}
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
                📸 기록
              </button>
              <button
                onClick={() => setDetailTab('comments')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  detailTab === 'comments'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-base-content/50 hover:text-base-content/80'
                }`}
              >
                💬 댓글 {comments.length > 0 && `(${comments.length})`}
              </button>
            </div>

            {/* 기록 탭 */}
            {detailTab === 'moments' && (
              <div className="pt-4">
                <MomentSection scheduleId={schedule.id} />
              </div>
            )}

            {/* 댓글 탭 */}
            {detailTab === 'comments' && (
              <div className="pt-4 space-y-4">
                {/* Comment Form */}
                <div className="bg-base-200 p-4 rounded-lg space-y-3">
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="이름 (선택, 비워두면 익명)"
                    className="input input-bordered input-sm w-full max-w-xs"
                  />
                  <textarea
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                    placeholder="댓글을 입력하세요..."
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
                      {isSubmittingComment ? '작성 중...' : '댓글 작성'}
                    </Button>
                  </div>
                </div>

                {/* Comments List */}
                {isLoadingComments ? (
                  <div className="text-center py-4"><Loading /></div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-4 text-base-content/50 text-sm">
                    아직 댓글이 없어요
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-base-200 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{comment.author_name}</span>
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
                            삭제
                          </button>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-action">
          <Button variant="error" onClick={() => {
            if (confirm('이 일정을 삭제하시겠습니까?')) {
              onDelete(schedule.id);
              onClose();
            }
          }}>
            삭제
          </Button>
          <Button variant="primary" onClick={onEdit}>
            편집
          </Button>
        </div>
      </div>
    </dialog>
  );
}

// 여행 수정 모달
interface PlanEditModalProps {
  modalRef: React.RefObject<HTMLDialogElement>;
  plan: Plan;
  onClose: () => void;
  onSave: (plan: Plan) => void;
  onDelete: () => void;
}

function PlanEditModal({ modalRef, plan, onClose, onSave, onDelete }: PlanEditModalProps) {
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
      alert('제목, 시작 날짜, 종료 날짜는 필수 입력 항목입니다.');
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
      alert('여행 정보 수정에 실패했습니다.');
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
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        </form>

        <h3 className="font-bold text-2xl mb-6">여행 상세 정보</h3>

        <div className="space-y-4">
          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">여행 제목 *</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="예: 제주도 여행"
              className="input input-bordered w-full"
              required
            />
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">여행 지역</span>
            </label>
            <input
              type="text"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              placeholder="예: 제주도"
              className="input input-bordered w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">시작 날짜 *</span>
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
                <span className="label-text">종료 날짜 *</span>
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
              <span className="label-text">공개 범위</span>
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
              <option value="public">🌍 공개 (public) — 누구나 볼 수 있어요</option>
              <option value="shared">👥 동행만 (shared) — 초대된 멤버만</option>
              <option value="private">🔒 나만 (private) — 나만 볼 수 있어요</option>
            </select>
          </div>
        </div>

        <div className="modal-action">
          <Button variant="error" onClick={handleDelete}>
            여행 삭제
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
