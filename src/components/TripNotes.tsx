import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// 타입 정의
type NoteCategory = 'reservation' | 'budget' | 'packing' | 'safety' | 'contact' | 'memo';

interface TripNote {
  id: number;
  plan_id: number;
  category: NoteCategory;
  content: string;
  is_checklist: number;
  checked: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface NoteSummary {
  total: number;
  checked: number;
}

interface TripNotesProps {
  planId: number;
}

// 카테고리 설정
const CATEGORY_CONFIG: Record<NoteCategory, {
  icon: string;
  labelKey: string;
  color: string;
  bgColor: string;
  allowChecklist: boolean;
}> = {
  reservation: { 
    icon: '📅', 
    labelKey: 'tripNotes.categories.reservation', 
    color: '#3b82f6', 
    bgColor: '#eff6ff',
    allowChecklist: true 
  },
  budget: { 
    icon: '💰', 
    labelKey: 'tripNotes.categories.budget', 
    color: '#eab308', 
    bgColor: '#fefce8',
    allowChecklist: false 
  },
  packing: { 
    icon: '🎒', 
    labelKey: 'tripNotes.categories.packing', 
    color: '#22c55e', 
    bgColor: '#f0fdf4',
    allowChecklist: true 
  },
  safety: { 
    icon: '🛡️', 
    labelKey: 'tripNotes.categories.safety', 
    color: '#ef4444', 
    bgColor: '#fef2f2',
    allowChecklist: false 
  },
  contact: { 
    icon: '📞', 
    labelKey: 'tripNotes.categories.contact', 
    color: '#8b5cf6', 
    bgColor: '#faf5ff',
    allowChecklist: false 
  },
  memo: { 
    icon: '📝', 
    labelKey: 'tripNotes.categories.memo', 
    color: '#6b7280', 
    bgColor: '#f9fafb',
    allowChecklist: false 
  },
};

const CATEGORIES: NoteCategory[] = ['reservation', 'budget', 'packing', 'safety', 'contact', 'memo'];

export default function TripNotes({ planId }: TripNotesProps) {
  const { t } = useTranslation();
  const [, setNotes] = useState<TripNote[]>([]);
  const [grouped, setGrouped] = useState<Record<NoteCategory, TripNote[]>>({} as Record<NoteCategory, TripNote[]>);
  const [summary, setSummary] = useState<Record<NoteCategory, NoteSummary>>({} as Record<NoteCategory, NoteSummary>);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<TripNote | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<NoteCategory>('memo');
  const [noteContent, setNoteContent] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  
  // 접힌 카테고리 상태
  const [collapsedCategories, setCollapsedCategories] = useState<Set<NoteCategory>>(new Set());

  // 데이터 로드
  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/notes?plan_id=${planId}`);
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setNotes(data.notes || []);
      setGrouped(data.grouped || {});
      setSummary(data.summary || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('tripNotes.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (planId) {
      fetchNotes();
    }
  }, [planId]);

  // 메모 추가
  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planId,
          category: selectedCategory,
          content: noteContent,
          is_checklist: isChecklist,
        }),
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      await fetchNotes();
      closeModal();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('tripNotes.errors.addFailed'));
    }
  };

  // 메모 수정
  const handleUpdateNote = async () => {
    if (!editingNote || !noteContent.trim()) return;
    
    try {
      const res = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingNote.id,
          content: noteContent,
        }),
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      await fetchNotes();
      closeModal();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('tripNotes.errors.updateFailed'));
    }
  };

  // 체크 토글
  const handleToggleCheck = async (note: TripNote) => {
    try {
      const res = await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: note.id,
          checked: !note.checked,
        }),
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      await fetchNotes();
    } catch (e) {
      console.error('Toggle check failed:', e);
    }
  };

  // 메모 삭제
  const handleDeleteNote = async (noteId: number) => {
    if (!confirm(t('tripNotes.confirmDelete'))) return;
    
    try {
      const res = await fetch(`/api/notes?id=${noteId}`, {
        method: 'DELETE',
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      await fetchNotes();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('tripNotes.errors.deleteFailed'));
    }
  };

  // 모달 열기
  const openAddModal = (category: NoteCategory) => {
    setEditingNote(null);
    setSelectedCategory(category);
    setNoteContent('');
    setIsChecklist(CATEGORY_CONFIG[category].allowChecklist);
    setIsModalOpen(true);
  };

  // 모달 닫기
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingNote(null);
    setNoteContent('');
    setIsChecklist(false);
  };

  // 카테고리 접기/펼치기
  const toggleCategory = (category: NoteCategory) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>{error}</p>
        <button 
          onClick={fetchNotes}
          className="mt-2 text-blue-500 underline"
        >
          {t('tripNotes.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          {t('tripNotes.title')}
        </h2>
        <button
          onClick={() => openAddModal('memo')}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
        >
          {t('tripNotes.addMemo')}
        </button>
      </div>

      {/* 카테고리별 메모 */}
      <div className="space-y-3">
        {CATEGORIES.every((c) => (grouped[c] || []).length === 0) && (
          <div className="text-center py-6 text-sm text-gray-400">
            {t('tripNotes.empty')}
          </div>
        )}
        {CATEGORIES.filter((c) => (grouped[c] || []).length > 0).map((category) => {
          const config = CATEGORY_CONFIG[category];
          const categoryNotes = grouped[category] || [];
          const categorySummary = summary[category] || { total: 0, checked: 0 };
          const isCollapsed = collapsedCategories.has(category);
          const hasCheckable = categoryNotes.some(n => n.is_checklist);
          
          return (
            <div 
              key={category}
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: config.color + '40' }}
            >
              {/* 카테고리 헤더 */}
              <div 
                className="flex items-center justify-between px-4 py-3 cursor-pointer"
                style={{ backgroundColor: config.bgColor }}
                onClick={() => toggleCategory(category)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{config.icon}</span>
                  <span className="font-medium" style={{ color: config.color }}>
                    {t(config.labelKey)}
                  </span>
                  {hasCheckable && categorySummary.total > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/80" style={{ color: config.color }}>
                      {t('tripNotes.checklistDone', { checked: categorySummary.checked, total: categoryNotes.filter(n => n.is_checklist).length })}
                    </span>
                  )}
                  {!hasCheckable && categorySummary.total > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/80" style={{ color: config.color }}>
                      {t('tripNotes.count', { count: categorySummary.total })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openAddModal(category);
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/50 transition-colors"
                    style={{ color: config.color }}
                  >
                    +
                  </button>
                  <span className="text-gray-400 text-sm">
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                </div>
              </div>

              {/* 메모 목록 */}
              {!isCollapsed && (
                <div className="bg-white">
                  {categoryNotes.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-400 text-sm">
                      {t('tripNotes.categoryEmpty', { category: t(config.labelKey) })}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {categoryNotes.map((note) => (
                        <li 
                          key={note.id}
                          className="px-4 py-3 flex items-start gap-3 group hover:bg-gray-50"
                        >
                          {/* 체크박스 (체크리스트인 경우) */}
                          {note.is_checklist ? (
                            <button
                              onClick={() => handleToggleCheck(note)}
                              className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                note.checked 
                                  ? 'bg-green-500 border-green-500 text-white' 
                                  : 'border-gray-300 hover:border-green-400'
                              }`}
                            >
                              {note.checked && '✓'}
                            </button>
                          ) : (
                            <span className="mt-0.5 w-5 h-5 flex items-center justify-center flex-shrink-0 text-gray-300">
                              •
                            </span>
                          )}
                          
                          {/* 내용 */}
                          <span className={`flex-1 text-sm whitespace-pre-wrap ${
                            note.checked ? 'text-gray-400 line-through' : 'text-gray-700'
                          }`}>
                            {note.content}
                          </span>
                          
                          {/* 삭제 버튼 */}
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 추가/수정 모달 */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {editingNote ? t('tripNotes.editMemo') : t('tripNotes.addMemoTitle')}
              </h3>
              <button 
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* 모달 내용 */}
            <div className="p-6 space-y-4">
              {/* 카테고리 선택 */}
              {!editingNote && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('tripNotes.category')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => {
                      const config = CATEGORY_CONFIG[cat];
                      const isSelected = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setIsChecklist(config.allowChecklist);
                          }}
                          className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1 transition-all ${
                            isSelected 
                              ? 'ring-2 ring-offset-1' 
                              : 'opacity-60 hover:opacity-100'
                          }`}
                          style={{ 
                            backgroundColor: config.bgColor,
                            color: config.color,
                            boxShadow: isSelected ? `0 0 0 2px ${config.color}` : 'none',
                          }}
                        >
                          {config.icon} {t(config.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 내용 입력 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('tripNotes.content')}
                </label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder={t('tripNotes.contentPlaceholder')}
                  className="w-full px-4 py-3 border rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  autoFocus
                />
              </div>

              {/* 체크리스트 옵션 */}
              {CATEGORY_CONFIG[selectedCategory].allowChecklist && !editingNote && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecklist}
                    onChange={(e) => setIsChecklist(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">{t('tripNotes.useChecklist')}</span>
                </label>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {t('tripNotes.cancel')}
              </button>
              <button
                onClick={editingNote ? handleUpdateNote : handleAddNote}
                disabled={!noteContent.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editingNote ? t('tripNotes.update') : t('tripNotes.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
