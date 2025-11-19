import { useEffect, useRef } from 'react';
import GoogleLoginButton from './GoogleLoginButton';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  redirectTo?: string;
  title?: string;
  message?: string;
}

export default function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  redirectTo,
  title = '로그인이 필요합니다',
  message = '내 여행을 관리하려면 Google 계정으로 로그인해주세요.'
}: LoginModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  const handleSuccess = () => {
    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box max-w-md">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
        </form>

        <div className="flex flex-col items-center text-center py-6">
          {/* Logo */}
          <div className="mb-6">
            <img src="/favicon-512x512.png" alt="Travly Logo" className="w-20 h-20" />
          </div>

          {/* Title */}
          <h3 className="font-bold text-2xl mb-3">{title}</h3>

          {/* Message */}
          <p className="text-base-content/70 mb-8">
            {message}
          </p>

          {/* Google Login Button */}
          <GoogleLoginButton
            onSuccess={handleSuccess}
            redirectTo={redirectTo}
            fullWidth
          />

          {/* Info */}
          <div className="mt-6 text-xs text-base-content/60">
            <p>로그인하면 Travly의 <a href="#" className="link">이용약관</a> 및</p>
            <p><a href="#" className="link">개인정보 처리방침</a>에 동의하게 됩니다.</p>
          </div>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
