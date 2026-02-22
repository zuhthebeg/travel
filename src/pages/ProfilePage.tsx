import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useTranslation } from 'react-i18next';
import { GlobalNav } from '../components/GlobalNav';
import LevelCard from '../components/LevelCard';
import AlbumTimeline from '../components/AlbumTimeline';
import { OfflineModelManager } from '../components/OfflineModelManager';
import { Trophy, MapPin, Camera, Plane, Calendar, LogOut, ChevronRight, Wifi, WifiOff, Download } from 'lucide-react';
import { getCachedPlans, getCachedMomentsBySchedule, getCachedSchedulesByPlan } from '../lib/db';
import { isPWA } from '../lib/isPWA';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';

interface Stats {
  totalPlans: number;
  totalMoments: number;
  totalCountries: number;
  totalCities: number;
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { currentUser, setCurrentUser } = useStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState<'level' | 'album' | 'stats' | 'offline'>('level');

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    loadStats();
  }, [currentUser]);

  const loadStats = async () => {
    const isOffline = localStorage.getItem('offline_mode') === 'true' && !navigator.onLine;

    if (isOffline) {
      // Load from IndexedDB cache
      try {
        const plans = await getCachedPlans();
        let totalMoments = 0;
        for (const plan of plans) {
          const schedules = await getCachedSchedulesByPlan(plan.id);
          for (const s of schedules) {
            const moments = await getCachedMomentsBySchedule(s.id);
            totalMoments += moments.length;
          }
        }
        setStats({
          totalPlans: plans.length,
          totalMoments,
          totalCountries: 0, // Not available offline
          totalCities: 0,
        });
      } catch (e) {
        console.error('Failed to load offline stats:', e);
      }
      return;
    }

    try {
      const credential = localStorage.getItem('google_credential') || '';
      const headers: Record<string, string> = credential ? { 'X-Auth-Credential': credential } : {};

      // 플랜 수
      const plansRes = await fetch(`${API_BASE}/api/plans?user_id=${currentUser!.id}`, { headers });
      const plansData = await plansRes.json();

      // 레벨 데이터 (국가/도시 포함)
      const levelRes = await fetch(`${API_BASE}/api/my/level`, { headers });
      const levelData = levelRes.ok ? await levelRes.json() : null;

      // 모먼트 수 (앨범에서)
      const momentsRes = await fetch(`${API_BASE}/api/my/moments`, { headers });
      const momentsData = momentsRes.ok ? await momentsRes.json() : { moments: [] };

      setStats({
        totalPlans: plansData.plans?.length ?? 0,
        totalMoments: momentsData.moments?.length ?? 0,
        totalCountries: levelData?.countries ?? 0,
        totalCities: levelData?.cities ?? 0,
      });
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  };

  const handleLogout = () => {
    if (!confirm(t('profile.logoutConfirm'))) return;
    localStorage.removeItem('google_credential');
    localStorage.removeItem('user_info');
    setCurrentUser(null);
    navigate('/');
  };

  if (!currentUser) return null;

  const isOfflineOn = localStorage.getItem('offline_mode') === 'true';
  const tabs = [
    { id: 'level' as const, label: t('profile.tabs.level'), icon: Trophy },
    { id: 'album' as const, label: t('profile.tabs.album'), icon: Camera },
    { id: 'stats' as const, label: t('profile.tabs.stats'), icon: Plane },
    { id: 'offline' as const, label: t('profile.tabs.offline'), icon: isOfflineOn ? WifiOff : Wifi },
  ];

  return (
    <div className="min-h-screen bg-base-200">
      <GlobalNav />
      <main className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        {/* 프로필 헤더 */}
        <div className="text-center space-y-3">
          {currentUser.picture ? (
            <img
              src={currentUser.picture}
              alt=""
              className="w-20 h-20 rounded-full mx-auto border-4 border-orange-200 shadow-lg"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {(currentUser.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{currentUser.username}</h1>
            <p className="text-sm text-base-content/50">{currentUser.email}</p>
          </div>
        </div>

        {/* 스탯 요약 카드 */}
        {stats && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: t('profile.stats.trip'), value: stats.totalPlans, icon: '✈️' },
              { label: t('profile.stats.record'), value: stats.totalMoments, icon: '📸' },
              { label: t('profile.stats.country'), value: stats.totalCountries, icon: '🌍' },
              { label: t('profile.stats.city'), value: stats.totalCities, icon: '🏙️' },
            ].map(s => (
              <div key={s.label} className="bg-base-100 rounded-xl p-3 text-center border border-base-200">
                <span className="text-lg">{s.icon}</span>
                <p className="font-bold text-lg">{s.value}</p>
                <p className="text-[10px] text-base-content/50">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* 탭 */}
        <div className="flex bg-base-100 rounded-xl p-1 border border-base-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-base-content/60 hover:text-base-content'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === 'level' && (
          localStorage.getItem('offline_mode') === 'true' && !navigator.onLine ? (
            <div className="card bg-base-100 shadow-sm p-4 text-center text-sm text-base-content/50">
              {t('profile.onlineOnlyLevel')}
            </div>
          ) : (
            <LevelCard />
          )
        )}

        {activeTab === 'album' && (
          localStorage.getItem('offline_mode') === 'true' && !navigator.onLine ? (
            <div className="card bg-base-100 shadow-sm p-4 text-center text-sm text-base-content/50">
              {t('profile.onlineOnlyAlbum')}
            </div>
          ) : (
            <div className="card bg-base-100 shadow-sm p-4">
              <AlbumTimeline />
            </div>
          )
        )}

        {activeTab === 'stats' && stats && (
          <div className="space-y-3">
            <div className="card bg-base-100 shadow-sm p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-500" /> {t('profile.travelRecord')}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-base-content/60">{t('profile.totalPlans')}</span>
                  <span className="font-medium">{t('profile.count', { count: stats.totalPlans })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/60">{t('profile.totalMoments')}</span>
                  <span className="font-medium">{t('profile.count', { count: stats.totalMoments })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/60">{t('profile.visitedCountries')}</span>
                  <span className="font-medium">{t('profile.countryCount', { count: stats.totalCountries })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/60">{t('profile.visitedCities')}</span>
                  <span className="font-medium">{t('profile.cityCount', { count: stats.totalCities })}</span>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-sm p-4 space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-500" /> {t('profile.visitedMap')}
              </h3>
              <p className="text-xs text-base-content/50">
                {t('profile.visitedMapHint')}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'offline' && (
          isPWA() ? (
            <OfflineModelManager />
          ) : (
            <div className="bg-base-100 rounded-xl p-6 text-center space-y-4">
              <Download className="w-12 h-12 mx-auto text-orange-400" />
              <h3 className="font-bold text-lg">{t('profile.installRequired')}</h3>
              <p className="text-sm text-base-content/70">
                {t('profile.installHint1')}<br />
                {t('profile.installHint2')}
              </p>
              <div className="bg-base-200 rounded-lg p-4 text-left text-xs space-y-2">
                <p className="font-semibold">{t('profile.installHowTo')}</p>
                <p><strong>Android:</strong> {t('profile.installAndroid')}</p>
                <p><strong>iOS Safari:</strong> {t('profile.installIos')}</p>
                <p><strong>PC Chrome:</strong> {t('profile.installPc')}</p>
              </div>
            </div>
          )
        )}

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-between px-4 py-3 bg-base-100 rounded-xl border border-base-200 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          <span className="flex items-center gap-2">
            <LogOut className="w-4 h-4" /> {t('profile.logout')}
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </main>
    </div>
  );
}
