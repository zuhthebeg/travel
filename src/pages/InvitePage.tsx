import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

interface InvitePlan {
  id: number;
  title: string;
  region: string | null;
  start_date: string;
  end_date: string;
  visibility: string;
}

export function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { currentUser } = useStore();
  const [plan, setPlan] = useState<InvitePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/invite/${code}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setPlan(data.plan);
      })
      .catch(() => setError('초대 링크를 확인할 수 없습니다'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    if (!code || !currentUser) return;
    setJoining(true);
    try {
      const credential = localStorage.getItem('X-Auth-Credential') ||
        localStorage.getItem('x-auth-credential') ||
        localStorage.getItem('authCredential') ||
        localStorage.getItem('auth_credential') ||
        localStorage.getItem('google_credential') || '';

      const res = await fetch(`/api/invite/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Credential': credential },
      });
      const data = await res.json();

      if (data.already) {
        setResult('이미 참여 중인 여행입니다!');
        setTimeout(() => navigate(`/plans/${data.planId || plan?.id}`), 1500);
      } else if (data.planId) {
        setResult('여행에 참여했습니다! 🎉');
        setTimeout(() => navigate(`/plans/${data.planId}`), 1500);
      } else {
        setError(data.error || '참여에 실패했습니다');
      }
    } catch {
      setError('참여 중 오류가 발생했습니다');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card bg-base-100 shadow-xl max-w-md w-full">
          <div className="card-body text-center">
            <h2 className="text-4xl mb-2">😕</h2>
            <p className="text-error">{error}</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate('/')}>홈으로</button>
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card bg-base-100 shadow-xl max-w-md w-full">
          <div className="card-body text-center">
            <h2 className="text-4xl mb-2">✅</h2>
            <p className="text-lg font-bold">{result}</p>
            <p className="text-sm text-base-content/60">잠시 후 여행 페이지로 이동합니다...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/5 to-secondary/5">
      <div className="card bg-base-100 shadow-xl max-w-md w-full">
        <div className="card-body">
          <h2 className="text-4xl text-center mb-2">✈️</h2>
          <h3 className="card-title justify-center text-xl">여행 초대</h3>
          
          <div className="bg-base-200 rounded-lg p-4 mt-4">
            <h4 className="font-bold text-lg">{plan?.title}</h4>
            {plan?.region && <p className="text-sm text-base-content/60">📍 {plan.region}</p>}
            <p className="text-sm text-base-content/60 mt-1">
              📅 {plan?.start_date} ~ {plan?.end_date}
            </p>
          </div>

          <p className="text-center mt-4 text-base-content/70">
            이 여행에 참여하시겠습니까?
          </p>

          {currentUser ? (
            <div className="card-actions justify-center mt-4 gap-2">
              <button className="btn btn-ghost" onClick={() => navigate('/')}>아니요</button>
              <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>
                {joining ? <span className="loading loading-spinner loading-sm"></span> : '네, 참여할게요!'}
              </button>
            </div>
          ) : (
            <div className="text-center mt-4">
              <p className="text-sm text-base-content/50 mb-3">참여하려면 먼저 로그인이 필요합니다</p>
              <button className="btn btn-primary" onClick={() => {
                // 로그인 후 다시 이 페이지로 돌아오도록 저장
                localStorage.setItem('invite_redirect', `/invite/${code}`);
                navigate('/');
              }}>
                로그인하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
