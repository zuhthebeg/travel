/**
 * ConflictBanner — Shows a warning when there are unresolved sync conflicts for a plan.
 */
import { useState, useEffect } from 'react';
import { getConflictOps } from '../lib/db';
import type { OpLogEntry } from '../lib/offline/types';

interface Props {
  planId: number;
  onResolve: (ops: OpLogEntry[]) => void;
}

export default function ConflictBanner({ planId, onResolve }: Props) {
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
          {conflicts.length}개 충돌 발생 — 오프라인 변경사항이 서버와 다릅니다
        </span>
      </div>
      <button
        className="btn btn-warning btn-sm"
        onClick={() => onResolve(conflicts)}
      >
        해결하기
      </button>
    </div>
  );
}
