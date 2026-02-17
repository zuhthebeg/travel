/**
 * Offline Mode Manager — toggle + model download
 */
import { useState, useEffect } from 'react';
import { offlineEngine, OfflineEngineManager, type ModelSize, type OfflineEngineState } from '../lib/offlineEngine';

export function OfflineModelManager() {
  const [state, setState] = useState<OfflineEngineState>(offlineEngine.getState());
  const [supported] = useState(() => OfflineEngineManager.isSupported());
  const [recommended] = useState<ModelSize>(() => OfflineEngineManager.recommendedModel());
  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem('offline_mode') === 'true');

  useEffect(() => offlineEngine.subscribe(setState), []);

  const toggleOfflineMode = (on: boolean) => {
    setOfflineMode(on);
    localStorage.setItem('offline_mode', on ? 'true' : 'false');
    if (on && state.status === 'idle' && supported) {
      offlineEngine.init(recommended);
    }
    if (!on && state.status === 'ready') {
      offlineEngine.unload();
    }
  };

  if (!supported) {
    return (
      <div className="alert alert-warning text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span>이 브라우저는 WebGPU를 지원하지 않아 오프라인 모드를 사용할 수 없습니다.</span>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4 gap-3">
        <div className="flex items-center justify-between">
          <h3 className="card-title text-sm">
            ✈️ 오프라인 모드
            {state.status === 'ready' && offlineMode && <span className="badge badge-success badge-xs ml-1">ON</span>}
          </h3>
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={offlineMode}
            onChange={e => toggleOfflineMode(e.target.checked)}
          />
        </div>

        <p className="text-xs text-base-content/60">
          여행 전 WiFi에서 켜두세요. 인터넷 없이도 AI 비서와 여행 데이터를 사용할 수 있습니다.
        </p>

        {offlineMode && (state.status === 'downloading' || state.status === 'loading') && (
          <div className="space-y-2">
            <progress className="progress progress-primary w-full" value={state.progress} max="100" />
            <p className="text-xs text-center text-base-content/70">{state.progressText}</p>
          </div>
        )}

        {offlineMode && state.status === 'ready' && (
          <div className="text-xs text-success flex items-center gap-1">
            ✅ AI 모델 준비 완료 ({OfflineEngineManager.getModelInfo(state.modelSize || 'small').label})
          </div>
        )}

        {offlineMode && state.status === 'error' && (
          <div className="space-y-2">
            <p className="text-xs text-error">{state.error}</p>
            <button onClick={() => offlineEngine.init(recommended)} className="btn btn-xs btn-outline">재시도</button>
          </div>
        )}

        {!offlineMode && (
          <div className="text-xs text-base-content/40">
            오프라인 모드가 꺼져 있습니다. 서버 API를 사용합니다.
          </div>
        )}
      </div>
    </div>
  );
}
