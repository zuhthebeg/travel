import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Trophy, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface LevelData {
  xp: number;
  level: number;
  title: string;
  emoji: string;
  nextLevelXP: number | null;
  progress: number;
  countries: number;
  cities: number;
  badges: Badge[];
  earnedBadges: number;
  totalBadges: number;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  earned: boolean;
  earned_at: string | null;
}

const API_BASE = import.meta.env.DEV ? 'http://localhost:8788' : '';

export default function LevelCard() {
  const { t } = useTranslation();
  const { currentUser } = useStore();
  const [data, setData] = useState<LevelData | null>(null);
  const [showBadges, setShowBadges] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    loadLevel();
  }, [currentUser]);

  const loadLevel = async () => {
    try {
      const credential = localStorage.getItem('google_credential') || '';
      const res = await fetch(`${API_BASE}/api/my/level`, {
        headers: credential ? { 'X-Auth-Credential': credential } : {},
      });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error('Failed to load level:', e);
    }
  };

  if (!currentUser || !data) return null;

  const progressPercent = data.nextLevelXP
    ? Math.min(100, Math.round((data.xp / data.nextLevelXP) * 100))
    : 100;

  return (
    <div className="space-y-3">
      {/* 메인 레벨 카드 */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-4 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{data.emoji}</span>
            <div>
              <p className="font-bold text-sm">Lv.{data.level} {data.title}</p>
              <p className="text-[11px] text-white/70">{data.xp} XP</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-center">
              <p className="font-bold">{data.countries}</p>
              <p className="text-[10px] text-white/70">{t('level.country')}</p>
            </div>
            <div className="text-center">
              <p className="font-bold">{data.cities}</p>
              <p className="text-[10px] text-white/70">{t('level.city')}</p>
            </div>
            <div className="text-center">
              <p className="font-bold">{data.earnedBadges}</p>
              <p className="text-[10px] text-white/70">{t('level.badge')}</p>
            </div>
          </div>
        </div>

        {/* XP 프로그레스 바 */}
        {data.nextLevelXP && (
          <div>
            <div className="flex justify-between text-[10px] text-white/70 mb-1">
              <span>{t('level.nextLevel')}</span>
              <span>{data.xp} / {data.nextLevelXP} XP</span>
            </div>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 뱃지 토글 */}
      <button
        onClick={() => setShowBadges(!showBadges)}
        className="w-full flex items-center justify-between px-3 py-2 bg-base-100 rounded-xl border border-base-200 text-sm hover:bg-base-200 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-orange-500" />
          <span className="font-medium">{t('level.badgeCollection')}</span>
          <span className="text-base-content/50">{data.earnedBadges}/{data.totalBadges}</span>
        </span>
        <ChevronRight className={`w-4 h-4 transition-transform ${showBadges ? 'rotate-90' : ''}`} />
      </button>

      {/* 뱃지 그리드 */}
      {showBadges && (
        <div className="grid grid-cols-3 gap-2">
          {data.badges.map(badge => (
            <div
              key={badge.id}
              className={`p-2.5 rounded-xl text-center border transition-all ${
                badge.earned
                  ? 'bg-base-100 border-orange-200 shadow-sm'
                  : 'bg-base-200/50 border-base-200 opacity-40'
              }`}
            >
              <span className="text-xl block mb-1">{badge.emoji}</span>
              <p className="text-[10px] font-medium leading-tight">{badge.name}</p>
              {badge.earned && (
                <p className="text-[8px] text-orange-500 mt-0.5">{t('level.earned')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
