import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Star, MapPin, Calendar, Grid3X3, List, Image } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TimelineMoment {
  id: number;
  schedule_id: number;
  user_id: number;
  photo_data: string | null;
  note: string | null;
  mood: string | null;
  rating: number | null;
  revisit: string | null;
  username?: string;
  user_picture?: string;
  created_at: string;
  schedule_title: string;
  schedule_place: string | null;
  schedule_date: string;
  plan_id: number;
  plan_title: string;
  plan_region: string | null;
}

const MOOD_MAP: Record<string, string> = {
  amazing: '😍', good: '😊', okay: '😐', meh: '😑', bad: '😢',
};

const REVISIT_MAP: Record<string, string> = {
  yes: 'yes', no: 'no', maybe: 'maybe',
};

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';

type ViewType = 'timeline' | 'grid' | 'photos';

interface AlbumTimelineProps {
  pastPlanIds?: Set<number>;
}

export default function AlbumTimeline({ pastPlanIds }: AlbumTimelineProps) {
  const { t } = useTranslation();
  const { currentUser } = useStore();
  const navigate = useNavigate();
  const [moments, setMoments] = useState<TimelineMoment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [view, setView] = useState<ViewType>('timeline');

  useEffect(() => {
    if (!currentUser) return;
    loadMoments();
  }, [currentUser]);

  const loadMoments = async () => {
    setIsLoading(true);
    try {
      const credential =
        localStorage.getItem('X-Auth-Credential') ||
        localStorage.getItem('google_credential') || '';
      const res = await fetch(`${API_BASE}/api/my/moments`, {
        headers: credential ? { 'X-Auth-Credential': credential } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setMoments(data.moments || []);
      }
    } catch (e) {
      console.error('Failed to load album:', e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="text-center py-16 text-base-content/50">
        <p className="text-4xl mb-3">📸</p>
        <p className="text-lg mb-1">{t('album.myAlbum')}</p>
        <p className="text-sm">{t('album.loginHint')}</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-16"><span className="loading loading-spinner loading-md text-orange-500" /></div>;
  }

  // 끝난 여행만 필터
  const filteredMoments = pastPlanIds && pastPlanIds.size > 0
    ? moments.filter(m => pastPlanIds.has(m.plan_id))
    : moments;

  if (filteredMoments.length === 0) {
    return (
      <div className="text-center py-16 text-base-content/50">
        <p className="text-4xl mb-3">📸</p>
        <p className="text-lg mb-1">{pastPlanIds ? t('album.noCompleted') : t('album.noRecords')}</p>
        <p className="text-sm">{t('album.leaveMoment')}</p>
      </div>
    );
  }

  // 여행별 그룹핑
  const grouped = filteredMoments.reduce<Record<number, { plan: { id: number; title: string; region: string | null }; moments: TimelineMoment[] }>>((acc, m) => {
    if (!acc[m.plan_id]) {
      acc[m.plan_id] = {
        plan: { id: m.plan_id, title: m.plan_title, region: m.plan_region },
        moments: [],
      };
    }
    acc[m.plan_id].moments.push(m);
    return acc;
  }, {});

  // 사진만 필터
  const allPhotos = filteredMoments.filter(m => m.photo_data);

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">{t('album.header', { count: filteredMoments.length })}</h3>
        <div className="flex bg-base-200 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setView('timeline')}
            className={`p-1.5 rounded-md transition-colors ${view === 'timeline' ? 'bg-base-100 shadow-sm' : 'hover:bg-base-300'}`}
            title={t('album.timeline')}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('grid')}
            className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-base-100 shadow-sm' : 'hover:bg-base-300'}`}
            title={t('album.grid')}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('photos')}
            className={`p-1.5 rounded-md transition-colors ${view === 'photos' ? 'bg-base-100 shadow-sm' : 'hover:bg-base-300'}`}
            title={t('album.photosOnly')}
          >
            <Image className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* === Photos Only View === */}
      {view === 'photos' && (
        allPhotos.length === 0 ? (
          <p className="text-center text-base-content/40 py-8 text-sm">{t('album.noPhotos')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {allPhotos.map(m => (
              <div key={m.id} className="relative group">
                <img
                  src={m.photo_data!}
                  alt=""
                  className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setSelectedImage(m.photo_data)}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white truncate">{m.schedule_title}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* === Grid View === */}
      {view === 'grid' && (
        <div className="grid grid-cols-2 gap-3">
          {moments.map(m => (
            <div
              key={m.id}
              className="bg-base-100 rounded-xl border border-base-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/plans/${m.plan_id}`)}
            >
              {m.photo_data ? (
                <img
                  src={m.photo_data}
                  alt=""
                  className="w-full h-28 object-cover"
                  onClick={e => { e.stopPropagation(); setSelectedImage(m.photo_data); }}
                />
              ) : (
                <div className="w-full h-16 bg-gradient-to-br from-orange-100 to-amber-50 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                  {m.mood ? <span className="text-2xl">{MOOD_MAP[m.mood]}</span> : <span className="text-xl">📝</span>}
                </div>
              )}
              <div className="p-2.5 space-y-1">
                <p className="text-sm font-medium truncate">{m.schedule_title}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-base-content/50">
                  <Calendar className="w-3 h-3" />
                  <span>{m.schedule_date}</span>
                  {m.schedule_place && (
                    <>
                      <span>·</span>
                      <span className="truncate">📍{m.schedule_place}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {m.rating && (
                    <div className="flex gap-px">
                      {[1, 2, 3, 4, 5].map(v => (
                        <Star key={v} className={`w-3 h-3 ${v <= m.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                      ))}
                    </div>
                  )}
                  {m.mood && <span className="text-sm">{MOOD_MAP[m.mood]}</span>}
                  {m.revisit && (
                    <span className={`text-[9px] px-1 py-px rounded-full ${
                      m.revisit === 'yes' ? 'bg-green-100 text-green-600' :
                      m.revisit === 'maybe' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>{t(`album.revisit.${REVISIT_MAP[m.revisit]}`)}</span>
                  )}
                </div>
                {m.note && <p className="text-xs text-base-content/60 line-clamp-2">{m.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === Timeline View (grouped by plan) === */}
      {view === 'timeline' && Object.values(grouped).map(({ plan, moments: planMoments }) => (
        <div key={plan.id} className="space-y-3">
          {/* 여행 헤더 */}
          <button
            onClick={() => navigate(`/plans/${plan.id}`)}
            className="flex items-center gap-2 hover:text-orange-600 transition-colors group"
          >
            <h3 className="font-bold text-base group-hover:underline">{plan.title}</h3>
            {plan.region && (
              <span className="text-xs text-base-content/50 flex items-center gap-0.5">
                <MapPin className="w-3 h-3" /> {plan.region}
              </span>
            )}
            <span className="text-xs text-base-content/40">({planMoments.length})</span>
          </button>

          {/* 타임라인 카드 — 세로 리스트 */}
          <div className="space-y-2 pl-3 border-l-2 border-orange-200 dark:border-orange-900">
            {planMoments.map((m) => (
              <div key={m.id} className="relative">
                {/* 타임라인 도트 */}
                <div className="absolute -left-[calc(0.75rem+5px)] top-3 w-2 h-2 rounded-full bg-orange-400" />

                <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden shadow-sm">
                  {m.photo_data && (
                    <img
                      src={m.photo_data}
                      alt=""
                      className="w-full h-40 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setSelectedImage(m.photo_data)}
                    />
                  )}
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{m.schedule_title}</span>
                      <span className="text-[10px] text-base-content/40">{m.schedule_date}</span>
                    </div>
                    {m.schedule_place && (
                      <p className="text-xs text-base-content/50">📍 {m.schedule_place}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.rating && (
                        <div className="flex gap-px">
                          {[1, 2, 3, 4, 5].map(v => (
                            <Star key={v} className={`w-3 h-3 ${v <= m.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                          ))}
                        </div>
                      )}
                      {m.mood && <span className="text-base">{MOOD_MAP[m.mood]}</span>}
                      {m.revisit && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          m.revisit === 'yes' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                          m.revisit === 'maybe' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}>{t(`album.revisit.${REVISIT_MAP[m.revisit]}`)}</span>
                      )}
                    </div>
                    {m.note && <p className="text-sm text-base-content/70">{m.note}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 사진 확대 모달 */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt=""
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
