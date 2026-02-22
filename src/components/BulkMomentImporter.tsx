import { useRef, useState } from 'react';
import { assistantAPI } from '../lib/api';
import { offlineMomentsAPI } from '../lib/offlineAPI';
import { compressImage, dataUrlToFile, validateImageFile } from '../lib/imageUtils';
import { extractExif } from '../lib/exif';
import type { Schedule } from '../store/types';

interface Props {
  planId: number;
  schedules: Schedule[];
  onDone: () => void;
}

export default function BulkMomentImporter({ planId, schedules, onDone }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const uploadToR2 = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('upload failed');
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

      const classify = await assistantAPI.classifyPhotos({
        planId,
        photos: prepared.map((p) => p.meta),
      });

      for (const item of prepared) {
        const assigned = classify.assignments.find((a) => a.tempId === item.meta.tempId);
        const scheduleIds = assigned?.scheduleIds?.length ? assigned.scheduleIds : [schedules[0]?.id].filter(Boolean) as number[];
        if (scheduleIds.length === 0) continue;

        // One optimized upload object, multi-schedule reference via URL
        const optimized = await compressImage(item.file, 1600, 0.82);
        const uploadFile = dataUrlToFile(optimized, item.file.name.replace(/\.[^.]+$/, '.webp'));
        const url = await uploadToR2(uploadFile);

        for (const sid of scheduleIds) {
          await offlineMomentsAPI.create(sid, {
            photo_data: url,
            note: assigned?.confidence && assigned.confidence < 0.6 ? `자동분류(낮은 신뢰): ${assigned.reason || ''}` : undefined,
          });
        }
      }

      setMsg('자동 분류 업로드 완료! 필요하면 일정 간 이동해서 수정해줘.');
      onDone();
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message || '실패했어. 다시 시도해줘.');
    } finally {
      setLoading(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div className="bg-base-100 border border-base-300 rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">AI 사진 일괄 분류</div>
          <div className="text-xs text-base-content/60">최대 10장 · 메타기반 자동 분류 · 업로드 후 일정 이동으로 수정 가능</div>
          <div className="text-xs text-base-content/50 mt-1">원본 저장은 멤버십 전용(추후 오픈 예정)</div>
        </div>
        <button className="btn btn-primary btn-sm" disabled={loading} onClick={() => ref.current?.click()}>
          {loading ? '처리 중...' : '사진 10장 업로드'}
        </button>
      </div>
      {msg && <div className="text-xs mt-2 text-base-content/80">{msg}</div>}
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
    </div>
  );
}
