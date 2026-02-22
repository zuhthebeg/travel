import { useState } from 'react';
import { Button } from './Button';
import { forkAPI } from '../lib/api';
import { useTranslation } from 'react-i18next';

interface ForkButtonProps {
  planId: number;
  onForked: (newPlan: any) => void;
}

export default function ForkButton({ planId, onForked }: ForkButtonProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const handleFork = async () => {
    if (isLoading) return;

    const confirmed = window.confirm(t('forkButton.confirm'));
    if (!confirmed) return;

    try {
      setIsLoading(true);
      const result = await forkAPI.fork(planId);
      onForked(result.plan);
    } catch (error) {
      alert(error instanceof Error ? error.message : t('forkButton.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="accent"
      size="sm"
      onClick={handleFork}
      disabled={isLoading}
      className="gap-1.5"
    >
      {isLoading ? (
        <span className="loading loading-spinner loading-xs" />
      ) : (
        t('forkButton.cta')
      )}
    </Button>
  );
}
