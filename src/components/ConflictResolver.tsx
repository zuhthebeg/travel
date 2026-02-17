/**
 * ConflictResolver — Modal to resolve sync conflicts one by one.
 * Shows "My version" vs "Server version" and lets user choose.
 */
import { useState } from 'react';
import { getDB, addOp } from '../lib/db';
import type { OpLogEntry } from '../lib/offline/types';
import { defaultLocalMeta } from '../lib/offline/types';

interface Props {
  conflicts: OpLogEntry[];
  onClose: () => void;
  onResolved: () => void;
}

const ENTITY_LABELS: Record<string, string> = {
  plans: '여행',
  schedules: '일정',
  moments: '순간',
  travel_memos: '메모',
};

const FIELD_LABELS: Record<string, string> = {
  title: '제목',
  place: '장소',
  date: '날짜',
  time: '시간',
  memo: '메모',
  plan_b: 'Plan B',
  plan_c: 'Plan C',
  region: '지역',
  start_date: '시작일',
  end_date: '종료일',
  note: '노트',
  mood: '기분',
  content: '내용',
  category: '카테고리',
  rating: '평점',
  review: '리뷰',
};

export default function ConflictResolver({ conflicts, onClose, onResolved }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [resolving, setResolving] = useState(false);

  if (conflicts.length === 0) return null;
  const op = conflicts[currentIdx];
  if (!op) return null;

  const myVersion = op.payload;

  // Get server version from the cached entity's __local.serverVersion
  // We stored it when detecting the conflict
  const getServerVersion = async (): Promise<Record<string, any> | null> => {
    const db = await getDB();
    const store = op.entity as 'plans' | 'schedules' | 'moments' | 'travel_memos';
    const entity = await db.get(store, op.entityId as number);
    return entity?.__local?.serverVersion || null;
  };

  const [serverVersion, setServerVersion] = useState<Record<string, any> | null>(null);

  // Load server version on mount/index change
  if (serverVersion === null) {
    getServerVersion().then(sv => setServerVersion(sv || {}));
  }

  const handleKeepMine = async () => {
    setResolving(true);
    try {
      const db = await getDB();
      // Re-queue the op without baseUpdatedAt (force overwrite)
      const newOp: OpLogEntry = {
        ...op,
        opId: crypto.randomUUID(),
        baseUpdatedAt: undefined, // No conflict check — force push
        status: 'pending',
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await addOp(newOp);
      // Remove old conflict op
      await db.delete('opLog', op.opId);
      // Clear conflict flag on entity
      const store = op.entity as 'plans' | 'schedules' | 'moments' | 'travel_memos';
      const entity = await db.get(store, op.entityId as number);
      if (entity) {
        entity.__local = { ...entity.__local, conflict: false, serverVersion: undefined };
        await db.put(store, entity);
      }
      advance();
    } finally {
      setResolving(false);
    }
  };

  const handleKeepServer = async () => {
    setResolving(true);
    try {
      const db = await getDB();
      // Delete the conflict op
      await db.delete('opLog', op.opId);
      // Replace local cache with server version
      const store = op.entity as 'plans' | 'schedules' | 'moments' | 'travel_memos';
      const sv = await getServerVersion();
      if (sv) {
        const updated = { ...sv, __local: { ...defaultLocalMeta, localUpdatedAt: Date.now() } } as any;
        await db.put(store, updated);
      } else {
        // Just clear conflict flag
        const entity = await db.get(store, op.entityId as number);
        if (entity) {
          entity.__local = { ...entity.__local, conflict: false, dirty: false, pendingSync: false, serverVersion: undefined };
          await db.put(store, entity);
        }
      }
      advance();
    } finally {
      setResolving(false);
    }
  };

  const advance = () => {
    if (currentIdx + 1 < conflicts.length) {
      setCurrentIdx(currentIdx + 1);
      setServerVersion(null);
    } else {
      onResolved();
      onClose();
    }
  };

  // Diff display: show fields that differ
  const diffFields = Object.keys(myVersion).filter(key => {
    if (key.startsWith('_')) return false;
    return serverVersion && myVersion[key] !== serverVersion[key];
  });

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-2">
          ⚠️ 충돌 해결 ({currentIdx + 1}/{conflicts.length})
        </h3>
        <p className="text-sm text-base-content/60 mb-4">
          {ENTITY_LABELS[op.entity] || op.entity} #{op.entityId} — 오프라인 변경과 서버 데이터가 다릅니다
        </p>

        {/* Diff table */}
        <div className="overflow-x-auto mb-4">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>필드</th>
                <th className="text-info">내 버전 (오프라인)</th>
                <th className="text-success">서버 버전</th>
              </tr>
            </thead>
            <tbody>
              {diffFields.length > 0 ? diffFields.map(field => (
                <tr key={field}>
                  <td className="font-medium">{FIELD_LABELS[field] || field}</td>
                  <td className="text-info bg-info/5 max-w-[200px] truncate">
                    {String(myVersion[field] ?? '(없음)')}
                  </td>
                  <td className="text-success bg-success/5 max-w-[200px] truncate">
                    {String(serverVersion?.[field] ?? '(없음)')}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="text-center text-base-content/40">
                    서버 버전을 불러오는 중...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="modal-action flex gap-2">
          <button className="btn btn-ghost" onClick={onClose} disabled={resolving}>
            나중에
          </button>
          <button
            className="btn btn-success"
            onClick={handleKeepServer}
            disabled={resolving}
          >
            {resolving ? '처리 중...' : '서버 버전 유지'}
          </button>
          <button
            className="btn btn-info"
            onClick={handleKeepMine}
            disabled={resolving}
          >
            {resolving ? '처리 중...' : '내 버전 유지'}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
