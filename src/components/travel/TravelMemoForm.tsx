import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '../Button';
import type { TravelMemo, TravelMemoCategory } from '../../store/types';

interface TravelMemoFormProps {
  memo?: TravelMemo | null;
  onSave: (data: {
    category: TravelMemoCategory;
    title: string;
    content: string;
    icon?: string;
  }) => void;
  onCancel: () => void;
}

const CATEGORIES: { value: TravelMemoCategory; label: string; icon: string }[] = [
  { value: 'visa', label: '비자/입국', icon: '🛂' },
  { value: 'timezone', label: '시차', icon: '🕐' },
  { value: 'weather', label: '날씨', icon: '🌤️' },
  { value: 'currency', label: '환율/통화', icon: '💱' },
  { value: 'emergency', label: '비상연락처', icon: '🆘' },
  { value: 'accommodation', label: '숙소', icon: '🏨' },
  { value: 'transportation', label: '교통', icon: '🚗' },
  { value: 'custom', label: '기타', icon: '📝' },
];

export function TravelMemoForm({ memo, onSave, onCancel }: TravelMemoFormProps) {
  const [category, setCategory] = useState<TravelMemoCategory>(memo?.category || 'custom');
  const [title, setTitle] = useState(memo?.title || '');
  const [content, setContent] = useState(memo?.content || '');
  const [icon, setIcon] = useState(memo?.icon || '');

  useEffect(() => {
    if (memo) {
      setCategory(memo.category);
      setTitle(memo.title);
      setContent(memo.content || '');
      setIcon(memo.icon || '');
    }
  }, [memo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      category,
      title: title.trim(),
      content: content.trim(),
      icon: icon || undefined,
    });
  };

  const selectedCategory = CATEGORIES.find(c => c.value === category);

  return (
    <div className="card bg-base-100 shadow-lg border border-base-200">
      <form onSubmit={handleSubmit} className="card-body p-4 gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">
            {memo ? '메모 수정' : '새 메모 추가'}
          </h3>
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm btn-square">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">카테고리</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`btn btn-sm gap-1 ${category === cat.value ? 'btn-primary' : 'btn-ghost'}`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">제목</span>
          </label>
          <div className="flex gap-2">
            <span className="text-2xl">{icon || selectedCategory?.icon || '📝'}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 미국 ESTA 필요"
              className="input input-bordered flex-1"
              required
            />
          </div>
        </div>

        {/* Custom Icon */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">커스텀 아이콘 (선택)</span>
          </label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="이모지 입력 (예: 🎒)"
            className="input input-bordered w-24"
            maxLength={4}
          />
        </div>

        {/* Content */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">내용</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="상세 내용을 입력하세요..."
            className="textarea textarea-bordered h-32"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            {memo ? '수정' : '추가'}
          </Button>
        </div>
      </form>
    </div>
  );
}
