import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { plansAPI } from '../lib/api';
import { getTempUserId } from '../lib/utils';
import { PlanCard } from '../components/PlanCard';
import { Button } from '../components/Button';
import { Loading } from '../components/Loading';

export function MyPlansPage() {
  const navigate = useNavigate();
  const { plans, setPlans } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMyPlans();
  }, []);

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

  return (
    <div className="min-h-screen bg-base-200">
      {/* Header */}
      <header className="bg-base-100 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">내 여행</h1>
              <p className="mt-1 text-sm text-base-content/70">
                나의 여행 계획을 관리하세요
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => navigate('/')}>
                홈으로
              </Button>
              <Button variant="primary" onClick={() => navigate('/plan/new')}>
                새 여행 만들기
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
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
