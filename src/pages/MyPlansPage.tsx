import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI as rawPlansAPI } from '../lib/api';
import { offlinePlansAPI } from '../lib/offlineAPI';
import { parseDateLocal } from '../lib/utils';

const plansAPI = localStorage.getItem('offline_mode') === 'true' ? offlinePlansAPI : rawPlansAPI;
import type { Plan } from '../store/types';
import { PlanCard } from '../components/PlanCard';
import { GlobalNav } from '../components/GlobalNav';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import LoginModal from '../components/LoginModal';
import { useTranslation } from 'react-i18next';

type OwnerFilter = 'all' | 'mine' | 'shared';
type TimeFilter = 'all' | 'upcoming' | 'past' | 'ongoing';
type RegionFilter = 'all' | 'domestic' | 'international';

export function MyPlansPage() {
  const { t } = useTranslation();
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
  const domesticRegionKeywords = useMemo(
    () => [
      t('myPlans.regionKeywords.korea', { lng: 'ko' }),
      t('myPlans.regionKeywords.seoul', { lng: 'ko' }),
      t('myPlans.regionKeywords.busan', { lng: 'ko' }),
      t('myPlans.regionKeywords.jeju', { lng: 'ko' }),
      t('myPlans.regionKeywords.daegu', { lng: 'ko' }),
      t('myPlans.regionKeywords.incheon', { lng: 'ko' }),
    ].map((keyword) => keyword.toLowerCase()),
    [t]
  );

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
      setError(err instanceof Error ? err.message : t('myPlans.loadFailed'));
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
      return domesticRegionKeywords.some((keyword) => r.includes(keyword)) || r.includes('korea') || (p.country_code || '').toUpperCase() === 'KR';
    });
    if (regionFilter === 'international') result = result.filter(p => {
      const r = (p.region || '').toLowerCase();
      const isKR = domesticRegionKeywords.some((keyword) => r.includes(keyword)) || r.includes('korea') || (p.country_code || '').toUpperCase() === 'KR';
      return !isKR;
    });

    // Sort
    if (sortOrder === 'newest') result.sort((a, b) => b.start_date.localeCompare(a.start_date));
    if (sortOrder === 'oldest') result.sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (sortOrder === 'upcoming') result.sort((a, b) => {
      const aDiff = Math.abs(parseDateLocal(a.start_date).getTime() - Date.now());
      const bDiff = Math.abs(parseDateLocal(b.start_date).getTime() - Date.now());
      return aDiff - bDiff;
    });

    return result;
  }, [allPlans, ownerFilter, timeFilter, regionFilter, sortOrder, today, domesticRegionKeywords]);

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
        title={t('login.modalTitle')}
        message={t('login.modalMessage')}
      />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Page Title + Filters */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold">{t('myPlans.pageTitle')}</h2>
              <p className="text-sm text-base-content/60">{t('myPlans.tripCount', { count: filteredPlans.length })}</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate('/plan/new')}>{t('myPlans.newTrip')}</Button>
          </div>

          {currentUser && allPlans.length > 0 && (
            <div className="space-y-2">
              {/* 시간 필터 */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  { key: 'all', label: t('myPlans.filterAll'), count: allPlans.length },
                  { key: 'ongoing', label: t('myPlans.filterOngoing'), count: ongoingCount },
                  { key: 'upcoming', label: t('myPlans.filterUpcoming'), count: upcomingCount },
                  { key: 'past', label: t('myPlans.filterPast'), count: pastCount },
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
                    <option value="all">{t('myPlans.ownerAll', { count: allPlans.length })}</option>
                    <option value="mine">{t('myPlans.ownerMine', { count: myCount })}</option>
                    <option value="shared">{t('myPlans.ownerShared', { count: sharedCount })}</option>
                  </select>
                )}
                <select
                  className="select select-xs select-bordered"
                  value={regionFilter}
                  onChange={e => setRegionFilter(e.target.value as RegionFilter)}
                >
                  <option value="all">{t('myPlans.regionAll')}</option>
                  <option value="domestic">{t('myPlans.regionDomestic')}</option>
                  <option value="international">{t('myPlans.regionInternational')}</option>
                </select>
                <select
                  className="select select-xs select-bordered"
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value as 'newest' | 'oldest' | 'upcoming')}
                >
                  <option value="newest">{t('myPlans.sortNewest')}</option>
                  <option value="oldest">{t('myPlans.sortOldest')}</option>
                  <option value="upcoming">{t('myPlans.sortUpcoming')}</option>
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
              <h2 className="text-2xl font-bold mb-3">{t('myPlans.loginRequiredTitle')}</h2>
              <p className="text-base-content/70 mb-6">
                {t('myPlans.loginRequiredMessage')}
              </p>
              <Button variant="primary" onClick={() => setShowLoginModal(true)}>
                {t('myPlans.login')}
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
                {t('myPlans.retry')}
              </Button>
            </div>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="card bg-base-100 shadow-xl p-12 text-center">
            <div className="card-body items-center text-center">
              <p className="text-lg mb-4">
                {t('myPlans.noPlans')}
              </p>
              <p className="text-base-content/70 mb-6">
                {t('myPlans.createNewPrompt')}
              </p>
              <div className="card-actions">
                <Button variant="primary" onClick={() => navigate('/plan/new')}>
                  {t('myPlans.createTrip')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlans.map((plan) => {
              const daysUntil = Math.ceil((parseDateLocal(plan.start_date).getTime() - Date.now()) / 86400000);
              const isOngoing = plan.start_date <= today && plan.end_date >= today;
              const isPast = plan.end_date < today;
              return (
                <div key={plan.id} className={`relative ${isPast ? 'opacity-70' : ''}`}>
                  <div className="absolute top-2 right-2 z-10 flex gap-1">
                    {plan.access_type === 'shared' && <span className="badge badge-info badge-sm">{t('myPlans.badgeShared')}</span>}
                    {isOngoing && <span className="badge badge-success badge-sm">{t('myPlans.badgeOngoing')}</span>}
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
