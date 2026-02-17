import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDateRange, formatDisplayDate, getDaysDifference } from '../lib/utils';
import { Loading } from '../components/Loading';
import { TravelMap, schedulesToMapPoints } from '../components/TravelMap';
import type { Plan, Schedule, Moment } from '../store/types';
import { MapPin, Calendar, Star, X } from 'lucide-react';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';

const MOOD_MAP: Record<string, string> = {
  amazing: '😍', good: '😊', okay: '😐', meh: '😑', bad: '😢',
};

const REVISIT_MAP: Record<string, string> = {
  yes: '꼭 다시!', no: '한번이면 충분', maybe: '글쎄...',
};

export function SharedAlbumPage() {
  const { planId } = useParams<{ planId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [momentsBySchedule, setMomentsBySchedule] = useState<Record<number, Moment[]>>({});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) return;
    loadAlbum(parseInt(planId, 10));
  }, [planId]);

  const loadAlbum = async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/plans/${id}/album`);
      if (!res.ok) throw new Error('앨범을 불러올 수 없습니다');
      const data = await res.json();

      setPlan(data.plan);
      setSchedules(data.schedules || []);

      // Group moments by schedule_id
      const grouped: Record<number, Moment[]> = {};
      for (const m of data.moments || []) {
        if (!grouped[m.schedule_id]) grouped[m.schedule_id] = [];
        grouped[m.schedule_id].push(m);
      }
      setMomentsBySchedule(grouped);
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 앨범을 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const groupedSchedules = useMemo(() => {
    return schedules.reduce((acc, schedule) => {
      if (!acc[schedule.date]) acc[schedule.date] = [];
      acc[schedule.date].push(schedule);
      return acc;
    }, {} as Record<string, Schedule[]>);
  }, [schedules]);

  // Collect all photos for gallery header
  const allPhotos = useMemo(() => {
    const photos: { src: string; title: string }[] = [];
    schedules.forEach((s) => {
      (momentsBySchedule[s.id] || []).forEach((m) => {
        if (m.photo_data) photos.push({ src: m.photo_data, title: s.title });
      });
    });
    return photos;
  }, [schedules, momentsBySchedule]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card bg-base-100 shadow-xl max-w-md w-full">
          <div className="card-body text-center">
            <p className="text-4xl mb-2">😢</p>
            <h2 className="card-title justify-center">앨범을 찾을 수 없어요</h2>
            <p className="text-base-content/70">{error || '존재하지 않는 여행입니다'}</p>
            <div className="card-actions justify-center mt-2">
              <Link to="/" className="btn btn-primary">홈으로</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 앨범 뷰는 항상 공개 (visibility 무관)

  const mapPoints = schedulesToMapPoints(schedules);
  const totalDays = getDaysDifference(plan.start_date, plan.end_date);

  return (
    <div className="min-h-screen bg-base-200">
      <main className="container mx-auto px-4 py-6 md:py-10 max-w-4xl space-y-6">
        {/* Hero Header */}
        <header className="card bg-base-100 shadow-lg overflow-hidden">
          {/* Photo strip at top if photos exist */}
          {allPhotos.length > 0 && (
            <div className="flex h-32 md:h-40 overflow-hidden">
              {allPhotos.slice(0, 5).map((p, i) => (
                <img
                  key={i}
                  src={p.src}
                  alt={p.title}
                  className="flex-1 object-cover min-w-0 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setSelectedImage(p.src)}
                />
              ))}
            </div>
          )}
          <div className="card-body">
            <h1 className="text-2xl md:text-3xl font-bold">{plan.title}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-base-content/70">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" /> {formatDateRange(plan.start_date, plan.end_date)}
              </span>
              <span className="font-medium">{totalDays}일</span>
              {plan.region && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" /> {plan.region}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Map */}
        {mapPoints.length > 0 && (
          <section className="card bg-base-100 shadow-lg">
            <div className="card-body p-3 md:p-6">
              <h2 className="text-lg font-bold mb-2">🗺️ 여행 동선</h2>
              <TravelMap points={mapPoints} showRoute={true} height="280px" />
            </div>
          </section>
        )}

        {/* Timeline by day */}
        <section className="space-y-4">
          {Object.entries(groupedSchedules)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, daySchedules]) => {
              const dayNum = getDaysDifference(plan.start_date, date) + 1;
              return (
                <article key={date} className="card bg-base-100 shadow-md">
                  <div className="card-body space-y-3 p-4 md:p-6">
                    <h2 className="text-lg font-bold border-b border-base-300 pb-2">
                      Day {dayNum} · {formatDisplayDate(date)}
                    </h2>

                    <div className="space-y-4">
                      {daySchedules.map((schedule) => {
                        const moments = momentsBySchedule[schedule.id] || [];
                        const photos = moments.filter((m) => m.photo_data);

                        return (
                          <div key={schedule.id} className="space-y-2">
                            {/* Schedule info */}
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {schedule.time && (
                                <span className="badge badge-primary badge-outline badge-sm">{schedule.time}</span>
                              )}
                              <span className="font-semibold">{schedule.title}</span>
                              {schedule.place && (
                                <span className="text-base-content/60 text-xs">📍 {schedule.place}</span>
                              )}
                            </div>

                            {/* Photo grid */}
                            {photos.length > 0 && (
                              <div className={`grid gap-1.5 ${
                                photos.length === 1 ? 'grid-cols-1' :
                                photos.length === 2 ? 'grid-cols-2' :
                                'grid-cols-2 md:grid-cols-3'
                              }`}>
                                {photos.map((m) => (
                                  <img
                                    key={m.id}
                                    src={m.photo_data!}
                                    alt=""
                                    className="w-full rounded-xl object-contain max-h-96 bg-gray-50 dark:bg-gray-900 cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => setSelectedImage(m.photo_data)}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Moments without photos */}
                            {moments.filter((m) => !m.photo_data && (m.note || m.mood || m.rating)).length > 0 && (
                              <div className="space-y-1.5">
                                {moments
                                  .filter((m) => !m.photo_data && (m.note || m.mood || m.rating))
                                  .map((m) => (
                                    <div key={m.id} className="flex items-start gap-2 text-sm bg-base-200/50 rounded-lg px-3 py-2">
                                      {m.mood && <span className="text-lg flex-shrink-0">{MOOD_MAP[m.mood] || ''}</span>}
                                      <div className="min-w-0 flex-1">
                                        {m.rating && (
                                          <div className="flex gap-0.5 mb-0.5">
                                            {[1, 2, 3, 4, 5].map((v) => (
                                              <Star key={v} className={`w-3 h-3 ${v <= m.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                            ))}
                                          </div>
                                        )}
                                        {m.note && <p className="text-base-content/80">{m.note}</p>}
                                        {m.revisit && (
                                          <span className="text-xs text-base-content/50">{REVISIT_MAP[m.revisit] || ''}</span>
                                        )}
                                      </div>
                                      {m.username && (
                                        <span className="text-xs text-base-content/40 flex-shrink-0">{m.username}</span>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            )}

                            {/* Photo moments with notes */}
                            {photos.filter((m) => m.note || m.mood || m.rating).length > 0 && (
                              <div className="space-y-1">
                                {photos
                                  .filter((m) => m.note || m.mood || m.rating)
                                  .map((m) => (
                                    <div key={`note-${m.id}`} className="flex items-center gap-2 text-sm text-base-content/70 pl-1">
                                      {m.mood && <span>{MOOD_MAP[m.mood]}</span>}
                                      {m.rating && (
                                        <div className="flex gap-0.5">
                                          {[1, 2, 3, 4, 5].map((v) => (
                                            <Star key={v} className={`w-3 h-3 ${v <= m.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                          ))}
                                        </div>
                                      )}
                                      {m.note && <span className="truncate">{m.note}</span>}
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
        </section>

        {/* CTA */}
        <div className="py-6 text-center">
          <Link to="/" className="btn btn-primary btn-wide">나도 Travly로 여행 계획 만들기</Link>
        </div>
      </main>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setSelectedImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
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
