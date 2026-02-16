import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Star, MapPin, Calendar } from 'lucide-react';

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

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';

export default function AlbumTimeline() {
  const { currentUser } = useStore();
  const navigate = useNavigate();
  const [moments, setMoments] = useState<TimelineMoment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

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
        <p className="text-lg mb-2">📸 내 앨범</p>
        <p className="text-sm">로그인하면 여행 기록을 모아볼 수 있어요</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-16"><span className="loading loading-spinner loading-md text-orange-500" /></div>;
  }

  if (moments.length === 0) {
    return (
      <div className="text-center py-16 text-base-content/50">
        <p className="text-4xl mb-3">📸</p>
        <p className="text-lg mb-1">아직 기록이 없어요</p>
        <p className="text-sm">여행 일정에서 순간을 남겨보세요</p>
      </div>
    );
  }

  // 여행별 그룹핑
  const grouped = moments.reduce<Record<number, { plan: { id: number; title: string; region: string | null }; moments: TimelineMoment[] }>>((acc, m) => {
    if (!acc[m.plan_id]) {
      acc[m.plan_id] = {
        plan: { id: m.plan_id, title: m.plan_title, region: m.plan_region },
        moments: [],
      };
    }
    acc[m.plan_id].moments.push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.values(grouped).map(({ plan, moments: planMoments }) => (
        <div key={plan.id}>
          {/* 여행 헤더 */}
          <button
            onClick={() => navigate(`/plans/${plan.id}`)}
            className="flex items-center gap-2 mb-3 hover:text-orange-600 transition-colors"
          >
            <h3 className="font-bold text-base">{plan.title}</h3>
            {plan.region && (
              <span className="text-xs text-base-content/50 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {plan.region}
              </span>
            )}
          </button>

          {/* 가로 스크롤 카드 */}
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
            {planMoments.map((m) => (
              <div
                key={m.id}
                className="snap-start flex-shrink-0 w-56 bg-base-100 rounded-xl border border-base-200 overflow-hidden shadow-sm"
              >
                {/* 사진 */}
                {m.photo_data ? (
                  <img
                    src={m.photo_data}
                    alt=""
                    className="w-full h-36 object-cover cursor-pointer"
                    onClick={() => setSelectedImage(m.photo_data)}
                  />
                ) : (
                  <div className="w-full h-20 bg-gradient-to-br from-orange-100 to-orange-50 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                    {m.mood ? <span className="text-3xl">{MOOD_MAP[m.mood]}</span> : <span className="text-2xl">📝</span>}
                  </div>
                )}

                <div className="p-3 space-y-1.5">
                  {/* 일정 제목 */}
                  <p className="text-sm font-medium truncate">{m.schedule_title}</p>

                  {/* 날짜 + 장소 */}
                  <div className="flex items-center gap-2 text-[10px] text-base-content/50">
                    <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" /> {m.schedule_date}</span>
                    {m.schedule_place && <span className="truncate">📍 {m.schedule_place}</span>}
                  </div>

                  {/* 별점 + 기분 */}
                  <div className="flex items-center gap-2">
                    {m.rating && (
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(v => (
                          <Star key={v} className={`w-3 h-3 ${v <= m.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                        ))}
                      </div>
                    )}
                    {m.mood && <span className="text-sm">{MOOD_MAP[m.mood]}</span>}
                  </div>

                  {/* 메모 */}
                  {m.note && (
                    <p className="text-xs text-base-content/60 line-clamp-2">{m.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 사진 확대 */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img src={selectedImage} alt="" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
