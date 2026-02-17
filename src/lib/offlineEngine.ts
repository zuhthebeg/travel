/**
 * Offline AI Engine — WebLLM + Qwen3
 * 
 * Manages browser-based LLM for offline travel assistant.
 * Uses @mlc-ai/web-llm with Qwen3-0.6B (default) or Qwen3-1.7B (high-end).
 */
// Dynamic import to keep main bundle small
type MLCEngine = any;
type InitProgressReport = { progress: number; text: string };

// Model configs
const MODELS = {
  small: {
    id: 'Qwen3-0.6B-q4f16_1-MLC',
    label: 'Qwen3 0.6B',
    sizeHint: '~400MB',
    vramMB: 600,
    desc: '가벼움, 간단한 대화',
  },
  medium: {
    id: 'Qwen3-1.7B-q4f16_1-MLC',
    label: 'Qwen3 1.7B',
    sizeHint: '~1GB',
    vramMB: 1500,
    desc: '균형잡힌 성능',
  },
  large: {
    id: 'Qwen3-4B-q4f16_1-MLC',
    label: 'Qwen3 4B',
    sizeHint: '~2.5GB',
    vramMB: 3500,
    desc: '고품질 대화 + JSON',
  },
} as const;

export type ModelSize = keyof typeof MODELS;

export interface OfflineEngineState {
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number; // 0-100
  progressText: string;
  error?: string;
  modelSize?: ModelSize;
}

type StateListener = (state: OfflineEngineState) => void;

class OfflineEngineManager {
  private engine: MLCEngine | null = null;
  private state: OfflineEngineState = { status: 'idle', progress: 0, progressText: '' };
  private listeners = new Set<StateListener>();

  getState(): OfflineEngineState {
    return this.state;
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(patch: Partial<OfflineEngineState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(fn => fn(this.state));
  }

  /** Check WebGPU support */
  static isSupported(): boolean {
    return 'gpu' in navigator;
  }

  /** Recommend model size based on device memory */
  static recommendedModel(): ModelSize {
    const mem = (navigator as any).deviceMemory;
    if (mem && mem >= 8) return 'large';
    if (mem && mem >= 4) return 'medium';
    return 'small';
  }

  static getModelInfo(size: ModelSize) {
    return MODELS[size];
  }

  /** Check if model is cached (downloaded) */
  async isModelCached(size: ModelSize = 'small'): Promise<boolean> {
    try {
      const cache = await caches.open('webllm/model');
      const keys = await cache.keys();
      const modelId = MODELS[size].id;
      return keys.some(k => k.url.includes(modelId));
    } catch {
      // Cache API might not include WebLLM cache; fallback to localStorage flag
      return localStorage.getItem(`offline_model_${size}_cached`) === 'true';
    }
  }

  /** Download and initialize engine */
  async init(size: ModelSize = 'small'): Promise<void> {
    if (this.state.status === 'downloading' || this.state.status === 'loading') return;

    if (!OfflineEngineManager.isSupported()) {
      this.setState({ status: 'error', error: 'WebGPU를 지원하지 않는 브라우저입니다.' });
      return;
    }

    const model = MODELS[size];
    this.setState({ status: 'downloading', progress: 0, progressText: '모델 다운로드 중...', modelSize: size });

    try {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      this.engine = await CreateMLCEngine(model.id, {
        initProgressCallback: (report: InitProgressReport) => {
          const pct = Math.round(report.progress * 100);
          this.setState({
            status: pct >= 100 ? 'loading' : 'downloading',
            progress: pct,
            progressText: report.text || `다운로드 중... ${pct}%`,
          });
        },
      });

      localStorage.setItem(`offline_model_${size}_cached`, 'true');
      this.setState({ status: 'ready', progress: 100, progressText: '준비 완료' });
    } catch (err: any) {
      console.error('WebLLM init failed:', err);
      this.setState({
        status: 'error',
        error: err?.message || '모델 초기화에 실패했습니다.',
      });
    }
  }

  /** Send chat message */
  async chat(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string,
  ): Promise<string> {
    if (!this.engine || this.state.status !== 'ready') {
      throw new Error('오프라인 AI가 준비되지 않았습니다.');
    }

    // Qwen3: add /no_think to disable thinking mode (prevents <think> tags)
    const systemWithNoThink = systemPrompt + '\n/no_think';

    const chatMessages = [
      { role: 'system' as const, content: systemWithNoThink },
      ...messages.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userMessage },
    ];

    const reply = await this.engine.chat.completions.create({
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 512,
    });

    let content = reply.choices[0]?.message?.content || '응답을 생성하지 못했습니다.';
    // Strip any remaining <think>...</think> tags
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return content;
  }

  /** Unload engine to free memory */
  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
    this.setState({ status: 'idle', progress: 0, progressText: '' });
  }

  isReady(): boolean {
    return this.state.status === 'ready' && this.engine !== null;
  }
}

// Singleton
export const offlineEngine = new OfflineEngineManager();
export { OfflineEngineManager, MODELS };
