import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { compressImage, validateImageFile } from '../lib/imageUtils';
import { Camera, X, Edit2, Trash2, Smile, Star, MapPin, Clock } from 'lucide-react';
import { extractExif } from '../lib/exif';
import { offlineMomentsAPI } from '../lib/offlineAPI';
import { useTranslation } from 'react-i18next';
import AutoTranslate from './AutoTranslate';

// Inline types (will be moved to types.ts by Spark)
interface Moment {
  id: number;
  schedule_id: number;
  user_id: number;
  photo_data: string | null;
  note: string | null;
  mood: 'amazing' | 'good' | 'okay' | 'meh' | 'bad' | null;
  revisit: 'yes' | 'no' | 'maybe' | null;
  rating: number | null;
  username?: string;
  user_picture?: string;
  created_at: string;
}

const MOOD_OPTIONS = [
  { value: 'amazing', emoji: '😍', label: 'amazing' },
  { value: 'good', emoji: '😊', label: 'good' },
  { value: 'okay', emoji: '😐', label: 'okay' },
  { value: 'meh', emoji: '😑', label: 'meh' },
  { value: 'bad', emoji: '😢', label: 'bad' },
] as const;

const REVISIT_OPTIONS = [
  { value: 'yes', label: 'yes', color: 'text-green-600' },
  { value: 'no', label: 'no', color: 'text-gray-500' },
  { value: 'maybe', label: 'maybe', color: 'text-yellow-600' },
] as const;

interface MomentSectionProps {
  scheduleId: number;
  schedules?: Array<{ id: number; title: string; date: string }>;
}

function parseMetaFromNote(note?: string | null): { cleanNote: string; meta: any | null } {
  if (!note) return { cleanNote: '', meta: null };
  const m = note.match(/\[\[(meta|m):(.*)\]\]/s);
  if (!m) return { cleanNote: note, meta: null };
  try {
    const raw = JSON.parse(m[2]);
    const meta = m[1] === 'm'
      ? { fileName: raw.f, datetime: raw.d, lat: raw.a, lng: raw.g, confidence: raw.c, reason: raw.r }
      : raw;
    const cleanNote = note.replace(m[0], '').trim();
    return { cleanNote, meta };
  } catch {
    return { cleanNote: note, meta: null };
  }
}

