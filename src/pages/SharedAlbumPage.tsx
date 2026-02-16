import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { plansAPI } from '../lib/api';
import { formatDateRange, formatDisplayDate, getDaysDifference } from '../lib/utils';
import { Loading } from '../components/Loading';
import { TravelMap, schedulesToMapPoints } from '../components/TravelMap';
import type { Plan, Schedule, Moment, Review } from '../store/types';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';

export function SharedAlbumPage() {
  const { planId } = useParams<{ planId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [momentsBySchedule, setMomentsBySchedule] = useState<Record<number, Moment[]>>({});
  const [reviewPhotosBySchedule, setReviewPhotosBySchedule] = useState<Record<number, Review[]>>({});

  useEffect(() => {
    if (!planId) return;
    loadAlbum(parseInt(planId, 10));
  }, [planId]);

  const loadAlbum = async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await plansAPI.getById(id);
      setPlan(data.plan);
      const sortedSchedules = [...data.schedules].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      });
      setSchedules(sortedSchedules);

      const momentsEntries = await Promise.all(
        sortedSchedules.map(async (schedule) => {
          const res = await fetch(`${API_BASE}/api/schedules/${schedule.id}/moments`);
          const json = await res.json();
          return [schedule.id, json.moments || []] as const;
        })
      );

      const reviewsEntries = await Promise.all(
        sortedSchedules.map(async (schedule) => {
          const res = await fetch(`${API_BASE}/api/schedules/${schedule.id}/reviews`);
          const json = await res.json();
          const photos = (json.reviews || []).filter((review: Review) => !!review.image_data);
          return [schedule.id, photos] as const;
        })
      );

      setMomentsBySchedule(Object.fromEntries(momentsEntries));
      setReviewPhotosBySchedule(Object.fromEntries(reviewsEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 앨범을 불러오지 못했습니다.');
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-200">
        <Loading />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="alert alert-error max-w-xl">
          <span>{error || '앨범을 찾을 수 없습니다.'}</span>
        </div>
      </div>
    );
  }

  const isPublicPlan = plan.visibility ? plan.visibility === 'public' : plan.is_public;

  if (!isPublicPlan) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card bg-base-100 shadow-xl max-w-md w-full">
          <div className="card-body text-center">
            <h2 className="card-title justify-center">🔒 비공개 여행입니다</h2>
            <p className="text-base-content/70">공개된 여행만 공유 앨범으로 볼 수 있어요.</p>
            <div className="card-actions justify-center mt-2">
              <Link to="/" className="btn btn-primary">홈으로</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const mapPoints = schedulesToMapPoints(schedules);

  return (
    <div className="min-h-screen bg-base-200">
      <main className="container mx-auto px-4 py-6 md:py-10 max-w-5xl space-y-8">
        <header className="card bg-base-100 shadow-lg">
          <div className="card-body">
            <h1 className="text-2xl md:text-3xl font-bold">{plan.title}</h1>
            <div className="text-sm md:text-base text-base-content/70 flex flex-wrap gap-3">
              <span>📅 {formatDateRange(plan.start_date, plan.end_date)}</span>
              <span>🗓 {getDaysDifference(plan.start_date, plan.end_date)}일</span>
              {plan.region && <span>📍 {plan.region}</span>}
            </div>
          </div>
        </header>

        {mapPoints.length > 0 && (
          <section className="card bg-base-100 shadow-lg">
            <div className="card-body">
              <h2 className="text-lg font-bold">🗺 여행 동선</h2>
              <TravelMap points={mapPoints} showRoute={true} height="320px" />
            </div>
          </section>
        )}

        <section className="space-y-6">
          {Object.entries(groupedSchedules)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, daySchedules]) => (
              <article key={date} className="card bg-base-100 shadow-md">
                <div className="card-body space-y-4">
                  <h2 className="text-lg md:text-xl font-bold border-b border-base-300 pb-2">
                    Day {getDaysDifference(plan.start_date, date) + 1} · {formatDisplayDate(date)}
                  </h2>

                  <div className="space-y-4">
                    {daySchedules.map((schedule) => {
                      const moments = momentsBySchedule[schedule.id] || [];
                      const reviewPhotos = reviewPhotosBySchedule[schedule.id] || [];

                      return (
                        <div key={schedule.id} className="border border-base-300 rounded-xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {schedule.time && <span className="badge badge-primary badge-outline">{schedule.time}</span>}
                            <span className="font-semibold text-base">{schedule.title}</span>
                            {schedule.place && <span className="text-base-content/70">📍 {schedule.place}</span>}
                          </div>

                          {moments.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">📸 순간 기록</p>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {moments.map((moment) => (
                                  <div key={moment.id} className="bg-base-200 rounded-lg p-2 text-sm space-y-1">
                                    {moment.photo_data && (
                                      <img src={moment.photo_data} alt="순간 사진" className="w-full h-28 object-cover rounded" />
                                    )}
                                    {moment.note && <p className="text-base-content/80">{moment.note}</p>}
                                    <div className="text-xs text-base-content/60">{moment.mood ? `기분: ${moment.mood}` : ''}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {reviewPhotos.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">🖼 리뷰 사진</p>
                              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                                {reviewPhotos.map((review) => (
                                  <img
                                    key={review.id}
                                    src={review.image_data}
                                    alt="리뷰 사진"
                                    className="w-full aspect-square object-cover rounded-lg border border-base-300"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </article>
            ))}
        </section>

        <div className="py-6 text-center">
          <Link to="/" className="btn btn-primary btn-wide">나도 Travly로 여행 계획 만들기</Link>
        </div>
      </main>
    </div>
  );
}
