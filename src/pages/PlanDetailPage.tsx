import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI, schedulesAPI } from '../lib/api';
import { formatDateRange, getDaysDifference, formatDate, formatDisplayDate } from '../lib/utils';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScheduleCard } from '../components/ScheduleCard';
import { Loading } from '../components/Loading';
// import { Map } from '../components/Map'; // 지도 기능 임시 비활성화
import { TravelAssistantChat } from '../components/TravelAssistantChat'; // Import the new component
import type { Schedule, Plan } from '../store/types';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import useBrowserNotifications from '../hooks/useBrowserNotifications'; // Import the new hook

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

// Helper function to convert URLs in text to clickable links
function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="link link-primary hover:link-hover"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedPlan, setSelectedPlan, schedules, setSchedules } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  // const [mapLoadError, setMapLoadError] = useState(false); // 지도 기능 임시 비활성화

  const [error, setError] = useState<string | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<Schedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('horizontal');
  const viewModalRef = useRef<HTMLDialogElement>(null);
  const editModalRef = useRef<HTMLDialogElement>(null);
  const planEditModalRef = useRef<HTMLDialogElement>(null);

  const { requestPermission, showNotification } = useBrowserNotifications(); // Use the notification hook
  const notifiedSchedules = useRef<Set<number>>(new Set()); // To track notified schedules

  useEffect(() => {
    requestPermission(); // Request notification permission on component mount
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

  return (
    <div className="min-h-screen bg-base-200">
      

      {/* Header */}
      <header className="bg-base-100 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">{selectedPlan.title}</h1>
                {selectedPlan.is_public && (
                  <div className="badge badge-secondary">공개</div>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-base-content/70">
                {selectedPlan.region && <span>📍 {selectedPlan.region}</span>}
                <span>📅 {formatDateRange(selectedPlan.start_date, selectedPlan.end_date)}</span>
                <span className="font-medium">{days}일</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => navigate(-1)}>
                뒤로
              </Button>
              <Button
                variant={showChatbot ? "primary" : "ghost"}
                onClick={() => setShowChatbot(!showChatbot)}
              >
                {showChatbot ? '여행 비서 닫기' : '여행 비서'}
              </Button>
              <Button variant="secondary" onClick={() => setEditingPlan(true)}>
                여행 상세
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Travel Assistant Chatbot - Toggle */}
        {showChatbot && selectedPlan && (
          <div className="mb-8">
            <TravelAssistantChat
              planId={selectedPlan.id}
              planTitle={selectedPlan.title}
              planRegion={selectedPlan.region}
              planStartDate={selectedPlan.start_date}
              planEndDate={selectedPlan.end_date}
              schedules={schedules}
            />
          </div>
        )}

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
            <div className="overflow-x-auto">
              <div className="flex space-x-8 pb-4">
                {Object.entries(groupedSchedules).map(([date, schedulesForDate]) => (
                  <Droppable droppableId={date} key={date}>
                    {(provided) => (
                      <div {...provided.droppableProps} ref={provided.innerRef} className="w-80 flex-shrink-0">
                        <h3 className="text-lg font-bold mb-4">{formatDisplayDate(date)}</h3>
                        <ul className="steps steps-vertical">
                          {schedulesForDate.map((schedule, index) => (
                            <Draggable key={schedule.id} draggableId={schedule.id.toString()} index={index}>
                              {(provided) => (
                                <li
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="step"
                                  data-schedule-id={schedule.id}
                                >
                                  <ScheduleCard
                                    schedule={schedule}
                                    onEdit={setEditingSchedule}
                                    onDelete={handleDeleteSchedule}
                                    onView={setViewingSchedule}
                                  />
                                </li>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </ul>
                      </div>
                    )}
                  </Droppable>
                ))}
              </div>
            </div>
          )}
        </DragDropContext>

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
      </main>
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
    place: string | null; // Explicitly allow null
    memo: string;
    plan_b: string;
    plan_c: string;
  }>({
    date: schedule?.date || formatDate(new Date()),
    time: schedule?.time || '',
    title: (schedule?.title as string) || '', // Explicitly cast to string
    place: (schedule?.place as string | null) || '', // Explicitly cast to string | null
    memo: schedule?.memo || '',
    plan_b: schedule?.plan_b || '',
    plan_c: schedule?.plan_c || '',
  });

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);

  const [textInputForAI, setTextInputForAI] = useState('');
  const [isAIProcessing, setIsAIProcessing] = useState(false);

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
      // No need to convert title and place back to multi-language objects for saving
      const savedSchedule = schedule?.id
        ? await schedulesAPI.update(schedule.id, {
            date: formData.date,
            time: formData.time || undefined,
            title: formData.title, // Directly use string
            place: formData.place, // Directly use string
            memo: formData.memo || undefined,
            plan_b: formData.plan_b || undefined,
            plan_c: formData.plan_c || undefined,
          })
        : await schedulesAPI.create({
            plan_id: planId,
            date: formData.date,
            time: formData.time || undefined,
            title: formData.title, // Directly use string
            place: formData.place, // Directly use string
            memo: formData.memo || undefined,
            plan_b: formData.plan_b || undefined,
            plan_c: formData.plan_c || undefined,
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
      <div className="modal-box">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        </form>
        <h3 className="font-bold text-lg mb-4">
          {schedule?.id ? '일정 수정' : '일정 추가'}
        </h3>
        
        {/* AI 텍스트 입력으로 일정 생성 */}
        <div className="mb-6 p-4 bg-base-100 rounded-lg shadow-inner">
          <p className="text-sm font-semibold mb-2">AI로 일정 생성하기</p>
          <p className="text-xs text-base-content/70 mb-3">
            "내일 10시에 에펠탑 구경"처럼 자연어로 입력하면 AI가 자동으로 채워줍니다.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={textInputForAI}
              onChange={(e) => setTextInputForAI(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAICreateSchedule()}
              placeholder="AI에게 일정을 설명해주세요..."
              className="input input-bordered w-full"
              disabled={isAIProcessing}
            />
            <Button onClick={handleAICreateSchedule} disabled={isAIProcessing} variant="secondary">
              {isAIProcessing ? <Loading /> : 'AI 생성'}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">날짜 *</span>
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="input input-bordered w-full"
                required
              />
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">시간</span>
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="input input-bordered w-full font-mono"
              />
            </div>
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">제목 *</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="예: 성산일출봉 관람"
              className="input input-bordered w-full"
              required
            />
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">장소</span>
            </label>
            <input
              type="text"
              value={formData.place || ''} // Ensure value is always a string
              onChange={(e) => setFormData({ ...formData, place: e.target.value })}
              placeholder="예: 성산일출봉"
              className="input input-bordered w-full"
            />
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">메모</span>
            </label>
            <textarea
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              placeholder="상세 내용을 입력하세요"
              rows={3}
              className="textarea textarea-bordered w-full"
            />
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">Plan B (대안)</span>
            </label>
            <input
              type="text"
              value={formData.plan_b}
              onChange={(e) => setFormData({ ...formData, plan_b: e.target.value })}
              placeholder="날씨가 안 좋을 때 대안"
              className="input input-bordered w-full"
            />
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">Plan C (또 다른 대안)</span>
            </label>
            <input
              type="text"
              value={formData.plan_c}
              onChange={(e) => setFormData({ ...formData, plan_c: e.target.value })}
              placeholder="또 다른 대안"
              className="input input-bordered w-full"
            />
          </div>

          <div className="modal-action">
            <div className="text-sm text-base-content/70">
              {saveStatus === 'saving' && '저장 중...'}
              {saveStatus === 'saved' && '저장됨'}
              {saveStatus === 'error' && '저장 실패'}
            </div>
            <Button type="submit" variant="primary" disabled={saveStatus === 'saving'}>
              저장하고 닫기
            </Button>
          </div>
        </form>
      </div>
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
}

function ScheduleDetailModal({ modalRef, schedule, onClose, onEdit, onDelete, onUpdate }: ScheduleDetailModalProps) {
  const [rating, setRating] = useState<number>(schedule.rating || 0);
  const [review, setReview] = useState<string>(schedule.review || '');
  const [isSaving, setIsSaving] = useState(false);

  // Check if schedule is in the past
  const isPast = useMemo(() => {
    if (!schedule.time) return false;
    const now = new Date();
    const [year, month, day] = schedule.date.split('-').map(Number);
    const [hours, minutes] = schedule.time.split(':').map(Number);
    const scheduleDateTime = new Date(year, month - 1, day, hours, minutes);
    return scheduleDateTime.getTime() < now.getTime();
  }, [schedule.date, schedule.time]);

  const handleSaveRating = async () => {
    setIsSaving(true);
    try {
      await schedulesAPI.update(schedule.id, { rating, review });
      onUpdate(schedule.id, { rating, review });
      alert('평점과 리뷰가 저장되었습니다.');
    } catch (error) {
      console.error('Failed to save rating:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
      <div className="modal-box max-w-2xl">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        </form>

        <h3 className="font-bold text-2xl mb-6">{schedule.title}</h3>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="badge badge-lg badge-primary font-mono">{schedule.date}</div>
            {schedule.time && <div className="badge badge-lg font-mono">{schedule.time}</div>}
            {isPast && <div className="badge badge-success badge-lg">✓ 완료</div>}
          </div>

          {schedule.place && (
            <div className="flex items-start gap-2">
              <span className="text-2xl">📍</span>
              <div className="flex-1">
                <div className="font-semibold text-sm text-base-content/70 mb-1">장소</div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(schedule.place)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg link link-primary hover:link-hover flex items-center gap-2"
                >
                  {schedule.place}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
            </div>
          )}

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

          {/* Rating and Review - Only for past schedules */}
          {isPast && (
            <>
              <div className="divider">평점 및 리뷰</div>
              <div className="space-y-3">
                <div>
                  <div className="font-semibold text-sm text-base-content/70 mb-2">평점</div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`text-3xl transition-all ${
                          star <= rating ? 'text-warning' : 'text-base-300'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-sm text-base-content/70 mb-2">리뷰</div>
                  <textarea
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="이 일정에 대한 리뷰를 작성해주세요..."
                    rows={4}
                    className="textarea textarea-bordered w-full"
                  />
                </div>
                {(rating !== schedule.rating || review !== schedule.review) && (
                  <Button
                    variant="secondary"
                    onClick={handleSaveRating}
                    disabled={isSaving}
                  >
                    {isSaving ? '저장 중...' : '평점 및 리뷰 저장'}
                  </Button>
                )}
              </div>
            </>
          )}
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
    is_public: plan.is_public,
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
        is_public: formData.is_public,
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
    if (confirm('이 여행을 삭제하시겠습니까? 모든 일정이 함께 삭제됩니다.')) {
      onDelete();
      onClose();
    }
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

          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                checked={formData.is_public}
                onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                className="checkbox checkbox-primary"
              />
              <span className="label-text">공개 여행으로 설정</span>
            </label>
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
