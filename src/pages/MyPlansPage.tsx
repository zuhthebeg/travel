import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI } from '../lib/api';
import { getTempUserId } from '../lib/utils';
import { PlanCard } from '../components/PlanCard';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';
import LoginModal from '../components/LoginModal';

export function MyPlansPage() {
  const navigate = useNavigate();
  const { plans, setPlans, currentUser, setCurrentUser } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    // Check if user is logged in
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
      const userId = getTempUserId();
      const myPlans = await plansAPI.getAll({ user_id: userId });
      setPlans(myPlans);
    } catch (err) {
      setError(err instanceof Error ? err.message : '내 여행을 불러오는데 실패했습니다.');
      console.error('Failed to load my plans:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('temp_user_id');
    setShowLoginModal(true);
  };

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    loadMyPlans();
  };

  return (
    <div className="min-h-screen bg-base-200">
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

      {/* Header */}
      <header className="bg-base-100 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex items-center justify-between gap-2">
            {/* Title */}
            <div className="min-w-0 flex-shrink">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">내 여행</h1>
              <p className="hidden sm:block mt-1 text-xs md:text-sm text-base-content/70">
                나의 여행 계획을 관리하세요
              </p>
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
                  <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="hidden sm:flex">
                    홈으로
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => navigate('/plan/new')}>
                    <span className="hidden sm:inline">새 여행 만들기</span>
                    <span className="sm:hidden">+</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden md:flex">
                    로그아웃
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                    <span className="hidden sm:inline">홈으로</span>
                    <span className="sm:hidden">홈</span>
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setShowLoginModal(true)}>
                    로그인
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
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
        ) : plans.length === 0 ? (
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
