import { useGoogleLogin } from '@react-oauth/google';
import { authAPI } from '../lib/api';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';

interface GoogleLoginButtonProps {
  onSuccess?: () => void;
  redirectTo?: string;
  fullWidth?: boolean;
}

export default function GoogleLoginButton({
  onSuccess,
  redirectTo,
  fullWidth = false
}: GoogleLoginButtonProps) {
  const { setCurrentUser } = useStore();
  const navigate = useNavigate();

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        // Get user info from Google
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });

        const userInfo = await userInfoResponse.json();

        // Create a simple JWT-like payload for our backend
        const credential = btoa(JSON.stringify({
          sub: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
        }));

        const user = await authAPI.googleLogin(credential);
        setCurrentUser(user);
        localStorage.setItem('temp_user_id', user.id.toString());
        localStorage.setItem('google_credential', credential);

        if (onSuccess) {
          onSuccess();
        }

        if (redirectTo) {
          navigate(redirectTo);
        }
      } catch (error) {
        console.error('Google login failed:', error);
        alert('로그인에 실패했습니다. 다시 시도해주세요.');
      }
    },
    onError: () => {
      console.error('Google Login Failed');
      alert('로그인에 실패했습니다.');
    },
  });

  return (
    <button
      onClick={() => login()}
      className={`btn btn-outline btn-sm gap-1 sm:gap-2 ${fullWidth ? 'w-full' : ''} hover:bg-base-200 border-base-300`}
    >
      <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
      <span className="font-medium text-xs sm:text-sm">
        <span className="hidden xs:inline">Google로 계속하기</span>
        <span className="xs:hidden">로그인</span>
      </span>
    </button>
  );
}
