import { useState } from 'react';
import { Button } from './Button';
import { forkAPI } from '../lib/api';

interface ForkButtonProps {
  planId: number;
  onForked: (newPlan: any) => void;
}

export default function ForkButton({ planId, onForked }: ForkButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleFork = async () => {
    if (isLoading) return;

    const confirmed = window.confirm('이 여행 계획을 복제해서 내 플랜으로 만들까요?');
    if (!confirmed) return;

    try {
      setIsLoading(true);
      const result = await forkAPI.fork(planId);
      onForked(result.plan);
    } catch (error) {
      alert(error instanceof Error ? error.message : '플랜 복제에 실패했습니다.');
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
        '📋 이 계획 복제하기'
      )}
    </Button>
  );
}
