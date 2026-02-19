import { useState } from 'react';
import { authAPI } from '../lib/api';
import { useStore } from '../store/useStore';

interface GuestLoginButtonProps {
  onSuccess?: () => void;
  fullWidth?: boolean;
}

export default function GuestLoginButton({ onSuccess, fullWidth = false }: GuestLoginButtonProps) {
  const { setCurrentUser } = useStore();
  const [showInput, setShowInput] = useState(false);
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!nickname.trim() || nickname.trim().length < 2) {
      setError('2자 이상 입력해주세요');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { user, credential } = await authAPI.guestLogin(nickname.trim());
      setCurrentUser(user);
      localStorage.setItem('temp_user_id', user.id.toString());
      localStorage.setItem('google_credential', credential);
      localStorage.setItem('X-Auth-Credential', credential);
      if (onSuccess) onSuccess();
    } catch (e: any) {
      setError(e?.message || '로그인 실패');
    } finally {
      setLoading(false);
    }
  };

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className={`btn btn-outline btn-sm gap-1 ${fullWidth ? 'w-full' : ''} hover:bg-base-200 border-base-300`}
      >
        <span className="text-base">👤</span>
        <span className="font-medium text-xs sm:text-sm">게스트 로그인</span>
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${fullWidth ? 'w-full' : ''}`}>
      <div className="flex gap-1">
        <input
          type="text"
          value={nickname}
          onChange={(e) => { setNickname(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="닉네임 (2~20자)"
          maxLength={20}
          className="input input-sm input-bordered flex-1 min-w-0"
          autoFocus
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || nickname.trim().length < 2}
          className="btn btn-sm btn-primary"
        >
          {loading ? '...' : '확인'}
        </button>
        <button onClick={() => { setShowInput(false); setError(''); }} className="btn btn-sm btn-ghost">✕</button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
