/**
 * ConflictResolver — Modal to resolve sync conflicts one by one.
 * Shows "My version" vs "Server version" and lets user choose.
 */
import { useState } from 'react';
import { getDB, addOp } from '../lib/db';
import type { OpLogEntry } from '../lib/offline/types';
import { defaultLocalMeta } from '../lib/offline/types';
import { useTranslation } from 'react-i18next';

interface Props {
  conflicts: OpLogEntry[];
  onClose: () => void;
  onResolved: () => void;
}

export default function ConflictResolver({ conflicts, onClose, onResolved }: Props) {
  const { t } = useTranslation();
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

  const entityLabels: Record<string, string> = {
    plans: t('conflict.entity.plans'),
    schedules: t('conflict.entity.schedules'),
    moments: t('conflict.entity.moments'),
    travel_memos: t('conflict.entity.travel_memos'),
  };

  const fieldLabels: Record<string, string> = {
    title: t('conflict.field.title'),
    place: t('conflict.field.place'),
    date: t('conflict.field.date'),
    time: t('conflict.field.time'),
    memo: t('conflict.field.memo'),
    plan_b: t('conflict.field.plan_b'),
    plan_c: t('conflict.field.plan_c'),
    region: t('conflict.field.region'),
    start_date: t('conflict.field.start_date'),
    end_date: t('conflict.field.end_date'),
    note: t('conflict.field.note'),
    mood: t('conflict.field.mood'),
    content: t('conflict.field.content'),
    category: t('conflict.field.category'),
    rating: t('conflict.field.rating'),
    review: t('conflict.field.review'),
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg mb-2">
          {t('conflict.title', { current: currentIdx + 1, total: conflicts.length })}
        </h3>
        <p className="text-sm text-base-content/60 mb-4">
          {t('conflict.subtitle', { entity: entityLabels[op.entity] || op.entity, entityId: op.entityId })}
        </p>

        {/* Diff table */}
        <div className="overflow-x-auto mb-4">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>{t('conflict.table.field')}</th>
                <th className="text-info">{t('conflict.table.mine')}</th>
                <th className="text-success">{t('conflict.table.server')}</th>
              </tr>
            </thead>
            <tbody>
              {diffFields.length > 0 ? diffFields.map(field => (
                <tr key={field}>
                  <td className="font-medium">{fieldLabels[field] || field}</td>
                  <td className="text-info bg-info/5 max-w-[200px] truncate">
                    {String(myVersion[field] ?? t('conflict.empty'))}
                  </td>
                  <td className="text-success bg-success/5 max-w-[200px] truncate">
                    {String(serverVersion?.[field] ?? t('conflict.empty'))}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="text-center text-base-content/40">
                    {t('conflict.loadingServer')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="modal-action flex gap-2">
          <button className="btn btn-ghost" onClick={onClose} disabled={resolving}>
            {t('conflict.later')}
          </button>
          <button
            className="btn btn-success"
            onClick={handleKeepServer}
            disabled={resolving}
          >
            {resolving ? t('conflict.processing') : t('conflict.keepServer')}
          </button>
          <button
            className="btn btn-info"
            onClick={handleKeepMine}
            disabled={resolving}
          >
            {resolving ? t('conflict.processing') : t('conflict.keepMine')}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
