import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useTranslation } from 'react-i18next';

interface InvitePlan {
  id: number;
  title: string;
  region: string | null;
  start_date: string;
  end_date: string;
  visibility: string;
}

export function InvitePage() {
  const { t } = useTranslation();
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
      .catch(() => setError(t('invite.invalidLink')))
      .finally(() => setLoading(false));
  }, [code, t]);

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
        setResult(t('invite.alreadyJoined'));
        setTimeout(() => navigate(`/plans/${data.planId || plan?.id}`), 1500);
      } else if (data.planId) {
        setResult(t('invite.joinedSuccess'));
        setTimeout(() => navigate(`/plans/${data.planId}`), 1500);
      } else {
        setError(data.error || t('invite.joinFailed'));
      }
    } catch {
      setError(t('invite.joinError'));
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
            <button className="btn btn-primary mt-4" onClick={() => navigate('/')}>{t('invite.goHome')}</button>
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
            <p className="text-sm text-base-content/60">{t('invite.redirecting')}</p>
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
          <h3 className="card-title justify-center text-xl">{t('invite.title')}</h3>
          
          <div className="bg-base-200 rounded-lg p-4 mt-4">
            <h4 className="font-bold text-lg">{plan?.title}</h4>
            {plan?.region && <p className="text-sm text-base-content/60">📍 {plan.region}</p>}
            <p className="text-sm text-base-content/60 mt-1">
              📅 {plan?.start_date} ~ {plan?.end_date}
            </p>
          </div>

          <p className="text-center mt-4 text-base-content/70">
            {t('invite.joinQuestion')}
          </p>

          {currentUser ? (
            <div className="card-actions justify-center mt-4 gap-2">
              <button className="btn btn-ghost" onClick={() => navigate('/')}>{t('invite.no')}</button>
              <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>
                {joining ? <span className="loading loading-spinner loading-sm"></span> : t('invite.yesJoin')}
              </button>
            </div>
          ) : (
            <div className="text-center mt-4">
              <p className="text-sm text-base-content/50 mb-3">{t('invite.loginRequired')}</p>
              <button className="btn btn-primary" onClick={() => {
                // 로그인 후 다시 이 페이지로 돌아오도록 저장
                localStorage.setItem('invite_redirect', `/invite/${code}`);
                navigate('/');
              }}>
                {t('invite.login')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
