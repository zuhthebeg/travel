import { useEffect, useRef } from 'react';
import GoogleLoginButton from './GoogleLoginButton';
import GuestLoginButton from './GuestLoginButton';
import { useTranslation } from 'react-i18next';

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
  title,
  message
}: LoginModalProps) {
  const { t } = useTranslation();
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
          <h3 className="font-bold text-2xl mb-3">{title ?? t('login.modalTitle')}</h3>

          {/* Message */}
          <p className="text-base-content/70 mb-8">
            {message ?? t('login.modalMessage')}
          </p>

          {/* Login Buttons */}
          <div className="flex flex-col gap-3 w-full">
            <GoogleLoginButton
              onSuccess={handleSuccess}
              redirectTo={redirectTo}
              fullWidth
            />
            <div className="divider my-0 text-xs">{t('login.or')}</div>
            <GuestLoginButton
              onSuccess={handleSuccess}
              fullWidth
            />
          </div>

          {/* Info */}
          <div className="mt-6 text-xs text-base-content/60">
            <p>{t('login.termsPrefix')} <a href="#" className="link">{t('login.termsOfService')}</a> {t('login.and')}</p>
            <p><a href="#" className="link">{t('login.privacyPolicy')}</a>{t('login.agreeSuffix')}</p>
          </div>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
