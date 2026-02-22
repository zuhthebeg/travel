import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateTexts } from '../lib/translate';
import { Globe } from 'lucide-react';

interface TranslateButtonProps {
  /** Array of texts to translate */
  texts: string[];
  /** Callback with translated texts */
  onTranslated: (translated: string[]) => void;
  /** Callback to show originals */
  onShowOriginal: () => void;
  /** Whether currently showing translation */
  isTranslated: boolean;
  /** Size variant */
  size?: 'xs' | 'sm';
  /** Additional CSS classes */
  className?: string;
}

/**
 * "🌐 Translate" / "Show original" toggle button.
 * Translates to the user's current i18n language.
 */
export default function TranslateButton({
  texts,
  onTranslated,
  onShowOriginal,
  isTranslated,
  size = 'xs',
  className = '',
}: TranslateButtonProps) {
  const { i18n, t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  // Don't show if the content language likely matches user language
  // We can't always know, so always show the button
  const currentLang = i18n.language?.startsWith('ko') ? 'ko'
    : i18n.language?.startsWith('en') ? 'en'
    : i18n.language?.startsWith('ja') ? 'ja'
    : i18n.language?.startsWith('zh') ? 'zh-TW'
    : 'en';

  const handleTranslate = async () => {
    if (isTranslated) {
      onShowOriginal();
      return;
    }

    setIsLoading(true);
    try {
      const translated = await translateTexts(texts, currentLang);
      onTranslated(translated);
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleTranslate}
      disabled={isLoading}
      className={`btn btn-ghost btn-${size} gap-1 text-base-content/50 hover:text-primary ${className}`}
    >
      {isLoading ? (
        <span className="loading loading-spinner loading-xs"></span>
      ) : (
        <Globe className="w-3 h-3" />
      )}
      {isTranslated ? t('translate.showOriginal') : t('translate.translate')}
    </button>
  );
}
