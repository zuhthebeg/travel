/**
 * Offline Mode Manager — V3
 *
 * Two-track activation:
 * 1) WebLLM AI model download
 * 2) Trip data bootstrap (all trips → IndexedDB)
 */
import { useState, useEffect, useCallback } from 'react';
import { offlineEngine, OfflineEngineManager, MODELS, type ModelSize, type OfflineEngineState } from '../lib/offlineEngine';
import { runBootstrap, cancelBootstrap, onBootstrapProgress, startKeepWarm, stopKeepWarm } from '../lib/offline/bootstrap';
import { enableAutoSync, disableAutoSync, runSync } from '../lib/offline/syncEngine';
import type { BootstrapProgress } from '../lib/offline/types';

export function OfflineModelManager() {
  const [aiState, setAiState] = useState<OfflineEngineState>(offlineEngine.getState());
  const [supported] = useState(() => OfflineEngineManager.isSupported());
  const [recommended] = useState<ModelSize>(() => OfflineEngineManager.recommendedModel());
  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem('offline_mode') === 'true');
  const [selectedModel, setSelectedModel] = useState<ModelSize>(() => {
    return (localStorage.getItem('offline_model_size') as ModelSize) || recommended;
  });

  // Data bootstrap state
  const [dataStatus, setDataStatus] = useState<string>('idle');
  const [dataProgress, setDataProgress] = useState<BootstrapProgress | null>(null);

  useEffect(() => offlineEngine.subscribe(setAiState), []);

  useEffect(() => {
    return onBootstrapProgress((progress, status) => {
      setDataProgress(progress);
      setDataStatus(status);
    });
  }, []);

  const toggleOfflineMode = useCallback((on: boolean) => {
    setOfflineMode(on);
    localStorage.setItem('offline_mode', on ? 'true' : 'false');

    if (on) {
      // Track 1: AI model
      if (aiState.status === 'idle' && supported) {
        localStorage.setItem('offline_model_size', selectedModel);
        offlineEngine.init(selectedModel);
      }
      // Track 2: Data bootstrap
      runBootstrap().catch(console.error);
      // Track 3: Keep-warm + auto-sync
      startKeepWarm();
      enableAutoSync();
    } else {
      // Flush pending ops before turning off
      runSync().then(({ synced, failed }) => {
        if (synced > 0 || failed > 0) {
          console.log(`[offline] Sync on disable: ${synced} synced, ${failed} failed`);
        }
      }).catch(console.error);
      // Stop everything
      if (aiState.status === 'ready' || aiState.status === 'downloading' || aiState.status === 'loading') {
        offlineEngine.unload();
      }
      cancelBootstrap();
      stopKeepWarm();
      disableAutoSync();
    }
  }, [aiState.status, supported, selectedModel]);

  const handleModelChange = (size: ModelSize) => {
    setSelectedModel(size);
    localStorage.setItem('offline_model_size', size);
    if (offlineMode && aiState.status === 'ready' && aiState.modelSize !== size) {
      offlineEngine.unload().then(() => offlineEngine.init(size));
    }
  };

  if (!supported) {
    return (
      <div className="alert alert-warning text-sm">
        <span>이 브라우저는 WebGPU를 지원하지 않아 오프라인 AI를 사용할 수 없습니다. 데이터 캐싱은 가능합니다.</span>
      </div>
    );
  }

  const modelEntries = Object.entries(MODELS) as [ModelSize, typeof MODELS[ModelSize]][];
  const isAiReady = aiState.status === 'ready' && offlineMode;
  const isDataReady = dataStatus === 'done' && offlineMode;
  const isFullyReady = isAiReady && isDataReady;

  return (
    <div className="card bg-base-200 shadow-sm">
      <div className="card-body p-4 gap-3">
        {/* Header + toggle */}
        <div className="flex items-center justify-between">
          <h3 className="card-title text-sm">
            ✈️ 오프라인 모드
            {isFullyReady && <span className="badge badge-success badge-xs ml-1">완료</span>}
            {offlineMode && !isFullyReady && (dataStatus === 'in_progress' || aiState.status === 'downloading' || aiState.status === 'loading') && (
              <span className="badge badge-warning badge-xs ml-1">준비중</span>
            )}
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

        {offlineMode && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-warning-content/80">⚡ 오프라인 모드 주의사항</p>
            <ul className="text-[10px] text-base-content/60 space-y-0.5 list-disc list-inside">
              <li>AI 모델이 기기에서 실행되어 <b>배터리 소모가 증가</b>하고 <b>발열</b>이 생길 수 있습니다</li>
              <li>온라인 AI 대비 <b>성능과 품질이 낮습니다</b> (간단한 추천/요약 수준)</li>
              <li><b>이미지 인식, 음성 입력</b>은 오프라인에서 지원되지 않습니다</li>
              <li>새 여행 생성, 멤버 초대 등은 <b>온라인에서만</b> 가능합니다</li>
            </ul>
          </div>
        )}

        {offlineMode && (
          <>
            {/* ── Track 1: AI Model ── */}
            <div className="bg-base-100 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">🤖 AI 모델</span>
                {isAiReady && <span className="text-xs text-success">✅ 준비됨</span>}
                {aiState.status === 'error' && <span className="text-xs text-error">❌ 실패</span>}
              </div>

              {(aiState.status === 'downloading' || aiState.status === 'loading') && (
                <div>
                  <progress className="progress progress-primary w-full h-2" value={aiState.progress} max="100" />
                  <p className="text-[10px] text-center text-base-content/60 mt-0.5">{aiState.progressText}</p>
                </div>
              )}

              {isAiReady && (
                <p className="text-[10px] text-base-content/50">
                  {OfflineEngineManager.getModelInfo(aiState.modelSize || 'medium').label}
                </p>
              )}

              {aiState.status === 'error' && (
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-error flex-1">{aiState.error}</p>
                  <button onClick={() => offlineEngine.init(selectedModel)} className="btn btn-xs btn-outline">재시도</button>
                </div>
              )}
            </div>

            {/* ── Track 2: Data Cache ── */}
            <div className="bg-base-100 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">📦 여행 데이터</span>
                {isDataReady && <span className="text-xs text-success">✅ 준비됨</span>}
                {dataStatus === 'failed' && <span className="text-xs text-error">❌ 실패</span>}
              </div>

              {dataStatus === 'in_progress' && dataProgress && (
                <div>
                  <progress
                    className="progress progress-secondary w-full h-2"
                    value={dataProgress.done}
                    max={dataProgress.total || 1}
                  />
                  <p className="text-[10px] text-center text-base-content/60 mt-0.5">
                    {dataProgress.currentPlanTitle
                      ? `${dataProgress.currentPlanTitle} 다운로드 중 (${dataProgress.done}/${dataProgress.total})`
                      : `여행 데이터 다운로드 중... (${dataProgress.done}/${dataProgress.total})`
                    }
                  </p>
                </div>
              )}

              {isDataReady && dataProgress && (
                <p className="text-[10px] text-base-content/50">
                  {dataProgress.total}개 여행 캐시 완료
                  {dataProgress.failed > 0 && ` (${dataProgress.failed}개 실패)`}
                </p>
              )}

              {dataStatus === 'failed' && (
                <button onClick={() => runBootstrap().catch(console.error)} className="btn btn-xs btn-outline">재시도</button>
              )}
            </div>

            {/* ── Model Selection ── */}
            <details className="collapse collapse-arrow bg-base-100 rounded-lg">
              <summary className="collapse-title text-xs font-medium p-3 min-h-0">
                모델 변경
              </summary>
              <div className="collapse-content px-3 pb-3">
                <div className="space-y-1.5">
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
                        disabled={aiState.status === 'downloading' || aiState.status === 'loading'}
                      />
                      <div className="flex-1">
                        <span className="font-medium">{info.label}</span>
                        <span className="text-base-content/50 ml-1">({info.sizeHint})</span>
                        {size === recommended && <span className="badge badge-outline badge-xs ml-1">추천</span>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </>
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
