import { useState } from 'react';
import { Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { TravelMemo } from '../../store/types';
import { useTranslation } from 'react-i18next';

interface TravelMemoCardProps {
  memo: TravelMemo;
  onEdit?: (memo: TravelMemo) => void;
  onDelete?: (id: number) => void;
}

// 카테고리별 기본 아이콘
const CATEGORY_ICONS: Record<string, string> = {
  visa: '🛂',
  timezone: '🕐',
  weather: '🌤️',
  currency: '💱',
  emergency: '🆘',
  accommodation: '🏨',
  transportation: '🚗',
  custom: '📝',
};

// 카테고리 한글 이름
const CATEGORY_NAMES: Record<string, string> = {
  visa: 'visa',
  timezone: 'timezone',
  weather: 'weather',
  currency: 'currency',
  emergency: 'emergency',
  accommodation: 'accommodation',
  transportation: 'transportation',
  custom: 'custom',
};

export function TravelMemoCard({ memo, onEdit, onDelete }: TravelMemoCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const icon = memo.icon || CATEGORY_ICONS[memo.category] || '📝';
  const categoryName = t(`memo.category.${CATEGORY_NAMES[memo.category] || memo.category}`);

  const hasLongContent = memo.content && memo.content.length > 100;

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-shadow">
      <div className="card-body p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-2xl flex-shrink-0">{icon}</span>
            <div className="min-w-0">
              <span className="badge badge-sm badge-ghost">{categoryName}</span>
              <h3 className="font-semibold text-base truncate">{memo.title}</h3>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-1 flex-shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(memo)}
                className="btn btn-ghost btn-xs btn-square"
                title={t('memo.edit')}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(memo.id)}
                className="btn btn-ghost btn-xs btn-square text-error"
                title={t('memo.delete')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {memo.content && (
          <div className="mt-2">
            <p className={`text-sm text-base-content/80 whitespace-pre-wrap ${!isExpanded && hasLongContent ? 'line-clamp-3' : ''}`}>
              {memo.content}
            </p>
            {hasLongContent && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="btn btn-ghost btn-xs mt-1 gap-1"
              >
                {isExpanded ? (
                  <>{t('memo.collapse')} <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>{t('memo.more')} <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
