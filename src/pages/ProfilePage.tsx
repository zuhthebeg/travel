import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { GlobalNav } from '../components/GlobalNav';
import LevelCard from '../components/LevelCard';
import AlbumTimeline from '../components/AlbumTimeline';
import { OfflineModelManager } from '../components/OfflineModelManager';
import { Trophy, MapPin, Camera, Plane, Calendar, LogOut, ChevronRight } from 'lucide-react';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';

interface Stats {
  totalPlans: number;
  totalMoments: number;
  totalCountries: number;
  totalCities: number;
}

export default function ProfilePage() {
  const { currentUser, setCurrentUser } = useStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState<'level' | 'album' | 'stats'>('level');

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    loadStats();
  }, [currentUser]);

  const loadStats = async () => {
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
    if (!confirm('로그아웃 하시겠어요?')) return;
    localStorage.removeItem('google_credential');
    localStorage.removeItem('user_info');
    setCurrentUser(null);
    navigate('/');
  };

  if (!currentUser) return null;

  const tabs = [
    { id: 'level' as const, label: '레벨', icon: Trophy },
    { id: 'album' as const, label: '앨범', icon: Camera },
    { id: 'stats' as const, label: '통계', icon: Plane },
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
              { label: '여행', value: stats.totalPlans, icon: '✈️' },
              { label: '기록', value: stats.totalMoments, icon: '📸' },
              { label: '국가', value: stats.totalCountries, icon: '🌍' },
              { label: '도시', value: stats.totalCities, icon: '🏙️' },
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
          <LevelCard />
        )}

        {activeTab === 'album' && (
          <div className="card bg-base-100 shadow-sm p-4">
            <AlbumTimeline />
          </div>
        )}

        {activeTab === 'stats' && stats && (
          <div className="space-y-3">
            <div className="card bg-base-100 shadow-sm p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-500" /> 여행 기록
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-base-content/60">총 여행 계획</span>
                  <span className="font-medium">{stats.totalPlans}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/60">총 모먼트</span>
                  <span className="font-medium">{stats.totalMoments}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/60">방문 국가</span>
                  <span className="font-medium">{stats.totalCountries}개국</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/60">방문 도시</span>
                  <span className="font-medium">{stats.totalCities}개 도시</span>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-sm p-4 space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-500" /> 방문 지도
              </h3>
              <p className="text-xs text-base-content/50">
                모먼트를 기록하면 방문한 도시와 국가가 자동으로 추적돼요
              </p>
            </div>
          </div>
        )}

        {/* 오프라인 AI */}
        <OfflineModelManager />

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-between px-4 py-3 bg-base-100 rounded-xl border border-base-200 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          <span className="flex items-center gap-2">
            <LogOut className="w-4 h-4" /> 로그아웃
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </main>
    </div>
  );
}
