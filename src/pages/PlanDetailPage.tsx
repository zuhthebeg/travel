import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI, schedulesAPI } from '../lib/api';
import { formatDateRange, getDaysDifference, formatDate } from '../lib/utils';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScheduleCard } from '../components/ScheduleCard';
import { Loading, LoadingOverlay } from '../components/Loading';
import { Map } from '../components/Map';
import type { Schedule } from '../store/types';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';

export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedPlan, setSelectedPlan, schedules, setSchedules } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (id) {
      loadPlanDetail(parseInt(id));
    }
  }, [id]);

  useEffect(() => {
    if (editingSchedule && modalRef.current) {
      modalRef.current.showModal();
    } else if (modalRef.current) {
      modalRef.current.close();
    }
  }, [editingSchedule]);

  const loadPlanDetail = async (planId: number) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await plansAPI.getById(planId);
      setSelectedPlan(data.plan);
      setSchedules(data.schedules);
    } catch (err) {
      setError(err instanceof Error ? err.message : '여행 정보를 불러오는데 실패했습니다.');
      console.error('Failed to load plan detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    try {
      setIsSaving(true);
      await schedulesAPI.delete(scheduleId);
      setSchedules(schedules.filter((s) => s.id !== scheduleId));
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      alert('일정 삭제에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!selectedPlan) return;

    if (!confirm('이 여행을 삭제하시겠습니까? 모든 일정이 함께 삭제됩니다.')) {
      return;
    }

    try {
      setIsSaving(true);
      await plansAPI.delete(selectedPlan.id);
      navigate('/my');
    } catch (error) {
      console.error('Failed to delete plan:', error);
      alert('여행 삭제에 실패했습니다.');
      setIsSaving(false);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }

    const items = Array.from(schedules);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setSchedules(items);
  };

  const schedulePlaces = useMemo(() => {
    return schedules.map((s) => s.place).filter((p): p is string => !!p);
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
      {isSaving && <LoadingOverlay />}

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
              <Button variant="error" onClick={handleDeletePlan}>
                여행 삭제
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Map places={schedulePlaces} />
        </div>

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">일정</h2>
          <Button variant="primary" onClick={() => setEditingSchedule({} as Schedule)}>
            일정 추가
          </Button>
        </div>

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
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="schedules">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                  {schedules.map((schedule, index) => (
                    <Draggable key={schedule.id} draggableId={schedule.id.toString()} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          <ScheduleCard
                            schedule={schedule}
                            onEdit={setEditingSchedule}
                            onDelete={handleDeleteSchedule}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {/* 일정 추가/수정 폼 모달 */}
        <ScheduleFormModal
          key={editingSchedule?.id}
          modalRef={modalRef}
          planId={selectedPlan.id}
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSave={(schedule) => {
            if (editingSchedule?.id) {
              setSchedules(schedules.map((s) => (s.id === schedule.id ? schedule : s)));
            } else {
              setSchedules([...schedules, schedule]);
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
  schedule: Schedule | null;
  onClose: () => void;
  onSave: (schedule: Schedule) => void;
}

function ScheduleFormModal({ modalRef, planId, schedule, onClose, onSave }: ScheduleFormModalProps) {
  const [formData, setFormData] = useState({
    date: schedule?.date || formatDate(new Date()),
    time: schedule?.time || '',
    title: schedule?.title || '',
    place: schedule?.place || '',
    memo: schedule?.memo || '',
    plan_b: schedule?.plan_b || '',
    plan_c: schedule?.plan_c || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const handleSave = async () => {
    if (!formData.title || !formData.date) {
      return;
    }

    setSaveStatus('saving');
    try {
      const savedSchedule = schedule?.id
        ? await schedulesAPI.update(schedule.id, {
            date: formData.date,
            time: formData.time || undefined,
            title: formData.title,
            place: formData.place || undefined,
            memo: formData.memo || undefined,
            plan_b: formData.plan_b || undefined,
            plan_c: formData.plan_c || undefined,
          })
        : await schedulesAPI.create({
            plan_id: planId,
            date: formData.date,
            time: formData.time || undefined,
            title: formData.title,
            place: formData.place || undefined,
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

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      handleSave();
    }, 2000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
    onClose();
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
              value={formData.place}
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
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? (
                <>
                  <span className="loading loading-spinner"></span>
                  저장 중...
                </>
              ) : '닫기'}
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
