import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useStore } from '../store/useStore';
import { plansAPI, authAPI } from '../lib/api';
import { PlanCard } from '../components/PlanCard';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';

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

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    try {
      if (!credentialResponse.credential) {
        alert('로그인에 실패했습니다.');
        return;
      }

      const user = await authAPI.googleLogin(credentialResponse.credential);
      setCurrentUser(user);

      // Save user ID to localStorage for backward compatibility
      localStorage.setItem('temp_user_id', user.id.toString());

      alert(`환영합니다, ${user.username}님!`);
      navigate('/my');
    } catch (error) {
      console.error('Google login failed:', error);
      alert('로그인에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('temp_user_id');
    alert('로그아웃되었습니다.');
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Header */}
      <header className="bg-base-100 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/favicon-512x512.png" alt="Travly Logo" className="w-12 h-12 sm:w-14 sm:h-14" />
              <div>
                <h1 className="text-3xl font-bold">Travly</h1>
                <p className="mt-1 text-sm text-base-content/70">
                  Planning, Sharing, with AI Travel Assistant.
                </p>
              </div>
            </div>
            <div className="flex gap-3 items-center">
              {currentUser ? (
                <>
                  <div className="flex items-center gap-2">
                    {currentUser.picture && (
                      <img
                        src={currentUser.picture}
                        alt={currentUser.username}
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <span className="text-sm font-medium">{currentUser.username}</span>
                  </div>
                  <Button variant="ghost" onClick={() => navigate('/my')}>
                    내 여행
                  </Button>
                  <Button variant="primary" onClick={() => navigate('/plan/new')}>
                    여행 만들기
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    로그아웃
                  </Button>
                </>
              ) : (
                <>
                  <div className="scale-90">
                    <GoogleLogin
                      onSuccess={handleGoogleLogin}
                      onError={() => {
                        console.error('Google Login Failed');
                        alert('로그인에 실패했습니다.');
                      }}
                      text="signin_with"
                      shape="rectangular"
                      size="medium"
                    />
                  </div>
                  <Button variant="ghost" onClick={() => navigate('/my')}>
                    내 여행
                  </Button>
                  <Button variant="primary" onClick={() => navigate('/plan/new')}>
                    여행 만들기
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
