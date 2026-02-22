import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { translateTextBatched } from '../lib/translate';

interface AutoTranslateProps {
  /** Original text to potentially translate */
  text: string | null | undefined;
  /** If true, render as a block element */
  block?: boolean;
  /** Additional className */
  className?: string;
  /** Render function for custom rendering */
  children?: (translated: string) => React.ReactNode;
}

// Simple Korean detection (contains Hangul characters)
function isKorean(text: string): boolean {
  return /[\uAC00-\uD7AF]/.test(text);
}

// Get the base language code from i18n
function getBaseLang(lang: string): string {
  if (lang.startsWith('zh')) return 'zh-TW';
  return lang.split('-')[0];
}

/**
 * Auto-translates Korean user-generated content when the user's
 * UI language is not Korean. Uses Gemini via /api/translate with
 * localStorage caching.
 * 
 * Usage:
 *   <AutoTranslate text={schedule.title} />
 *   <AutoTranslate text={schedule.memo} block />
 *   <AutoTranslate text={review.content}>
 *     {(t) => <p className="whitespace-pre-wrap">{t}</p>}
 *   </AutoTranslate>
 */
export default function AutoTranslate({ text, block, className, children }: AutoTranslateProps) {
  const { i18n } = useTranslation();
  const [translated, setTranslated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const prevTextRef = useRef<string>('');
  const prevLangRef = useRef<string>('');

  const currentLang = getBaseLang(i18n.language || 'ko');
  const shouldTranslate = currentLang !== 'ko' && !!text?.trim() && isKorean(text);

  useEffect(() => {
    if (!shouldTranslate || !text) {
      setTranslated(null);
      return;
    }

    // Skip if same text+lang as before
    if (text === prevTextRef.current && currentLang === prevLangRef.current) {
      return;
    }

    prevTextRef.current = text;
    prevLangRef.current = currentLang;

    let cancelled = false;
    setIsLoading(true);

    translateTextBatched(text, currentLang)
      .then((result) => {
        if (!cancelled) setTranslated(result);
      })
      .catch(() => {
        if (!cancelled) setTranslated(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [text, currentLang, shouldTranslate]);

  // If no translation needed, render original
  const displayText = shouldTranslate ? (translated || text || '') : (text || '');

  if (children) {
    return <>{children(displayText)}</>;
  }

  const Tag = block ? 'div' : 'span';

  return (
    <Tag className={className}>
      {isLoading && shouldTranslate ? (
        <span className="inline-flex items-center gap-1">
          {text}
          <span className="loading loading-dots loading-xs opacity-50"></span>
        </span>
      ) : (
        displayText
      )}
    </Tag>
  );
}
