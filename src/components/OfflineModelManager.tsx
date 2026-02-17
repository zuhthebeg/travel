/**
 * Offline AI Model Manager — download & status UI
 */
import { useState, useEffect } from 'react';
import { offlineEngine, OfflineEngineManager, type ModelSize, type OfflineEngineState } from '../lib/offlineEngine';

export function OfflineModelManager() {
  const [state, setState] = useState<OfflineEngineState>(offlineEngine.getState());
  const [supported] = useState(() => OfflineEngineManager.isSupported());
  const [recommended] = useState<ModelSize>(() => OfflineEngineManager.recommendedModel());

  useEffect(() => offlineEngine.subscribe(setState), []);

  if (!supported) {
    return (
      <div className="alert alert-warning text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span>이 브라우저는 WebGPU를 지원하지 않아 오프라인 AI를 사용할 수 없습니다.</span>
      </div>
    );
  }

  const handleInit = (size: ModelSize) => offlineEngine.init(size);
  const handleUnload = () => offlineEngine.unload();

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4 gap-3">
        <h3 className="card-title text-sm">
          🧠 오프라인 AI
          {state.status === 'ready' && <span className="badge badge-success badge-xs">준비됨</span>}
          {state.status === 'error' && <span className="badge badge-error badge-xs">오류</span>}
        </h3>

        <p className="text-xs text-base-content/60">
          인터넷 없이도 여행 비서를 사용할 수 있습니다. WiFi에서 미리 모델을 다운로드하세요.
        </p>

        {state.status === 'idle' && (
          <div className="flex flex-col gap-2">
            {(['small', 'large'] as ModelSize[]).map(size => {
              const info = OfflineEngineManager.getModelInfo(size);
              const isRec = size === recommended;
              return (
                <button
                  key={size}
                  onClick={() => handleInit(size)}
                  className={`btn btn-sm ${isRec ? 'btn-primary' : 'btn-outline'}`}
                >
                  {info.label} ({info.sizeHint})
                  {isRec && ' ⭐'}
                </button>
              );
            })}
          </div>
        )}

        {(state.status === 'downloading' || state.status === 'loading') && (
          <div className="space-y-2">
            <progress className="progress progress-primary w-full" value={state.progress} max="100" />
            <p className="text-xs text-center text-base-content/70">{state.progressText}</p>
          </div>
        )}

        {state.status === 'ready' && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-success">✅ {OfflineEngineManager.getModelInfo(state.modelSize || 'small').label}</span>
            <button onClick={handleUnload} className="btn btn-xs btn-ghost text-error">해제</button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="space-y-2">
            <p className="text-xs text-error">{state.error}</p>
            <button onClick={() => handleInit(recommended)} className="btn btn-xs btn-outline">재시도</button>
          </div>
        )}
      </div>
    </div>
  );
}
