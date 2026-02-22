import { useEffect, useRef, useState } from 'react';
import { assistantAPI, schedulesAPI } from '../lib/api';
import { offlineMomentsAPI } from '../lib/offlineAPI';
import { compressImage, dataUrlToFile, validateImageFile } from '../lib/imageUtils';
import { extractExif } from '../lib/exif';
import type { Schedule } from '../store/types';

interface Props {
  planId: number;
  schedules: Schedule[];
  onDone: (focusScheduleIds?: number[]) => void;
}

const LOADING_TIPS = [
  '원본 그대로가 아니라 자동 압축본으로 업로드 중',
  '사진 메타정보(시간/위치) + 일정 정보로 AI 자동 분류 중',
  '자동 분류 후에도 일정 간 이동으로 직접 수정할 수 있어',
  '낮은 신뢰 결과는 메모로 표시돼서 바로 확인 가능',
];

export default function BulkMomentImporter({ planId, schedules, onDone }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [tipIdx, setTipIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('준비 중...');

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setTipIdx((p) => (p + 1) % LOADING_TIPS.length), 2200);
    return () => clearInterval(t);
  }, [loading]);

  const uploadToR2 = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'upload failed');
    }
    const data = await res.json();
    return data.url as string;
  };

  const onPick = async (e: any) => {
    const files = Array.from((e.target.files || []) as File[]) as File[];
    if (files.length === 0) return;
    if (files.length > 10) {
      setMsg('최대 10장까지 가능해.');
      return;
    }

    setLoading(true);
    setProgress(3);
    setProgressLabel('사진 메타정보 추출 중...');
    setMsg('메타 추출/AI 분류 중...');

    try {
      const prepared = await Promise.all(files.map(async (f, idx) => {
        const valid = validateImageFile(f, 20);
        if (!valid.valid) throw new Error(valid.error || 'invalid image');
        const exif = await extractExif(f);
        const tempId = `p_${Date.now()}_${idx}`;
        return {
          file: f,
          tempId,
          meta: {
            tempId,
            fileName: f.name,
            datetime: exif.datetime,
            lat: exif.lat,
            lng: exif.lng,
          },
        };
      }));

      setProgress(22);
      setProgressLabel('AI 분류 요청 중...');

      const classify = await assistantAPI.classifyPhotos({
        planId,
        photos: prepared.map((p) => p.meta),
      });

      setProgress(40);
      setProgressLabel('분류 결과 반영 중...');

      // time-overlap but location-mismatch hints -> update schedule plan B
      if (classify.planBUpdates?.length) {
        for (const u of classify.planBUpdates) {
          const s = schedules.find((x) => x.id === u.scheduleId);
          if (!s) continue;
          const prev = s.plan_b || '';
          const next = prev ? `${prev}\n• ${u.note}` : `• ${u.note}`;
          await schedulesAPI.update(s.id, { plan_b: next });
        }
      }

      const touchedScheduleIds = new Set<number>();

      for (let idx = 0; idx < prepared.length; idx++) {
        const item = prepared[idx];
        const percent = 45 + Math.round(((idx + 1) / prepared.length) * 50);
        setProgress(percent);
        setProgressLabel(`업로드/저장 중... (${idx + 1}/${prepared.length})`);
        const assigned = classify.assignments.find((a) => a.tempId === item.meta.tempId);
        const scheduleIds = assigned?.scheduleIds?.length ? assigned.scheduleIds : [schedules[0]?.id].filter(Boolean) as number[];
        if (scheduleIds.length === 0) continue;

        // One optimized upload object, multi-schedule reference via URL
        const optimized = await compressImage(item.file, 1600, 0.82);
        const uploadFile = dataUrlToFile(optimized, item.file.name.replace(/\.[^.]+$/, '.webp'));

        let photoValue = optimized;
        try {
          photoValue = await uploadToR2(uploadFile);
        } catch (uploadErr: any) {
          const msg = String(uploadErr?.message || '');
          // If R2 is missing, gracefully fallback to DB/base64 mode (same as existing single upload flow)
          if (!msg.includes('R2 binding missing') && !msg.includes('Upload storage is not configured')) {
            throw uploadErr;
          }
        }

        const safeReason = String(assigned?.reason || '')
          .replace(/[\r\n]+/g, ' ')
          .trim()
          .slice(0, 36);
        const metaPayload = {
          f: (item.meta.fileName || '').slice(0, 28),
          d: item.meta.datetime || null,
          a: item.meta.lat ?? null,
          g: item.meta.lng ?? null,
          c: typeof assigned?.confidence === 'number' ? Number(assigned.confidence.toFixed(2)) : null,
          r: safeReason || null,
        };
        const metaTag = ` [[m:${JSON.stringify(metaPayload)}]]`;

        for (const sid of scheduleIds) {
          touchedScheduleIds.add(sid);
          const warn = assigned?.confidence && assigned.confidence < 0.6 ? `자동분류 낮은신뢰` : '';
          const composed = `${warn}${metaTag}`.trim();
          const safeNote = composed.length > 190 ? composed.slice(0, 190) : composed;
          await offlineMomentsAPI.create(sid, {
            photo_data: photoValue,
            note: safeNote || undefined,
          });
        }
      }

      setProgress(100);
      setProgressLabel('완료!');
      setMsg('자동 분류 업로드 완료! 필요하면 일정 간 이동해서 수정해줘.');
      onDone(Array.from(touchedScheduleIds));
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message || '실패했어. 다시 시도해줘.');
    } finally {
      setLoading(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <>
      <div className="bg-base-100 border border-base-300 rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-sm">AI 사진 일괄 분류</div>
            <div className="text-xs text-base-content/60">최대 10장까지 선택 가능 · 메타기반 자동 분류 · 업로드 후 일정 이동으로 수정 가능</div>
            <div className="text-xs text-base-content/50 mt-1">원본 저장은 멤버십 전용(추후 오픈 예정)</div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={loading} onClick={() => ref.current?.click()}>
            {loading ? '처리 중...' : '사진 업로드'}
          </button>
        </div>
        {msg && <div className="text-xs mt-2 text-base-content/80">{msg}</div>}
        <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      </div>

      {loading && (
        <div className="fixed inset-0 z-[80] bg-black/45 flex items-center justify-center p-4">
          <div className="bg-base-100 rounded-2xl shadow-2xl max-w-md w-full p-5 border border-base-300">
            <div className="flex items-center gap-3 mb-3">
              <span className="loading loading-spinner loading-md text-primary" />
              <div className="font-semibold">사진 분류/업로드 진행 중...</div>
            </div>
            <p className="text-sm text-base-content/70 min-h-[40px] transition-all duration-300">{LOADING_TIPS[tipIdx]}</p>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-base-content/60 mb-1">
                <span>{progressLabel}</span>
                <span>{progress}%</span>
              </div>
              <progress className="progress progress-primary w-full" value={progress} max={100} />
            </div>
            <div className="text-xs text-base-content/50 mt-2">창 닫지 말고 잠깐만 기다려줘 🙏</div>
          </div>
        </div>
      )}
    </>
  );
}
