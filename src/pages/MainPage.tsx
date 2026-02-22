import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI as rawPlansAPI, schedulesAPI as rawSchedulesAPI } from '../lib/api';
import { offlinePlansAPI, offlineSchedulesAPI } from '../lib/offlineAPI';

// Use offline-aware API when offline mode is on
const plansAPI = localStorage.getItem('offline_mode') === 'true' ? offlinePlansAPI : rawPlansAPI;
const schedulesAPI = localStorage.getItem('offline_mode') === 'true' ? offlineSchedulesAPI : rawSchedulesAPI;
import { formatDate, getCountryFlag, extractCountryFromRegion, parseDateLocal } from '../lib/utils';
import { PlanCard } from '../components/PlanCard';
import { GlobalNav } from '../components/GlobalNav';
import { TravelMap, type MapPoint } from '../components/TravelMap';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import type { Plan, Schedule } from '../store/types';
import { Globe, Map as MapIcon, Calendar, Clock } from 'lucide-react';
import LevelCard from '../components/LevelCard';
import { useTranslation } from 'react-i18next';
import AutoTranslate from '../components/AutoTranslate';

interface PlanWithSchedules extends Plan {
  schedules?: Schedule[];
  _countryCode?: string | null;
}

function getPlanCountry(
  plan: PlanWithSchedules,
  getCountryName: (code: string) => string
): { code: string; name: string } | null {
  if (plan._countryCode) {
    const code = plan._countryCode.toUpperCase();
    return { code, name: getCountryName(code) };
  }
  return extractCountryFromRegion(plan.region);
}

