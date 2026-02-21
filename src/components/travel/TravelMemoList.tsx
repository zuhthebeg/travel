import { useState, useEffect, useMemo } from 'react';
import { Plus, Sparkles, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { TravelMemoCard } from './TravelMemoCard';
import { TravelMemoForm } from './TravelMemoForm';
import { Button } from '../Button';
import { Loading } from '../Loading';
import type { TravelMemo, TravelMemoCategory } from '../../store/types';

interface TravelMemoListProps {
  planId: number;
  planRegion?: string | null;
}

export function TravelMemoList({ planId, planRegion }: TravelMemoListProps) {
  const [memos, setMemos] = useState<TravelMemo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMemo, setEditingMemo] = useState<TravelMemo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scheduleSig, setScheduleSig] = useState<string>('');

  // Fetch memos
  const fetchMemos = async () => {
    try {
      const res = await fetch(`/api/plans/${planId}/memos`);
      if (res.ok) {
        const data = await res.json();
        setMemos(data.memos || []);
      }
    } catch (e) {
      console.error('Failed to fetch memos:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMemos();
    fetchScheduleSignature();
  }, [planId]);

  const getSavedSig = () => localStorage.getItem(`memo-ai-sig-${planId}`) || '';

  const hasScheduleChanged = useMemo(() => {
    if (!scheduleSig) return false;
    return getSavedSig() !== scheduleSig;
  }, [scheduleSig, planId]);

  const fetchScheduleSignature = async () => {
    try {
      const res = await fetch(`/api/plans/${planId}`);
      if (!res.ok) return;
      const data = await res.json();
      const schedules = (data.schedules || []) as any[];
      const sig = schedules
        .map(s => `${s.id}|${s.date}|${s.time || ''}|${s.title || ''}|${s.place || ''}|${s.memo || ''}`)
        .join('||');
      setScheduleSig(sig);
    } catch (e) {
      console.error('Failed to fetch schedule signature:', e);
    }
  };

  // Add memo
  const handleAdd = async (data: {
    category: TravelMemoCategory;
    title: string;
    content: string;
    icon?: string;
  }) => {
    try {
      const res = await fetch(`/api/plans/${planId}/memos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowForm(false);
        fetchMemos();
      }
    } catch (e) {
      console.error('Failed to add memo:', e);
    }
  };

  // Update memo
  const handleUpdate = async (data: {
    category: TravelMemoCategory;
    title: string;
    content: string;
    icon?: string;
  }) => {
    if (!editingMemo) return;
    
    try {
      const res = await fetch(`/api/plans/${planId}/memos/${editingMemo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditingMemo(null);
        fetchMemos();
      }
    } catch (e) {
      console.error('Failed to update memo:', e);
    }
  };

  // Delete memo
  const handleDelete = async (id: number) => {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    
    try {
      const res = await fetch(`/api/plans/${planId}/memos/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchMemos();
      }
    } catch (e) {
      console.error('Failed to delete memo:', e);
    }
  };

  // AI로 자동 생성
  const handleGenerate = async () => {
    if (!planRegion) {
      alert('여행 지역이 설정되어야 자동 생성이 가능합니다.');
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/plans/${planId}/memos/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: planRegion }),
      });
      if (res.ok) {
        fetchMemos();
        // 현재 일정 상태를 "AI 반영 기준점"으로 저장
        if (scheduleSig) localStorage.setItem(`memo-ai-sig-${planId}`, scheduleSig);
      } else {
        const error = await res.json();
        alert(error.error || '자동 생성에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to generate memos:', e);
      alert('자동 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          여행 정보
          <span className="badge badge-sm">{memos.length}</span>
        </h2>
        <button className="btn btn-ghost btn-sm btn-square">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {isExpanded && (
        <>
          {hasScheduleChanged && (
            <div className="alert alert-warning py-2 text-sm">
              <span>일정이 바뀌었어. 여행 정보도 다시 업데이트하는 걸 추천해.</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowForm(true); setEditingMemo(null); }}
              className="gap-1 border border-base-300"
            >
              <Plus className="w-4 h-4" /> 추가
            </Button>
            {planRegion && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="gap-1"
              >
                {isGenerating ? <Loading /> : <Sparkles className="w-4 h-4" />}
                {hasScheduleChanged ? 'AI 재업데이트 추천' : 'AI 일정기반 업데이트'}
              </Button>
            )}
          </div>

          {/* Form */}
          {(showForm || editingMemo) && (
            <TravelMemoForm
              memo={editingMemo}
              onSave={editingMemo ? handleUpdate : handleAdd}
              onCancel={() => { setShowForm(false); setEditingMemo(null); }}
            />
          )}

          {/* Memo List */}
          {memos.length === 0 ? (
            <div className="text-center py-8 text-base-content/60">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>아직 여행 정보가 없습니다.</p>
              <p className="text-sm">일정 기반 체크리스트(예약/예산/준비물/연락처)를 추가해보세요.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {memos.map((memo) => (
                <TravelMemoCard
                  key={memo.id}
                  memo={memo}
                  onEdit={setEditingMemo}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
