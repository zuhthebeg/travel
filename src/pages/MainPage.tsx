import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI, schedulesAPI } from '../lib/api';
import { getTempUserId, formatDate, getCountryFlag, extractCountryFromRegion } from '../lib/utils';
import { PlanCard } from '../components/PlanCard';
import { GlobalNav } from '../components/GlobalNav';
import { TravelMap, type MapPoint } from '../components/TravelMap';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import type { Plan, Schedule } from '../store/types';
import { Globe, Map as MapIcon, Calendar, Clock } from 'lucide-react';

interface PlanWithSchedules extends Plan {
  schedules?: Schedule[];
}

export function MainPage() {
  const navigate = useNavigate();
  const { plans, setPlans, currentUser } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [plansWithSchedules, setPlansWithSchedules] = useState<PlanWithSchedules[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  
  // 시간 슬라이더 상태 (0 = 현재, 음수 = 과거 일수, 양수 = 미래 일수)
  const [timeOffset, setTimeOffset] = useState(0);
  const TIME_RANGE = 180; // ±180일 범위

  useEffect(() => {
    loadPublicPlans();
  }, []);

  const loadPublicPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const publicPlans = await plansAPI.getAll({ is_public: true });
      setPlans(publicPlans);

      // 각 여행의 일정(좌표) 로드
      const plansWithData: PlanWithSchedules[] = await Promise.all(
        publicPlans.map(async (plan) => {
          try {
            const schedules = await schedulesAPI.getByPlanId(plan.id);
            return { ...plan, schedules };
          } catch {
            return { ...plan, schedules: [] };
          }
        })
      );
      setPlansWithSchedules(plansWithData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '여행 목록을 불러오는데 실패했습니다.');
      console.error('Failed to load plans:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 최신순 정렬 및 10개 제한
  const sortedPlans = useMemo(() => {
    return [...plansWithSchedules]
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
      .slice(0, 10);
  }, [plansWithSchedules]);

  // 시간 필터링된 여행 (슬라이더 기준 ±30일 범위)
  const filteredPlansByTime = useMemo(() => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + timeOffset);
    
    return sortedPlans.filter((plan) => {
      const start = new Date(plan.start_date);
      const end = new Date(plan.end_date);
      // 여행 기간이 타겟 날짜 ±30일 범위와 겹치는지 확인
      const rangeStart = new Date(targetDate);
      rangeStart.setDate(rangeStart.getDate() - 30);
      const rangeEnd = new Date(targetDate);
      rangeEnd.setDate(rangeEnd.getDate() + 30);
      
      return !(end < rangeStart || start > rangeEnd);
    });
  }, [sortedPlans, timeOffset]);

  // 지도 포인트 생성 (시간 필터링 적용)
  const allMapPoints = useMemo((): MapPoint[] => {
    const points: MapPoint[] = [];
    
    filteredPlansByTime.forEach((plan) => {
      if (!plan.schedules) return;
      
      // 선택된 여행만 표시하거나, 선택 없으면 전체 표시
      if (selectedPlanId && plan.id !== selectedPlanId) return;
      
      plan.schedules.forEach((schedule) => {
        if (schedule.latitude && schedule.longitude) {
          const countryInfo = extractCountryFromRegion(plan.region);
          points.push({
            id: schedule.id,
            lat: schedule.latitude,
            lng: schedule.longitude,
            title: `${getCountryFlag(countryInfo?.code)} ${plan.title}`,
            place: schedule.title,
            date: schedule.date,
            order: schedule.order_index,
          });
        }
      });
    });
    
    return points;
  }, [filteredPlansByTime, selectedPlanId]);

  // 슬라이더용 현재 타겟 날짜
  const targetDateLabel = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + timeOffset);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  }, [timeOffset]);

  // 국가별 여행 통계
  const countryStats = useMemo(() => {
    const stats = new Map<string, { count: number; flag: string; name: string }>();
    
    plansWithSchedules.forEach((plan) => {
      const countryInfo = extractCountryFromRegion(plan.region);
      if (countryInfo) {
        const existing = stats.get(countryInfo.code) || { count: 0, flag: getCountryFlag(countryInfo.code), name: countryInfo.name };
        existing.count++;
        stats.set(countryInfo.code, existing);
      }
    });
    
    return Array.from(stats.values()).sort((a, b) => b.count - a.count);
  }, [plansWithSchedules]);

  const handleImportPlan = async (plan: Plan) => {
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (isImporting) return;

    try {
      setIsImporting(true);

      const today = new Date();
      const oneWeekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const originalStartDate = new Date(plan.start_date);
      const originalEndDate = new Date(plan.end_date);
      const tripDuration = originalEndDate.getTime() - originalStartDate.getTime();

      const newStartDate = formatDate(oneWeekLater);
      const newEndDate = formatDate(new Date(oneWeekLater.getTime() + tripDuration));

      const newPlan = await plansAPI.create({
        title: `${plan.title} (복사본)`,
        region: plan.region || undefined,
        start_date: newStartDate,
        end_date: newEndDate,
        is_public: false,
        thumbnail: plan.thumbnail || '',
        user_id: getTempUserId(),
      });

      const originalSchedules = await schedulesAPI.getByPlanId(plan.id);
      const dateOffset = oneWeekLater.getTime() - originalStartDate.getTime();

      for (const schedule of originalSchedules) {
        const originalDate = new Date(schedule.date);
        const newDate = new Date(originalDate.getTime() + dateOffset);

        await schedulesAPI.create({
          plan_id: newPlan.id,
          date: formatDate(newDate),
          time: schedule.time || undefined,
          title: schedule.title,
          place: schedule.place || undefined,
          memo: schedule.memo || undefined,
          plan_b: schedule.plan_b || undefined,
          plan_c: schedule.plan_c || undefined,
          order_index: schedule.order_index,
          latitude: schedule.latitude || undefined,
          longitude: schedule.longitude || undefined,
        });
      }

      alert('여행이 성공적으로 가져와졌습니다!');
      navigate('/my');
    } catch (err) {
      console.error('Failed to import plan:', err);
      alert('여행을 가져오는데 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleMapPointClick = (point: MapPoint) => {
    // 해당 일정의 여행을 찾아서 상세 페이지로 이동
    const plan = plansWithSchedules.find(p => 
      p.schedules?.some(s => s.id === point.id)
    );
    if (plan) {
      navigate(`/plan/${plan.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Global Navigation */}
      <GlobalNav />

      {/* Loading overlay when importing */}
      {isImporting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-base-100 p-8 rounded-lg shadow-xl flex flex-col items-center gap-4">
            <Loading />
            <p className="text-lg font-medium">여행을 가져오는 중...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Hero Section with Map */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Globe className="w-6 h-6" /> 세계의 여행
              </h2>
              <p className="text-base-content/70">
                최신 {sortedPlans.length}개 | {filteredPlansByTime.length}개 표시 중
              </p>
            </div>
            
            <Button variant="primary" size="sm" onClick={() => navigate('/plan/new')}>
              + 새 여행
            </Button>
          </div>

          {/* Country Stats */}
          {countryStats.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {countryStats.slice(0, 10).map((stat) => (
                <div 
                  key={stat.name}
                  className="badge badge-lg gap-1 cursor-pointer hover:badge-primary transition-colors"
                  onClick={() => setSelectedPlanId(null)}
                >
                  <span className="text-lg">{stat.flag}</span>
                  <span>{stat.name}</span>
                  <span className="badge badge-sm">{stat.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Map View */}
          <div className="card bg-base-100 shadow-xl overflow-hidden">
            {isLoading ? (
              <div className="h-[400px] flex items-center justify-center">
                <Loading />
              </div>
            ) : allMapPoints.length > 0 ? (
              <TravelMap
                points={allMapPoints}
                showRoute={!!selectedPlanId}
                height="400px"
                onPointClick={handleMapPointClick}
              />
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-base-content/50">
                <MapIcon className="w-16 h-16 mb-4" />
                <p>이 기간에 여행이 없습니다</p>
                <p className="text-sm mt-2">슬라이더를 움직여 다른 시간대를 확인해보세요</p>
              </div>
            )}

            {/* Time Slider */}
            <div className="p-4 bg-base-200 border-t">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">시간 여행</span>
                <span className="badge badge-primary badge-sm">{targetDateLabel}</span>
                {timeOffset !== 0 && (
                  <button 
                    className="btn btn-xs btn-ghost"
                    onClick={() => setTimeOffset(0)}
                  >
                    오늘로
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-base-content/50 w-16 text-right">
                  {(() => {
                    const d = new Date();
                    d.setDate(d.getDate() - TIME_RANGE);
                    return d.toLocaleDateString('ko-KR', { month: 'short' });
                  })()}
                </span>
                <input
                  type="range"
                  min={-TIME_RANGE}
                  max={TIME_RANGE}
                  value={timeOffset}
                  onChange={(e) => setTimeOffset(parseInt(e.target.value))}
                  className="range range-primary range-sm flex-1"
                />
                <span className="text-xs text-base-content/50 w-16">
                  {(() => {
                    const d = new Date();
                    d.setDate(d.getDate() + TIME_RANGE);
                    return d.toLocaleDateString('ko-KR', { month: 'short' });
                  })()}
                </span>
              </div>
              <div className="flex justify-between mt-1 text-xs text-base-content/40 px-16">
                <span>과거</span>
                <span>|</span>
                <span>미래</span>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Filter (when a plan is selected) */}
        {selectedPlanId && (
          <div className="alert mb-4">
            <span>선택된 여행만 표시 중</span>
            <button 
              className="btn btn-sm btn-ghost"
              onClick={() => setSelectedPlanId(null)}
            >
              전체 보기
            </button>
          </div>
        )}

        {/* 최신 여행 카드 (가로 스크롤) */}
        {!isLoading && sortedPlans.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> 최신 여행
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
              {sortedPlans.map((plan) => (
                <div 
                  key={plan.id}
                  className={`flex-shrink-0 w-72 snap-start transition-all ${selectedPlanId === plan.id ? 'ring-2 ring-primary rounded-2xl' : ''}`}
                  onMouseEnter={() => setSelectedPlanId(plan.id)}
                  onMouseLeave={() => setSelectedPlanId(null)}
                >
                  <PlanCard
                    plan={plan}
                    showImportButton={!!currentUser}
                    onImport={handleImportPlan}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="alert alert-error">
            <div>
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </div>
            <div className="flex-none">
              <Button variant="ghost" size="sm" onClick={loadPublicPlans}>
                다시 시도
              </Button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && plans.length === 0 && (
          <div className="card bg-base-100 shadow-xl p-12 text-center">
            <div className="card-body items-center text-center">
              <p className="text-lg mb-4">
                아직 공개된 여행 계획이 없습니다
              </p>
              <div className="card-actions">
                <Button variant="primary" onClick={() => navigate('/plan/new')}>
                  첫 번째 여행 만들기
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer footer-center p-6 bg-base-100 text-base-content mt-12">
        <div>
          <p className="text-sm opacity-70">
            © 2026 Travly - AI Travel Assistant
          </p>
        </div>
      </footer>
    </div>
  );
}