export function MainPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { plans, setPlans, currentUser } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [plansWithSchedules, setPlansWithSchedules] = useState<PlanWithSchedules[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const getCountryName = (code: string) => t(`main.countryNames.${code}`, { defaultValue: code });
  
  // ?쒓컙 ?щ씪?대뜑 ?곹깭 (濡쒓렇???ъ슜?먯슜)
  const [timeOffset, setTimeOffset] = useState(0);
  const TIME_RANGE = 180;
  
  // 援?? ?좉? ?곹깭 (鍮꾨줈洹몄씤?? - Set?쇰줈 ?좏깮??援?? 肄붾뱶 愿由?
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  
  // ???ы뻾 + 怨듭쑀諛쏆? ?ы뻾
  const [myPlans, setMyPlans] = useState<Plan[]>([]);

  // ?ㅻ뒛 ?좎쭨 (YYYY-MM-DD)
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // ?ㅺ??ㅻ뒗 ?ы뻾 (end_date >= today)
  const upcomingPlans = useMemo(() => myPlans.filter(p => p.end_date >= today), [myPlans, today]);

  // ?앸궃 ?ы뻾 ID 紐⑸줉 (?⑤쾾 ?꾪꽣??

  useEffect(() => {
    setSelectedCountries(new Set());
    loadPublicPlans();
    if (currentUser) loadMyPlans();
  }, [currentUser]);

  const loadMyPlans = async () => {
    try {
      const plans = await plansAPI.getAll({ mine: true });
      setMyPlans(plans);
    } catch (err) {
      console.error('Failed to load my plans:', err);
    }
  };

  const loadPublicPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const publicPlans = await plansAPI.getAll({ is_public: true });
      setPlans(publicPlans);

      // 媛??ы뻾???쇱젙(醫뚰몴) 濡쒕뱶
      const plansWithData: PlanWithSchedules[] = await Promise.all(
        publicPlans.map(async (plan) => {
          try {
            const schedules = await schedulesAPI.getByPlanId(plan.id);
            const detectedCC = schedules.map(s => (s as any).country_code).find((cc: any) => cc);
            return { ...plan, schedules, _countryCode: detectedCC?.toUpperCase() || null };
          } catch {
            return { ...plan, schedules: [], _countryCode: null };
          }
        })
      );
      setPlansWithSchedules(plansWithData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('main.loadPlansFailed'));
      console.error('Failed to load plans:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 理쒖떊???뺣젹 (由ъ뒪???쒖떆??10媛??쒗븳)
  const sortedPlans = useMemo(() => {
    return [...plansWithSchedules]
      .sort((a, b) => parseDateLocal(b.start_date).getTime() - parseDateLocal(a.start_date).getTime())
      .slice(0, 10);
  }, [plansWithSchedules]);

  // 吏?꾩슜: ?ㅻ뒛 湲곗? ?욌뮘 6媛쒖썡 ?ы뻾 (理쒕? 100媛? ?대씪?댁뼵???꾪꽣留?
  const mapPlans = useMemo(() => {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    
    return plansWithSchedules
      .filter(plan => {
        const start = parseDateLocal(plan.start_date);
        const end = parseDateLocal(plan.end_date);
        // ?ы뻾 湲곌컙???욌뮘 6媛쒖썡 踰붿쐞? 寃뱀튂硫??ы븿
        return !(end < sixMonthsAgo || start > sixMonthsLater);
      })
      .sort((a, b) => parseDateLocal(a.start_date).getTime() - parseDateLocal(b.start_date).getTime())
      .slice(0, 100);
  }, [plansWithSchedules]);

  // ?쒓컙 ?꾪꽣留곷맂 ?ы뻾 (?щ씪?대뜑 湲곗? 짹30??踰붿쐞, 吏?꾩슜 ? ?곗씠??湲곕컲)
  const filteredPlansByTime = useMemo(() => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + timeOffset);
    
    return mapPlans.filter((plan) => {
      const start = parseDateLocal(plan.start_date);
      const end = parseDateLocal(plan.end_date);
      const rangeStart = new Date(targetDate);
      rangeStart.setDate(rangeStart.getDate() - 30);
      const rangeEnd = new Date(targetDate);
      rangeEnd.setDate(rangeEnd.getDate() + 30);
      
      return !(end < rangeStart || start > rangeEnd);
    });
  }, [mapPlans, timeOffset]);

  // 吏???ъ씤???앹꽦 (?쒓컙 ?꾪꽣留??곸슜)
  const allMapPoints = useMemo((): MapPoint[] => {
    const points: MapPoint[] = [];
    
    filteredPlansByTime.forEach((plan) => {
      if (!plan.schedules) return;
      
      // ?좏깮???ы뻾留??쒖떆 ??媛쒕퀎 ?ㅼ?以?紐⑤뱶
      if (selectedPlanId && plan.id === selectedPlanId) {
        plan.schedules.forEach((schedule) => {
          if (schedule.latitude && schedule.longitude) {
            points.push({
              id: schedule.id,
              lat: schedule.latitude!,
              lng: schedule.longitude!,
              title: schedule.title || schedule.place || '',
              place: schedule.place || undefined,
              date: schedule.date,
              order: schedule.order_index,
            });
          }
        });
        return;
      }
      if (selectedPlanId) return; // ?ㅻⅨ ?ы뻾? ?ㅽ궢
      
      // 援?? ?꾪꽣 ?곸슜
      const countryInfo = getPlanCountry(plan, getCountryName);
      if (countryInfo && !selectedCountries.has(countryInfo.code)) return;
      
      // ?ы뻾蹂????醫뚰몴 1媛?(泥?踰덉㎏ ?좏슚 ?ㅼ?以?
      const firstWithCoords = plan.schedules.find(s => s.latitude && s.longitude);
      if (firstWithCoords) {
        const startMonth = plan.start_date ? parseDateLocal(plan.start_date).getMonth() + 1 : '';
        points.push({
          id: plan.id,
          lat: firstWithCoords.latitude!,
          lng: firstWithCoords.longitude!,
          title: `${getCountryFlag(countryInfo?.code)} ${plan.title}`,
          place: plan.region || undefined,
          date: firstWithCoords.date,
          order: startMonth ? startMonth : 0,
          label: String(startMonth),
        });
      }
    });
    
    return points;
  }, [filteredPlansByTime, selectedPlanId, selectedCountries, t]);

  // ?щ씪?대뜑???꾩옱 ?寃??좎쭨
  const targetDateLabel = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + timeOffset);
    const lang = i18n.resolvedLanguage || i18n.language;
    const locale = lang === 'ja' ? 'ja-JP' : lang === 'en' ? 'en-US' : lang === 'zh-TW' ? 'zh-TW' : 'ko-KR';
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }, [timeOffset, i18n.language, i18n.resolvedLanguage]);

  // 援??蹂??ы뻾 ?듦퀎 (肄붾뱶 ?ы븿)
  const countryStats = useMemo(() => {
    const stats = new Map<string, { code: string; count: number; flag: string; name: string }>();
    
    plansWithSchedules.forEach((plan) => {
      const countryInfo = getPlanCountry(plan, getCountryName);
      if (countryInfo) {
        const existing = stats.get(countryInfo.code) || { 
          code: countryInfo.code,
          count: 0, 
          flag: getCountryFlag(countryInfo.code), 
          name: countryInfo.name 
        };
        existing.count++;
        stats.set(countryInfo.code, existing);
      }
    });
    
    return Array.from(stats.values()).sort((a, b) => b.count - a.count);
  }, [plansWithSchedules, t]);

  // 珥덇린 濡쒕뱶 ??紐⑤뱺 援?? ?좏깮
  useEffect(() => {
    if (countryStats.length > 0 && selectedCountries.size === 0) {
      setSelectedCountries(new Set(countryStats.map(s => s.code)));
    }
  }, [countryStats]);

  // 援?? ?좉? ?몃뱾??
  const toggleCountry = (code: string) => {
    setSelectedCountries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(code)) {
        newSet.delete(code);
      } else {
        newSet.add(code);
      }
      return newSet;
    });
  };

  // 鍮꾨줈洹몄씤?? 吏??퀎 ???醫뚰몴 (?ы뻾蹂?泥?踰덉㎏ 醫뚰몴留?
  const regionMapPoints = useMemo((): MapPoint[] => {
    const points: MapPoint[] = [];
    const seenRegions = new Set<string>();
    
    filteredPlansByTime.forEach((plan) => {
      const countryInfo = getPlanCountry(plan, getCountryName);
      if (!countryInfo || !selectedCountries.has(countryInfo.code)) return;
      
      // 吏??떦 ?섎굹???ъ씤?몃쭔
      const regionKey = plan.region || 'unknown';
      if (seenRegions.has(regionKey)) return;
      
      // 泥?踰덉㎏ 醫뚰몴 ?덈뒗 ?쇱젙 李얘린
      const scheduleWithCoords = plan.schedules?.find(s => s.latitude && s.longitude);
      if (scheduleWithCoords) {
        seenRegions.add(regionKey);
        const startMonth = plan.start_date ? parseDateLocal(plan.start_date).getMonth() + 1 : '';
        points.push({
          id: plan.id,
          lat: scheduleWithCoords.latitude!,
          lng: scheduleWithCoords.longitude!,
          title: `${getCountryFlag(countryInfo.code)} ${plan.title}`,
          place: plan.region || undefined,
          date: plan.start_date,
          order: startMonth ? startMonth : 1,
          label: String(startMonth),
        });
      }
    });
    
    return points;
  }, [filteredPlansByTime, selectedCountries, t]);

  const handleImportPlan = async (plan: Plan) => {
    if (!currentUser) {
      alert(t('main.loginRequired'));
      return;
    }

    if (isImporting) return;

    try {
      setIsImporting(true);

      const today = new Date();
      const oneWeekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const originalStartDate = parseDateLocal(plan.start_date);
      const originalEndDate = parseDateLocal(plan.end_date);
      const tripDuration = originalEndDate.getTime() - originalStartDate.getTime();

      const newStartDate = formatDate(oneWeekLater);
      const newEndDate = formatDate(new Date(oneWeekLater.getTime() + tripDuration));

      const newPlan = await plansAPI.create({
        title: t('main.copyTitle', { title: plan.title }),
        region: plan.region || undefined,
        start_date: newStartDate,
        end_date: newEndDate,
        thumbnail: plan.thumbnail || '',
      });

      const originalSchedules = await schedulesAPI.getByPlanId(plan.id);
      const dateOffset = oneWeekLater.getTime() - originalStartDate.getTime();

      for (const schedule of originalSchedules) {
        const originalDate = parseDateLocal(schedule.date);
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

      alert(t('main.importSuccess'));
      navigate('/my');
    } catch (err) {
      console.error('Failed to import plan:', err);
      alert(t('main.importFailed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleMapPointClick = (point: MapPoint) => {
    if (selectedPlanId) {
      // 媛쒕퀎 ?ㅼ?以?紐⑤뱶?먯꽌???대떦 ?ы뻾?쇰줈 ?대룞
      navigate(`/plan/${selectedPlanId}`);
    } else {
      // ?ы뻾蹂????留덉빱 ??point.id媛 plan.id
      navigate(`/plan/${point.id}`);
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
            <p className="text-lg font-medium">{t('main.importing')}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* ???ы뻾 ?뱀뀡 (濡쒓렇???? */}
        {currentUser && upcomingPlans.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
              {t('main.upcomingTripsTitle')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {upcomingPlans
                .sort((a, b) => a.start_date.localeCompare(b.start_date))
                .slice(0, 2)
                .map((plan) => {
                  const daysUntil = Math.ceil((parseDateLocal(plan.start_date).getTime() - new Date().getTime()) / 86400000);
                  return (
                    <div
                      key={plan.id}
                      onClick={() => navigate(`/plans/${plan.id}`)}
                      className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-primary"
                    >
                      <div className="card-body p-4">
                        <div className="flex items-center justify-between">
                          <h3 className="card-title text-base"><AutoTranslate text={plan.title} /></h3>
                          <span className={`badge badge-sm ${daysUntil <= 7 ? 'badge-warning' : 'badge-ghost'}`}>
                            {daysUntil <= 0 ? t('main.tripInProgressBang') : `D-${daysUntil}`}
                          </span>
                        </div>
                        <p className="text-sm text-base-content/60">
                          {plan.region && (
                            <span className="mr-2 inline-flex items-center gap-1">
                              <MapIcon className="w-3 h-3" />
                              <AutoTranslate text={plan.region} />
                            </span>
                          )}
                          {plan.start_date} ~ {plan.end_date}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
            {upcomingPlans.length > 2 && (
              <div className="text-center mt-2">
                <button className="btn btn-ghost btn-xs text-primary" onClick={() => navigate('/my')}>
                  {t('main.moreCount', { count: upcomingPlans.length - 2 })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hero Section with Map */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Globe className="w-6 h-6" /> {t('main.worldTripsTitle')}
              </h2>
              <p className="text-base-content/70">
                {currentUser 
                  ? t('main.summaryLoggedIn', { latest: sortedPlans.length, shown: filteredPlansByTime.length })
                  : t('main.summaryGuest', { countries: countryStats.length, plans: plansWithSchedules.length })
                }
              </p>
            </div>
            
            <Button variant="primary" size="sm" onClick={() => navigate('/plan/new')}>
              {t('main.newTrip')}
            </Button>
          </div>

          {/* Country Stats - ?좉? 媛??*/}
          {countryStats.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {countryStats.slice(0, 10).map((stat) => {
                const isSelected = selectedCountries.has(stat.code);
                return (
                  <div 
                    key={stat.code}
                    className={`badge badge-lg gap-1 cursor-pointer transition-all ${
                      isSelected 
                        ? 'badge-primary' 
                        : 'badge-ghost opacity-50 hover:opacity-75'
                    }`}
                    onClick={() => toggleCountry(stat.code)}
                  >
                    <span className="text-lg">{stat.flag}</span>
                    <span>{stat.name}</span>
                    <span className={`badge badge-sm ${isSelected ? 'badge-secondary' : ''}`}>
                      {stat.count}
                    </span>
                  </div>
                );
              })}
              {selectedCountries.size < countryStats.length && (
                <button 
                  className="btn btn-xs btn-ghost"
                  onClick={() => setSelectedCountries(new Set(countryStats.map(s => s.code)))}
                >
                  {t('main.selectAllCountries')}
                </button>
              )}
              {selectedCountries.size > 0 && selectedCountries.size === countryStats.length && (
                <button 
                  className="btn btn-xs btn-ghost"
                  onClick={() => setSelectedCountries(new Set())}
                >
                  {t('main.clearAllCountries')}
                </button>
              )}
            </div>
          )}

          {/* Map View - 鍮꾨줈洹몄씤: ?ы뵆 / 濡쒓렇?? ?곸꽭 */}
          <div className="card bg-base-100 shadow-xl overflow-hidden">
            {isLoading ? (
              <div className="h-[400px] flex items-center justify-center">
                <Loading />
              </div>
            ) : (currentUser ? allMapPoints : regionMapPoints).length > 0 ? (
              <TravelMap
                points={currentUser ? allMapPoints : regionMapPoints}
                showRoute={!!currentUser && !!selectedPlanId}
                height="400px"
                onPointClick={currentUser ? handleMapPointClick : (point) => navigate(`/plan/${point.id}`)}
                key={`map-${selectedCountries.size}-${currentUser ? 'user' : 'guest'}`}
              />
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-base-content/50">
                <MapIcon className="w-16 h-16 mb-4" />
                <p>{selectedCountries.size === 0 ? t('main.selectCountryPrompt') : t('main.noTripsInSelectedCountries')}</p>
                <p className="text-sm mt-2">{t('main.toggleHint')}</p>
              </div>
            )}

            {/* Time Slider */}
            <div className="px-4 py-3 bg-base-200 border-t">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">{t('main.timeTravel')}</span>
                <span className="badge badge-primary badge-sm">{targetDateLabel}</span>
                {timeOffset !== 0 && (
                  <button 
                    className="btn btn-xs btn-ghost"
                    onClick={() => setTimeOffset(0)}
                  >
                    {t('main.goToday')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-xs btn-circle btn-ghost"
                  onClick={() => setTimeOffset(Math.max(-TIME_RANGE, timeOffset - 30))}
                  disabled={timeOffset <= -TIME_RANGE}
                >
                  {t('main.prev')}
                </button>
                <input
                  type="range"
                  min={-TIME_RANGE}
                  max={TIME_RANGE}
                  value={timeOffset}
                  onChange={(e) => setTimeOffset(parseInt(e.target.value))}
                  className="range range-primary range-sm flex-1"
                />
                <button
                  className="btn btn-xs btn-circle btn-ghost"
                  onClick={() => setTimeOffset(Math.min(TIME_RANGE, timeOffset + 30))}
                  disabled={timeOffset >= TIME_RANGE}
                >
                  {t('main.next')}
                </button>
              </div>
              {/* 怨꾩젅 ???대룞 ??怨쇨굅~誘몃옒 ?곷? ?뺣젹 */}
              <div className="flex justify-center gap-1 mt-2">
                {(() => {
                  const now = new Date();
                  // 怨꾩젅 以묒떖 ?? 遊?, ?щ쫫6, 媛??, 寃⑥슱0
                  const seasonDefs = [
                    { label: t('main.seasonFall'), centerMonth: 9 },
                    { label: t('main.seasonWinter'), centerMonth: 0 },
                    { label: t('main.seasonSpring'), centerMonth: 3 },
                    { label: t('main.seasonSummer'), centerMonth: 6 },
                  ];
                  // 怨쇨굅 2怨꾩젅 + 誘몃옒 2怨꾩젅 湲곗??쇰줈 ?뺣젹
                  const items = seasonDefs.map(s => {
                    // 怨쇨굅 諛⑺뼢: ?꾩옱 ?붾낫???ㅻ㈃ ?묐뀈
                    const pastTarget = new Date(now.getFullYear(), s.centerMonth, 15);
                    if (pastTarget > now) pastTarget.setFullYear(pastTarget.getFullYear() - 1);
                    const pastDiff = Math.round((pastTarget.getTime() - now.getTime()) / 86400000);

                    // 誘몃옒 諛⑺뼢: ?꾩옱 ?붾낫???욎씠硫??ы빐, ?꾨땲硫??대뀈
                    const futureTarget = new Date(now.getFullYear(), s.centerMonth, 15);
                    if (futureTarget <= now) futureTarget.setFullYear(futureTarget.getFullYear() + 1);
                    const futureDiff = Math.round((futureTarget.getTime() - now.getTime()) / 86400000);

                    // 媛源뚯슫 履??좏깮
                    const diff = Math.abs(pastDiff) < Math.abs(futureDiff) ? pastDiff : futureDiff;
                    return { ...s, diff, inRange: Math.abs(diff) <= TIME_RANGE };
                  }).sort((a, b) => a.diff - b.diff);

                  return items.map(({ label, diff, inRange }) => (
                    <button
                      key={label}
                      className={`btn btn-xs ${inRange ? 'btn-outline btn-primary' : 'btn-disabled opacity-40'}`}
                      onClick={() => inRange && setTimeOffset(diff)}
                      disabled={!inRange}
                    >
                      {label}
                    </button>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Plan Filter (when a plan is selected) - 濡쒓렇???ъ슜?먮쭔 */}
        {currentUser && selectedPlanId && (
          <div className="alert mb-4">
            <span>{t('main.selectedPlanOnly')}</span>
            <button 
              className="btn btn-sm btn-ghost"
              onClick={() => setSelectedPlanId(null)}
            >
              {t('main.viewAll')}
            </button>
          </div>
        )}

        {/* 理쒖떊 ?ы뻾 移대뱶 (媛濡??ㅽ겕濡? */}
        {!isLoading && sortedPlans.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> {t('main.latestTrips')}
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
              {sortedPlans.map((plan) => (
                <div 
                  key={plan.id}
                  className={`flex-shrink-0 w-72 snap-start rounded-2xl transition-shadow ${selectedPlanId === plan.id ? 'outline outline-2 outline-primary' : ''}`}
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

        {/* ?덈꺼 (濡쒓렇???ъ슜?? */}
        {currentUser && (
          <div className="mb-8">
            <LevelCard />
          </div>
        )}

        {/* 鍮꾨줈洹몄씤: 濡쒓렇???좊룄 */}
        {!currentUser && !isLoading && (
          <div className="card bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 mb-8">
            <div className="card-body text-center py-8">
              <h3 className="text-lg font-bold mb-2">{t('main.startRecordingTitle')}</h3>
              <p className="text-base-content/70 mb-4">
                {t('main.startRecordingDesc')}
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="primary" onClick={() => navigate('/plan/new')}>
                  {t('main.createTrip')}
                </Button>
              </div>
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
                {t('main.retry')}
              </Button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && plans.length === 0 && (
          <div className="card bg-base-100 shadow-xl p-12 text-center">
            <div className="card-body items-center text-center">
              <p className="text-lg mb-4">
                {t('main.noPublicPlans')}
              </p>
              <div className="card-actions">
                <Button variant="primary" onClick={() => navigate('/plan/new')}>
                  {t('main.createFirstTrip')}
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
            짤 2026 Travly - AI Travel Assistant
          </p>
        </div>
      </footer>
    </div>
  );
}