export default function MomentSection({ scheduleId, schedules = [] }: MomentSectionProps) {
  const { t } = useTranslation();
  const { currentUser } = useStore();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMoment, setSelectedMoment] = useState<Moment | null>(null);
  const [moveTargetById, setMoveTargetById] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [note, setNote] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [revisit, setRevisit] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrlMode, setImageUrlMode] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [exifInfo, setExifInfo] = useState<{ lat: number | null; lng: number | null; datetime: string | null } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMoments();
  }, [scheduleId]);

  const getCredential = () => localStorage.getItem('google_credential') || '';

  const loadMoments = async () => {
    setIsLoading(true);
    try {
      const data = await offlineMomentsAPI.getByScheduleId(scheduleId);
      setMoments(data.moments || []);
    } catch (e) {
      console.error('Failed to load moments:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file, 10);
    if (!validation.valid) {
      setError(validation.error || t('moment.invalidImage'));
      return;
    }
    setImageFile(file);
    setError('');

    // EXIF 추출
    try {
      const exif = await extractExif(file);
      if (exif.lat || exif.datetime) setExifInfo(exif);
    } catch {}

    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setNote('');
    setMood(null);
    setRevisit(null);
    setRating(null);
    setImageFile(null);
    setImagePreview('');
    setImageUrlMode(false);
    setImageUrl('');
    setExifInfo(null);
    setError('');
    setEditingId(null);
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    const hasImage = imageFile || imagePreview || (imageUrlMode && imageUrl.trim());
    if (!note && !mood && !revisit && !rating && !hasImage) {
      setError(t('moment.requiredOne'));
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      let photo_data: string | undefined;
      if (imageUrlMode && imageUrl.trim()) {
        photo_data = imageUrl.trim();
      } else if (imageFile) {
        photo_data = await compressImage(imageFile, 800, 0.8);
      } else if (imagePreview) {
        photo_data = imagePreview;
      }

      const body: Record<string, any> = {};
      if (note) body.note = note;
      if (mood) body.mood = mood;
      if (revisit) body.revisit = revisit;
      if (rating) body.rating = rating;
      if (photo_data) body.photo_data = photo_data;

      const credential = getCredential();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (credential) headers['X-Auth-Credential'] = credential;

      if (editingId) {
        // 수정
        const data = await offlineMomentsAPI.update(editingId, body);
        setMoments(prev => prev.map(m => m.id === editingId ? { ...m, ...data.moment } : m));
      } else {
        // 생성
        const data = await offlineMomentsAPI.create(scheduleId, body);
        setMoments(prev => [data.moment, ...prev]);
      }

      resetForm();
    } catch (e: any) {
      setError(e.message || t('moment.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('moment.deleteConfirm'))) return;
    try {
      await offlineMomentsAPI.delete(id);
      setMoments(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleCopyToSchedule = async (m: Moment, targetScheduleId: number) => {
    if (!targetScheduleId || targetScheduleId === m.schedule_id) return;
    await offlineMomentsAPI.create(targetScheduleId, {
      photo_data: m.photo_data || undefined,
      note: m.note || undefined,
      mood: m.mood || undefined,
      revisit: m.revisit || undefined,
      rating: m.rating || undefined,
    } as any);
  };

  const handleMoveToSchedule = async (m: Moment, targetScheduleId: number) => {
    if (!targetScheduleId || targetScheduleId === m.schedule_id) return;
    await handleCopyToSchedule(m, targetScheduleId);
    await offlineMomentsAPI.delete(m.id);
    setMoments((prev) => prev.filter((x) => x.id !== m.id));
  };

  const startEdit = (m: Moment) => {
    setEditingId(m.id);
    setNote(m.note || '');
    setMood(m.mood);
    setRevisit(m.revisit);
    setRating(m.rating);
    setImagePreview(m.photo_data || '');
    setShowForm(true);
  };

  const isMyMoment = (m: Moment) => currentUser?.id === m.user_id;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Smile className="w-5 h-5 text-orange-500" />
          {t('moment.title')}
          {moments.length > 0 && (
            <span className="text-sm font-normal text-gray-500">({moments.length})</span>
          )}
        </h3>
        {currentUser && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            {t('moment.addRecord')}
          </button>
        )}
      </div>

      {/* 작성 폼 */}
      {showForm && (
        <div className="bg-orange-50 dark:bg-gray-800 rounded-xl p-4 space-y-3 border border-orange-200 dark:border-gray-700">
          {/* 기분 태그 */}
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">{t('moment.mood')}</label>
            <div className="flex gap-2">
              {MOOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setMood(mood === opt.value ? null : opt.value)}
                  className={`flex flex-col items-center p-2 rounded-lg transition-all ${
                    mood === opt.value
                      ? 'bg-orange-200 dark:bg-orange-900 scale-110'
                      : 'bg-white dark:bg-gray-700 hover:bg-orange-100'
                  }`}
                >
                  <span className="text-xl">{opt.emoji}</span>
                  <span className="text-[10px] mt-0.5">{t(`moment.moodOption.${opt.label}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 별점 */}
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">{t('moment.rating')}</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(v => (
                <button
                  key={v}
                  onClick={() => setRating(rating === v ? null : v)}
                  className="p-0.5"
                >
                  <Star
                    className={`w-6 h-6 transition-colors ${
                      v <= (rating ?? 0)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                  />
                </button>
              ))}
              {rating && (
                <span className="text-sm text-gray-500 ml-1 self-center">{rating}/5</span>
              )}
            </div>
          </div>

          {/* 짧은 감상 */}
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">
              {t('moment.memo')} <span className="text-gray-400">({note.length}/200)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value.slice(0, 200))}
              placeholder={t('moment.memoPlaceholder')}
              className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 text-sm resize-none"
              rows={2}
            />
          </div>

          {/* 다시 가고 싶다 */}
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-400 mb-1 block">{t('moment.revisitQuestion')}</label>
            <div className="flex gap-2">
              {REVISIT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRevisit(revisit === opt.value ? null : opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    revisit === opt.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {t(`moment.revisitOption.${opt.label}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 사진 */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-sm text-gray-600 dark:text-gray-400">{t('moment.photo')}</label>
              <button
                type="button"
                onClick={() => { setImageUrlMode(!imageUrlMode); setImageUrl(''); setImageFile(null); setImagePreview(''); }}
                className="text-[10px] text-orange-500 hover:text-orange-600"
              >
                {imageUrlMode ? t('moment.fileUpload') : t('moment.urlInput')}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            {imageUrlMode ? (
              <div className="space-y-2">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 text-sm"
                />
                {imageUrl && (
                  <img src={imageUrl} alt="preview" className="w-full max-h-48 object-contain bg-gray-50 dark:bg-gray-900 rounded-lg"
                    onError={e => (e.currentTarget.style.display = 'none')}
                    onLoad={e => (e.currentTarget.style.display = '')}
                  />
                )}
              </div>
            ) : imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="preview" className="w-full max-h-48 object-contain bg-gray-50 dark:bg-gray-900 rounded-lg" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(''); }}
                  className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 text-sm flex items-center justify-center gap-2 hover:border-orange-400"
              >
                <Camera className="w-4 h-4" /> {t('moment.addPhoto')}
              </button>
            )}

            {/* EXIF 정보 표시 */}
            {exifInfo && (exifInfo.lat || exifInfo.datetime) && (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {exifInfo.lat && exifInfo.lng && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                    <MapPin className="w-3 h-3" />
                    {exifInfo.lat.toFixed(4)}, {exifInfo.lng.toFixed(4)}
                  </span>
                )}
                {exifInfo.datetime && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                    <Clock className="w-3 h-3" />
                    {exifInfo.datetime}
                  </span>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
            >
              {isSubmitting ? t('moment.saving', { defaultValue: '저장 중...' }) : editingId ? t('moment.edit', { defaultValue: '수정' }) : t('moment.record', { defaultValue: '기록하기' })}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-gray-500 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              {t('moment.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* 기록 목록 */}
      {isLoading ? (
        <p className="text-center text-gray-400 text-sm py-4">{t('moment.loading')}</p>
      ) : moments.length === 0 && !showForm ? (
        <p className="text-center text-gray-400 text-sm py-6">
          {t('moment.empty')} {currentUser ? t('moment.emptyHint') : ''}
        </p>
      ) : (
        <div className="space-y-3">
          {moments.map(m => {
            const parsed = parseMetaFromNote(m.note);
            return (
            <div key={m.id} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 space-y-2">
              {/* 상단: 유저 + 날짜 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {m.user_picture ? (
                    <img src={m.user_picture} className="w-6 h-6 rounded-full" alt="" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center text-xs">
                      {(m.username || '?')[0]}
                    </div>
                  )}
                  <span className="text-sm text-gray-600 dark:text-gray-400">{m.username || t('moment.me')}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isMyMoment(m) && (
                    <>
                      <button onClick={() => startEdit(m)} className="p-1 text-gray-400 hover:text-gray-600">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="p-1 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <span className="text-xs text-gray-400">
                    {new Date(m.created_at).toLocaleDateString('ko')}
                  </span>
                </div>
              </div>

              {/* 사진 */}
              {m.photo_data && (
                <img
                  src={m.photo_data}
                  alt="moment"
                  className="w-full rounded-xl object-contain max-h-96 bg-gray-50 dark:bg-gray-900 cursor-pointer"
                  onClick={() => { setSelectedImage(m.photo_data); setSelectedMoment(m); }}
                />
              )}

              {schedules.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="select select-xs select-bordered"
                    value={moveTargetById[m.id] || ''}
                    onChange={(e) => setMoveTargetById((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))}
                  >
                    <option value="">이동/복사할 일정 선택</option>
                    {schedules.filter((s) => s.id !== m.schedule_id).map((s) => (
                      <option key={s.id} value={s.id}>{s.date} · {s.title}</option>
                    ))}
                  </select>
                  <button className="btn btn-xs" onClick={() => moveTargetById[m.id] && handleCopyToSchedule(m, moveTargetById[m.id])}>복사</button>
                  <button className="btn btn-xs btn-primary" onClick={() => moveTargetById[m.id] && handleMoveToSchedule(m, moveTargetById[m.id])}>이동</button>
                </div>
              )}

              {/* 별점 + 기분 + 재방문 */}
              <div className="flex items-center gap-3 flex-wrap">
                {m.rating && (
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(v => (
                      <Star key={v} className={`w-3.5 h-3.5 ${v <= m.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                    ))}
                  </div>
                )}
                {m.mood && (
                  <span className="text-lg" title={m.mood}>
                    {MOOD_OPTIONS.find(o => o.value === m.mood)?.emoji}
                  </span>
                )}
                {m.revisit && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    m.revisit === 'yes' ? 'border-green-300 text-green-600 bg-green-50' :
                    m.revisit === 'maybe' ? 'border-yellow-300 text-yellow-600 bg-yellow-50' :
                    'border-gray-300 text-gray-500 bg-gray-50'
                  }`}>
                    {t(`moment.revisitOption.${REVISIT_OPTIONS.find(o => o.value === m.revisit)?.label}`)}
                  </span>
                )}
              </div>

              {/* 메모 */}
              {parsed.cleanNote && (
                <p className="text-sm text-gray-700 dark:text-gray-300"><AutoTranslate text={parsed.cleanNote} /></p>
              )}
            </div>
          );})}
        </div>
      )}

      {/* 사진 확대 모달 */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => { setSelectedImage(null); setSelectedMoment(null); }}
        >
          <div className="max-w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={selectedImage}
              alt={t('moment.zoomedImage')}
              className="max-w-full max-h-[70vh] rounded-xl shadow-2xl"
            />
            {selectedMoment?.note?.startsWith('촬영시각:') && (
              <div className="mt-2 bg-base-100/95 rounded-lg p-3 text-xs">
                <div>{selectedMoment.note}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
