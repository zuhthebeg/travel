import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI } from '../lib/api';
import { PlanCard } from '../components/PlanCard';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import GoogleLoginButton from '../components/GoogleLoginButton';

export function MainPage() {
  const navigate = useNavigate();
  const { plans, setPlans, currentUser, setCurrentUser } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPublicPlans();
  }, []);

  const loadPublicPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const publicPlans = await plansAPI.getAll({ is_public: true });
      setPlans(publicPlans);
    } catch (err) {
      setError(err instanceof Error ? err.message : '여행 목록을 불러오는데 실패했습니다.');
      console.error('Failed to load plans:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('temp_user_id');
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Header */}
      <header className="bg-base-100 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex items-center justify-between gap-2">
            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink">
              <img src="/favicon-512x512.png" alt="Travly Logo" className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Travly</h1>
                <p className="hidden sm:block mt-1 text-xs md:text-sm text-base-content/70 truncate">
                  Planning, Sharing, with AI Travel Assistant.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1 sm:gap-2 md:gap-3 items-center flex-shrink-0">
              {currentUser ? (
                <>
                  {/* User Profile */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    {currentUser.picture && (
                      <img
                        src={currentUser.picture}
                        alt={currentUser.username}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex-shrink-0"
                      />
                    )}
                    <span className="hidden md:inline text-sm font-medium truncate max-w-[100px]">
                      {currentUser.username}
                    </span>
                  </div>

                  {/* Buttons */}
                  <Button variant="ghost" size="sm" onClick={() => navigate('/my')} className="hidden sm:flex">
                    내 여행
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => navigate('/plan/new')}>
                    <span className="hidden sm:inline">여행 만들기</span>
                    <span className="sm:hidden">+</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden md:flex">
                    로그아웃
                  </Button>
                </>
              ) : (
                <>
                  <GoogleLoginButton />
                  <Button variant="ghost" size="sm" onClick={() => navigate('/my')} className="hidden sm:flex">
                    내 여행
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => navigate('/plan/new')}>
                    <span className="hidden sm:inline">여행 만들기</span>
                    <span className="sm:hidden">+</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">공개 여행 둘러보기</h2>
          <p className="text-base-content/70">다른 사람들의 여행 계획을 참고해보세요</p>
        </div>

        {isLoading ? (
          <Loading />
        ) : error ? (
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
        ) : plans.length === 0 ? (
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
