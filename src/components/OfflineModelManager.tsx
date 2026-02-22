/**
 * Offline Mode Manager — V3
 *
 * Two-track activation:
 * 1) Trip data bootstrap (all trips → IndexedDB)
 * 2) WebLLM AI model download (optional — "none" by default)
 */
import { useState, useEffect, useCallback } from 'react';
import { offlineEngine, OfflineEngineManager, MODELS, type ModelSize, type OfflineEngineState } from '../lib/offlineEngine';
import { runBootstrap, cancelBootstrap, onBootstrapProgress, startKeepWarm, stopKeepWarm } from '../lib/offline/bootstrap';
import { enableAutoSync, disableAutoSync, runSync } from '../lib/offline/syncEngine';
import type { BootstrapProgress } from '../lib/offline/types';
import { useTranslation } from 'react-i18next';

type ModelOption = ModelSize | 'none';

export function OfflineModelManager() {
  const { t } = useTranslation();
  const [aiState, setAiState] = useState<OfflineEngineState>(offlineEngine.getState());
  const [supported] = useState(() => OfflineEngineManager.isSupported());
  const [offlineMode, setOfflineMode] = useState(() => localStorage.getItem('offline_mode') === 'true');
  const [selectedModel, setSelectedModel] = useState<ModelOption>(() => {
    return (localStorage.getItem('offline_model_size') as ModelOption) || 'none';
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

  // Restore previous bootstrap status on mount
  useEffect(() => {
    if (offlineMode) {
      import('../lib/db').then(({ getSyncMeta }) => {
        getSyncMeta<string>('offlineBootstrapStatus').then(status => {
          if (status === 'done') {
            setDataStatus('done');
            // Restore progress from plan count
            import('../lib/db').then(({ getCachedPlans }) => {
              getCachedPlans().then(plans => {
                setDataProgress({ total: plans.length, done: plans.length, failed: 0 });
              });
            });
          }
        });
      });
    }
  }, [offlineMode]);

  const toggleOfflineMode = useCallback((on: boolean) => {
    setOfflineMode(on);
    localStorage.setItem('offline_mode', on ? 'true' : 'false');

    if (on) {
      // Track 1: Data bootstrap (always)
      runBootstrap().catch(console.error);
      startKeepWarm();
      enableAutoSync();

      // Track 2: AI model (only if not "none")
      if (selectedModel !== 'none' && aiState.status === 'idle' && supported) {
        localStorage.setItem('offline_model_size', selectedModel);
        offlineEngine.init(selectedModel as ModelSize);
      }
    } else {
      // Flush pending ops before turning off
      runSync().then(({ synced, failed }) => {
        if (synced > 0 || failed > 0) {
          console.log(`[offline] Sync on disable: ${synced} synced, ${failed} failed`);
        }
      }).catch(console.error);
      if (aiState.status === 'ready' || aiState.status === 'downloading' || aiState.status === 'loading') {
        offlineEngine.unload();
      }
      cancelBootstrap();
      stopKeepWarm();
      disableAutoSync();
    }
  }, [aiState.status, supported, selectedModel]);

  const handleModelChange = (option: ModelOption) => {
    setSelectedModel(option);
    localStorage.setItem('offline_model_size', option);

    if (option === 'none') {
      // Unload if currently loaded
      if (aiState.status === 'ready' || aiState.status === 'downloading' || aiState.status === 'loading') {
        offlineEngine.unload();
      }
    } else if (offlineMode && supported) {
      // Download/switch model
      if (aiState.status === 'ready' && aiState.modelSize !== option) {
        offlineEngine.unload().then(() => offlineEngine.init(option as ModelSize));
      } else if (aiState.status === 'idle') {
        offlineEngine.init(option as ModelSize);
      }
    }
  };

  const modelEntries = Object.entries(MODELS) as [ModelSize, typeof MODELS[ModelSize]][];
  const isAiNone = selectedModel === 'none';
  const isAiReady = aiState.status === 'ready' && offlineMode && !isAiNone;
  const isDataReady = dataStatus === 'done' && offlineMode;

  return (
    <div className={`card shadow-sm ${offlineMode ? 'bg-red-50 dark:bg-red-950/40 border-2 border-red-400 dark:border-red-600' : 'bg-base-200'}`}>
      <div className="card-body p-4 gap-3">
        {/* Header + toggle */}
        <div className="flex items-center justify-between">
          <h3 className="card-title text-sm">
            {t('offline.title')}
            {offlineMode && isDataReady && (isAiReady || isAiNone) && <span className="badge badge-success badge-xs ml-1">{t('offline.done')}</span>}
            {offlineMode && (dataStatus === 'in_progress' || aiState.status === 'downloading' || aiState.status === 'loading') && (
              <span className="badge badge-warning badge-xs ml-1">{t('offline.preparing')}</span>
            )}
          </h3>
          <input
            type="checkbox"
            className={`toggle toggle-md ${offlineMode ? 'toggle-error' : 'toggle-primary'}`}
            checked={offlineMode}
            onChange={e => toggleOfflineMode(e.target.checked)}
          />
        </div>

        <p className="text-xs text-base-content/60">
          {t('offline.desc')}
        </p>

        {offlineMode && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-warning-content/80">{t('offline.cautionTitle')}</p>
            <ul className="text-[10px] text-base-content/60 space-y-0.5 list-disc list-inside">
              <li>{t('offline.caution1')}</li>
              <li>{t('offline.caution2')}</li>
              <li>{t('offline.caution3')}</li>
              <li>{t('offline.caution4')}</li>
            </ul>
          </div>
        )}

        {offlineMode && (
          <>
            {/* ── Track 1: Data Cache (FIRST) ── */}
            <div className="bg-base-100 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t('offline.travelData')}</span>
                {isDataReady && <span className="text-xs text-success">{t('offline.ready')}</span>}
                {dataStatus === 'failed' && <span className="text-xs text-error">{t('offline.failed')}</span>}
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
                      ? t('offline.downloadingPlan', { title: dataProgress.currentPlanTitle, done: dataProgress.done, total: dataProgress.total })
                      : t('offline.downloadingData', { done: dataProgress.done, total: dataProgress.total })
                    }
                  </p>
                </div>
              )}

              {isDataReady && dataProgress && (
                <p className="text-[10px] text-base-content/50">
                  {t('offline.cacheDone', { total: dataProgress.total, failed: dataProgress.failed })}
                </p>
              )}

              {dataStatus === 'failed' && (
                <button onClick={() => runBootstrap().catch(console.error)} className="btn btn-xs btn-outline">{t('offline.retry')}</button>
              )}
            </div>

            {/* ── Track 2: AI Model (SECOND) ── */}
            <div className="bg-base-100 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t('offline.aiModel')}</span>
                {isAiNone && <span className="text-xs text-base-content/40">{t('offline.aiOff')}</span>}
                {isAiReady && <span className="text-xs text-success">{t('offline.ready')}</span>}
                {!isAiNone && aiState.status === 'error' && <span className="text-xs text-error">{t('offline.failed')}</span>}
              </div>

              {!isAiNone && (aiState.status === 'downloading' || aiState.status === 'loading') && (
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

              {!isAiNone && aiState.status === 'error' && (
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-error flex-1">{aiState.error}</p>
                  <button onClick={() => offlineEngine.init(selectedModel as ModelSize)} className="btn btn-xs btn-outline">{t('offline.retry')}</button>
                </div>
              )}
            </div>

            {/* ── Model Selection ── */}
            <details className="collapse collapse-arrow bg-base-100 rounded-lg">
              <summary className="collapse-title text-xs font-medium p-3 min-h-0">
                {t('offline.changeModel')}
              </summary>
              <div className="collapse-content px-3 pb-3">
                <div className="space-y-1.5">
                  {/* None option */}
                  <label
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-xs
                      ${selectedModel === 'none' ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-base-300'}`}
                  >
                    <input
                      type="radio"
                      name="offlineModel"
                      className="radio radio-primary radio-xs"
                      checked={selectedModel === 'none'}
                      onChange={() => handleModelChange('none')}
                      disabled={aiState.status === 'downloading' || aiState.status === 'loading'}
                    />
                    <div className="flex-1">
                      <span className="font-medium">{t('offline.aiOff')}</span>
                      <span className="text-base-content/50 ml-1">{t('offline.dataOnly')}</span>
                    </div>
                  </label>

                  {/* Model options */}
                  {supported && modelEntries.map(([size, info]) => (
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
                      </div>
                    </label>
                  ))}

                  {!supported && (
                    <p className="text-[10px] text-base-content/40 p-2">
                      {t('offline.noWebGpu')}
                    </p>
                  )}
                </div>
              </div>
            </details>
          </>
        )}

        {!offlineMode && (
          <div className="text-xs text-base-content/40">
            {t('offline.offMessage')}
          </div>
        )}
      </div>
    </div>
  );
}
