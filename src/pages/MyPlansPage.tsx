import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI as rawPlansAPI } from '../lib/api';
import { offlinePlansAPI } from '../lib/offlineAPI';

const plansAPI = localStorage.getItem('offline_mode') === 'true' ? offlinePlansAPI : rawPlansAPI;
import type { Plan } from '../store/types';
import { PlanCard } from '../components/PlanCard';
import { GlobalNav } from '../components/GlobalNav';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import LoginModal from '../components/LoginModal';

type OwnerFilter = 'all' | 'mine' | 'shared';
type TimeFilter = 'all' | 'upcoming' | 'past' | 'ongoing';
type RegionFilter = 'all' | 'domestic' | 'international';

export function MyPlansPage() {
  const navigate = useNavigate();
  const { currentUser } = useStore();
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'upcoming'>('newest');

  useEffect(() => {
    if (!currentUser) {
      setShowLoginModal(true);
      setIsLoading(false);
      return;
    }
    loadMyPlans();
  }, [currentUser]);

  const loadMyPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const plans = await plansAPI.getAll({ mine: true });
      setAllPlans(plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : '내 여행을 불러오는데 실패했습니다.');
      console.error('Failed to load my plans:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const filteredPlans = useMemo(() => {
    let result = [...allPlans];

    // Owner filter
    if (ownerFilter === 'mine') result = result.filter(p => p.access_type !== 'shared');
    if (ownerFilter === 'shared') result = result.filter(p => p.access_type === 'shared');

    // Time filter
    if (timeFilter === 'upcoming') result = result.filter(p => p.start_date > today);
    if (timeFilter === 'ongoing') result = result.filter(p => p.start_date <= today && p.end_date >= today);
    if (timeFilter === 'past') result = result.filter(p => p.end_date < today);

    // Region filter (KR = 국내)
    if (regionFilter === 'domestic') result = result.filter(p => {
      const r = (p.region || '').toLowerCase();
      return r.includes('한국') || r.includes('korea') || r.includes('서울') || r.includes('부산') || r.includes('제주') || r.includes('대구') || r.includes('인천') || (p.country_code || '').toUpperCase() === 'KR';
    });
    if (regionFilter === 'international') result = result.filter(p => {
      const r = (p.region || '').toLowerCase();
      const isKR = r.includes('한국') || r.includes('korea') || r.includes('서울') || r.includes('부산') || r.includes('제주') || r.includes('대구') || r.includes('인천') || (p.country_code || '').toUpperCase() === 'KR';
      return !isKR;
    });

    // Sort
    if (sortOrder === 'newest') result.sort((a, b) => b.start_date.localeCompare(a.start_date));
    if (sortOrder === 'oldest') result.sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (sortOrder === 'upcoming') result.sort((a, b) => {
      const aDiff = Math.abs(new Date(a.start_date).getTime() - Date.now());
      const bDiff = Math.abs(new Date(b.start_date).getTime() - Date.now());
      return aDiff - bDiff;
    });

    return result;
  }, [allPlans, ownerFilter, timeFilter, regionFilter, sortOrder, today]);

  const sharedCount = allPlans.filter(p => p.access_type === 'shared').length;
  const myCount = allPlans.length - sharedCount;
  const upcomingCount = allPlans.filter(p => p.start_date > today).length;
  const ongoingCount = allPlans.filter(p => p.start_date <= today && p.end_date >= today).length;
  const pastCount = allPlans.filter(p => p.end_date < today).length;

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    loadMyPlans();
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Global Navigation */}
      <GlobalNav />

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          navigate('/');
        }}
        onSuccess={handleLoginSuccess}
        title="로그인이 필요합니다"
        message="내 여행을 관리하려면 Google 계정으로 로그인해주세요."
      />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Page Title + Filters */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold">📋 내 여행</h2>
              <p className="text-sm text-base-content/60">{filteredPlans.length}개 여행</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate('/plan/new')}>+ 새 여행</Button>
          </div>

          {currentUser && allPlans.length > 0 && (
            <div className="space-y-2">
              {/* 시간 필터 */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  { key: 'all', label: '전체', count: allPlans.length },
                  { key: 'ongoing', label: '🟢 여행 중', count: ongoingCount },
                  { key: 'upcoming', label: '📅 다가오는', count: upcomingCount },
                  { key: 'past', label: '✅ 다녀온', count: pastCount },
                ] as const).map(f => f.count > 0 || f.key === 'all' ? (
                  <button
                    key={f.key}
                    className={`btn btn-xs ${timeFilter === f.key ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setTimeFilter(f.key)}
                  >
                    {f.label} {f.count > 0 && <span className="badge badge-xs ml-0.5">{f.count}</span>}
                  </button>
                ) : null)}
              </div>

              {/* 소유/지역/정렬 */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {sharedCount > 0 && (
                  <select
                    className="select select-xs select-bordered"
                    value={ownerFilter}
                    onChange={e => setOwnerFilter(e.target.value as OwnerFilter)}
                  >
                    <option value="all">전체 ({allPlans.length})</option>
                    <option value="mine">내 여행 ({myCount})</option>
                    <option value="shared">공유받음 ({sharedCount})</option>
                  </select>
                )}
                <select
                  className="select select-xs select-bordered"
                  value={regionFilter}
                  onChange={e => setRegionFilter(e.target.value as RegionFilter)}
                >
                  <option value="all">🌍 전체</option>
                  <option value="domestic">🇰🇷 국내</option>
                  <option value="international">✈️ 해외</option>
                </select>
                <select
                  className="select select-xs select-bordered"
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value as 'newest' | 'oldest' | 'upcoming')}
                >
                  <option value="newest">최신순</option>
                  <option value="oldest">오래된순</option>
                  <option value="upcoming">임박순</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {!currentUser ? (
          <div className="card bg-base-100 shadow-xl p-12 text-center">
            <div className="card-body items-center text-center">
              <div className="mb-6">
                <svg className="w-24 h-24 mx-auto text-base-content/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-3">로그인이 필요합니다</h2>
              <p className="text-base-content/70 mb-6">
                내 여행을 관리하려면 Google 계정으로 로그인해주세요.
              </p>
              <Button variant="primary" onClick={() => setShowLoginModal(true)}>
                로그인하기
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <Loading />
        ) : error ? (
          <div className="alert alert-error">
            <div>
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </div>
            <div className="flex-none">
              <Button variant="ghost" size="sm" onClick={loadMyPlans}>
                다시 시도
              </Button>
            </div>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="card bg-base-100 shadow-xl p-12 text-center">
            <div className="card-body items-center text-center">
              <p className="text-lg mb-4">
                아직 여행 계획이 없습니다
              </p>
              <p className="text-base-content/70 mb-6">
                새로운 여행을 만들어보세요!
              </p>
              <div className="card-actions">
                <Button variant="primary" onClick={() => navigate('/plan/new')}>
                  여행 만들기
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlans.map((plan) => {
              const daysUntil = Math.ceil((new Date(plan.start_date).getTime() - Date.now()) / 86400000);
              const isOngoing = plan.start_date <= today && plan.end_date >= today;
              const isPast = plan.end_date < today;
              return (
                <div key={plan.id} className={`relative ${isPast ? 'opacity-70' : ''}`}>
                  <div className="absolute top-2 right-2 z-10 flex gap-1">
                    {plan.access_type === 'shared' && <span className="badge badge-info badge-sm">공유</span>}
                    {isOngoing && <span className="badge badge-success badge-sm">여행 중</span>}
                    {!isPast && !isOngoing && daysUntil <= 30 && <span className="badge badge-warning badge-sm">D-{daysUntil}</span>}
                  </div>
                  <PlanCard plan={plan} />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
