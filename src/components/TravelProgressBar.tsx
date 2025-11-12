import { useState, useEffect } from 'react';

interface TravelProgressBarProps {
  startDate: string; // YYYY-MM-DD format
  endDate: string;   // YYYY-MM-DD format
}

export function TravelProgressBar({ startDate, endDate }: TravelProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [isSleepingTime, setIsSleepingTime] = useState(false);

  useEffect(() => {
    const calculateProgress = () => {
      const now = new Date();
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Set time to midnight for date comparison
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const totalDuration = end.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();

      // Check if current time is sleeping time (00:00 - 06:00)
      const currentHour = now.getHours();
      setIsSleepingTime(currentHour >= 0 && currentHour < 6);

      if (elapsed < 0) {
        // Trip hasn't started yet
        return 0;
      } else if (elapsed > totalDuration) {
        // Trip has ended
        return 100;
      } else {
        // Trip is ongoing
        return (elapsed / totalDuration) * 100;
      }
    };

    // Initial calculation
    setProgress(calculateProgress());

    // Update every second for smooth animation
    const interval = setInterval(() => {
      setProgress(calculateProgress());
    }, 1000);

    return () => clearInterval(interval);
  }, [startDate, endDate]);

  const getStatusText = () => {
    if (progress === 0) return '여행 시작 전';
    if (progress === 100) return '여행 완료';
    return '여행 중';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold">여행 진행도</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{getStatusText()}</span>
          <span className="text-xs text-base-content/70">{progress.toFixed(1)}%</span>
        </div>
      </div>

      <div className="relative">
        {/* Progress bar container */}
        <div className="w-full h-8 bg-base-300 rounded-full overflow-hidden shadow-inner">
          {/* Progress fill with gradient */}
          <div
            className="h-full bg-gradient-to-r from-primary via-secondary to-accent transition-all duration-1000 ease-out relative"
            style={{ width: `${Math.min(progress, 100)}%` }}
          >
            {/* Animated shine effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>

        {/* Running/Resting character animation */}
        {progress > 0 && progress < 100 && (
          <div
            className="absolute -top-8 transform -translate-x-1/2 transition-all duration-1000 ease-out"
            style={{ left: `${Math.min(progress, 100)}%` }}
          >
            {isSleepingTime ? (
              <div className="text-4xl animate-sleep">
                😴
              </div>
            ) : (
              <div className="text-4xl animate-run">
                🏃‍♂️
              </div>
            )}
          </div>
        )}

        {/* Completion flag */}
        {progress === 100 && (
          <div className="absolute -top-8 right-0 transform translate-x-1/2">
            <div className="text-4xl animate-bounce">
              🏁
            </div>
          </div>
        )}

        {/* Start flag */}
        {progress === 0 && (
          <div className="absolute -top-8 left-0 transform -translate-x-1/2">
            <div className="text-4xl">
              🚩
            </div>
          </div>
        )}
      </div>

      {/* Date labels */}
      <div className="flex justify-between mt-1 text-[10px] text-base-content/70">
        <span>{startDate}</span>
        <span>{endDate}</span>
      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes run {
          0%, 100% {
            transform: translateY(0) rotate(-5deg) scaleX(-1);
          }
          50% {
            transform: translateY(-4px) rotate(5deg) scaleX(-1);
          }
        }

        @keyframes sleep {
          0%, 100% {
            transform: translateY(0) rotate(-10deg);
          }
          50% {
            transform: translateY(-2px) rotate(10deg);
          }
        }

        .animate-shimmer {
          animation: shimmer 2s infinite;
        }

        .animate-run {
          animation: run 0.4s infinite;
        }

        .animate-sleep {
          animation: sleep 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
