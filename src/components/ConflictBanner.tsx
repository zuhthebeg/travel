/**
 * ConflictBanner — Shows a warning when there are unresolved sync conflicts for a plan.
 */
import { useState, useEffect } from 'react';
import { getConflictOps } from '../lib/db';
import type { OpLogEntry } from '../lib/offline/types';
import { useTranslation } from 'react-i18next';

interface Props {
  planId: number;
  onResolve: (ops: OpLogEntry[]) => void;
}

export default function ConflictBanner({ planId, onResolve }: Props) {
  const { t } = useTranslation();
  const [conflicts, setConflicts] = useState<OpLogEntry[]>([]);

  useEffect(() => {
    getConflictOps(planId).then(setConflicts);
  }, [planId]);

  if (conflicts.length === 0) return null;

  return (
    <div className="bg-warning/20 border border-warning rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-warning text-lg">⚠️</span>
        <span className="text-sm font-medium">
          {t('conflict.bannerMessage', { count: conflicts.length })}
        </span>
      </div>
      <button
        className="btn btn-warning btn-sm"
        onClick={() => onResolve(conflicts)}
      >
        {t('conflict.resolve')}
      </button>
    </div>
  );
}
