/**
 * Offline Mode Manager — toggle + model selection + download
 */
import { useState, useEffect } from 'react';
import { offlineEngine, OfflineEngineManager, MODELS, type ModelSize, type OfflineEngineState } from '../lib/offlineEngine';

export function OfflineModelManager() {
  const [state, setState] = useState<OfflineEngineState>(offlineEngine.getState());
  const [supported] = useState(() => OfflineEngineManager.isSupported());
  const [recommended] = useState<ModelSize>(() => OfflineEngineManager.recommendedModel());
  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem('offline_mode') === 'true');
  const [selectedModel, setSelectedModel] = useState<ModelSize>(() => {
    return (localStorage.getItem('offline_model_size') as ModelSize) || recommended;
  });

  useEffect(() => offlineEngine.subscribe(setState), []);

  const toggleOfflineMode = (on: boolean) => {
    setOfflineMode(on);
    localStorage.setItem('offline_mode', on ? 'true' : 'false');
    if (on && state.status === 'idle' && supported) {
      localStorage.setItem('offline_model_size', selectedModel);
      offlineEngine.init(selectedModel);
    }
    if (!on && (state.status === 'ready' || state.status === 'downloading' || state.status === 'loading')) {
      offlineEngine.unload();
    }
  };

  const handleModelChange = (size: ModelSize) => {
    setSelectedModel(size);
    localStorage.setItem('offline_model_size', size);
    // If already running a different model, reload
    if (offlineMode && state.status === 'ready' && state.modelSize !== size) {
      offlineEngine.unload().then(() => offlineEngine.init(size));
    }
  };

  if (!supported) {
    return (
      <div className="alert alert-warning text-sm">
        <span>이 브라우저는 WebGPU를 지원하지 않아 오프라인 모드를 사용할 수 없습니다.</span>
      </div>
    );
  }

  const modelEntries = Object.entries(MODELS) as [ModelSize, typeof MODELS[ModelSize]][];

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4 gap-3">
        {/* Header + toggle */}
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

        {/* Model selection */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-base-content/70">AI 모델 선택</p>
          {modelEntries.map(([size, info]) => (
            <label
              key={size}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-xs
                ${selectedModel === size ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-base-300'}`}
            >
              <input
                type="radio"
                name="offlineModel"
                className="radio radio-primary radio-xs"
                checked={selectedModel === size}
                onChange={() => handleModelChange(size)}
                disabled={state.status === 'downloading' || state.status === 'loading'}
              />
              <div className="flex-1">
                <span className="font-medium">{info.label}</span>
                <span className="text-base-content/50 ml-1">({info.sizeHint})</span>
                {size === recommended && <span className="badge badge-outline badge-xs ml-1">추천</span>}
                <p className="text-base-content/40 text-[10px]">{info.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Progress */}
        {offlineMode && (state.status === 'downloading' || state.status === 'loading') && (
          <div className="space-y-2">
            <progress className="progress progress-primary w-full" value={state.progress} max="100" />
            <p className="text-xs text-center text-base-content/70">{state.progressText}</p>
          </div>
        )}

        {/* Ready */}
        {offlineMode && state.status === 'ready' && (
          <div className="text-xs text-success flex items-center gap-1">
            ✅ {OfflineEngineManager.getModelInfo(state.modelSize || 'small').label} 준비 완료
          </div>
        )}

        {/* Error */}
        {offlineMode && state.status === 'error' && (
          <div className="space-y-2">
            <p className="text-xs text-error">{state.error}</p>
            <button onClick={() => offlineEngine.init(selectedModel)} className="btn btn-xs btn-outline">재시도</button>
          </div>
        )}

        {/* Off state */}
        {!offlineMode && (
          <div className="text-xs text-base-content/40">
            오프라인 모드가 꺼져 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}
