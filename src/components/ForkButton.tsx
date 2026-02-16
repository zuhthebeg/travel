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

    const confirmed = window.confirm('이 플랜을 내 앨범으로 가져오시겠어요?');
    if (!confirmed) return;

    try {
      setIsLoading(true);
      const result = await forkAPI.fork(planId);
      onForked(result.plan);
    } catch (error) {
      alert(error instanceof Error ? error.message : '앨범 가져오기에 실패했습니다.');
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
        '📥 내 앨범으로 가져가기'
      )}
    </Button>
  );
}
