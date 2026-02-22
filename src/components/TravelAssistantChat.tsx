import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Loading } from './Loading';
import type { Schedule, TravelMemo } from '../store/types';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import { offlineEngine, OfflineEngineManager, type OfflineEngineState } from '../lib/offlineEngine';

interface TravelAssistantChatProps {
  planId: number;
  planTitle: string;
  planRegion: string | null;
  planStartDate: string;
  planEndDate: string;
  schedules: Schedule[];
  memos?: TravelMemo[]; // Travel memos
  onScheduleChange?: (modifiedIds?: number[]) => void; // Callback when schedules are modified
  onMemoChange?: () => void; // Callback when memos are modified
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function TravelAssistantChat({
  planId,
  planTitle,
  planRegion,
  planStartDate,
  planEndDate,
  schedules,
  memos,
  onScheduleChange,
  onMemoChange,
}: TravelAssistantChatProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    const saved = localStorage.getItem('tts_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; city?: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null); // Base64 preview
  const [imageData, setImageData] = useState<string | null>(null); // Compressed base64 for API
  const [offlineMode] = useState(() => {
    if (localStorage.getItem('offline_mode') !== 'true') return false;
    // Offline mode only works in PWA (standalone)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    return standalone;
  });
  const [offlineState, setOfflineState] = useState<OfflineEngineState>(offlineEngine.getState());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect browser language and map to supported STT/TTS languages
  const detectLanguage = () => {
    const browserLang = navigator.language.toLowerCase();

    // Map browser language to STT/TTS language codes
    if (browserLang.startsWith('ko')) return { stt: 'ko-KR', tts: 'ko-KR', name: '한국어' };
    if (browserLang.startsWith('en')) return { stt: 'en-US', tts: 'en-US', name: 'English' };
    if (browserLang.startsWith('ja')) return { stt: 'ja-JP', tts: 'ja-JP', name: '日本語' };
    if (browserLang.startsWith('zh-tw') || browserLang.startsWith('zh-hant')) return { stt: 'zh-TW', tts: 'zh-TW', name: '繁體中文' };
    if (browserLang.startsWith('zh')) return { stt: 'zh-CN', tts: 'zh-CN', name: '简体中文' };
    if (browserLang.startsWith('es')) return { stt: 'es-ES', tts: 'es-ES', name: 'Español' };
    if (browserLang.startsWith('fr')) return { stt: 'fr-FR', tts: 'fr-FR', name: 'Français' };
    if (browserLang.startsWith('de')) return { stt: 'de-DE', tts: 'de-DE', name: 'Deutsch' };

    // Default to Korean
    return { stt: 'ko-KR', tts: 'ko-KR', name: '한국어' };
  };

  const [userLanguage] = useState(detectLanguage());

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
    // setLanguage, // Reserved for future use to allow runtime language switching
  } = useSpeechRecognition(userLanguage.stt); // Use the hook with detected language

  useEffect(() => {
    if (transcript) {
      setInput(transcript); // Update input with transcribed text
    }
  }, [transcript]);

  // Offline engine state subscription
  useEffect(() => {
    const unsub = offlineEngine.subscribe(setOfflineState);
    return unsub;
  }, []);

  // Auto-load offline engine when offline mode is enabled
  useEffect(() => {
    if (offlineMode && offlineState.status === 'idle' && OfflineEngineManager.isSupported()) {
      const savedModel = (localStorage.getItem('offline_model_size') || 'medium') as import('../lib/offlineEngine').ModelSize;
      offlineEngine.init(savedModel);
    }
  }, [offlineMode, offlineState.status]);

  // Use offline AI when: offline mode toggle is ON + engine is ready
  const useOfflineAI = offlineMode && offlineEngine.isReady();

  // Auto-focus input and prepare TTS when component mounts
  useEffect(() => {
    inputRef.current?.focus();

    // Initialize TTS
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      // Load voices
      window.speechSynthesis.getVoices();
    }

    // Get user location
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          // Try to get city name using reverse geocoding (optional)
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ko`
            );
            const data = await response.json();
            const city = data.address?.city || data.address?.town || data.address?.county || data.address?.state;

            setUserLocation({ lat: latitude, lng: longitude, city });
          } catch (error) {
            console.error('Failed to get city name:', error);
            setUserLocation({ lat: latitude, lng: longitude });
          }
        },
        (error) => {
          console.debug('Geolocation unavailable:', error.code, error.message);
        },
        { timeout: 5000 }
      );
    }
  }, []);

  // Save TTS preference to localStorage
  useEffect(() => {
    localStorage.setItem('tts_enabled', ttsEnabled.toString());
  }, [ttsEnabled]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  // TTS function with language support
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = userLanguage.tts;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      // Try to find a voice that matches the language
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(voice => voice.lang.startsWith(userLanguage.tts.split('-')[0]));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Image compression and handling
  const compressImage = (file: File, maxWidth = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Scale down if needed
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Convert to base64 JPEG
          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      alert(t('chat.errors.imageTooLarge'));
      return;
    }

    try {
      // Create preview with lower quality for display
      const preview = await compressImage(file, 400, 0.5);
      setImagePreview(preview);

      // Create compressed image for API (higher quality but still compact)
      const compressed = await compressImage(file, 800, 0.7);
      setImageData(compressed);
    } catch (error) {
      console.error('Failed to compress image:', error);
      alert(t('chat.errors.imageProcessFailed'));
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageData(null);
  };

  const handleSendMessage = async (retryCount = 0, lastUserMessage?: string) => {
    const messageToSend = retryCount === 0 ? input : lastUserMessage;

    if (!messageToSend || (messageToSend.trim() === '' && retryCount === 0)) return;

    // Stop STT if listening
    if (isListening) {
      stopListening();
    }

    // Focus back to input after sending
    if (retryCount === 0) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }

    const userMessage: Message = { role: 'user', content: messageToSend };

    if (retryCount === 0) {
      setMessages((prevMessages) => [...prevMessages, userMessage]);
      setInput('');
    }

    setIsLoading(true);

    // Get current time and format it
    const now = new Date();
    const currentTime = now.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      timeZone: 'Asia/Seoul'
    });

    const locationInfo = userLocation?.city
      ? `\n  Current user location: ${userLocation.city} (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})`
      : userLocation
      ? `\n  Current user location: (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})`
      : '';

    // Language-specific response instructions
    const getLanguageInstructions = () => {
      const lang = userLanguage.stt.split('-')[0];
      switch (lang) {
        case 'ko':
          return 'All responses should be in Korean (한국어). Use natural, conversational Korean that sounds good when spoken aloud.';
        case 'en':
          return 'All responses should be in English. Use natural, conversational English that sounds good when spoken aloud.';
        case 'ja':
          return 'All responses should be in Japanese (日本語). Use natural, conversational Japanese that sounds good when spoken aloud.';
        case 'zh':
          return userLanguage.stt === 'zh-TW'
            ? 'All responses should be in Traditional Chinese (繁體中文). Use natural, conversational Chinese that sounds good when spoken aloud.'
            : 'All responses should be in Simplified Chinese (简体中文). Use natural, conversational Chinese that sounds good when spoken aloud.';
        case 'es':
          return 'All responses should be in Spanish (Español). Use natural, conversational Spanish that sounds good when spoken aloud.';
        case 'fr':
          return 'All responses should be in French (Français). Use natural, conversational French that sounds good when spoken aloud.';
        case 'de':
          return 'All responses should be in German (Deutsch). Use natural, conversational German that sounds good when spoken aloud.';
        default:
          return 'All responses should be in Korean (한국어).';
      }
    };

    // systemPrompt is now generated server-side in /api/assistant/index.ts

    // Capture current image and clear it before sending
    const currentImage = imageData;
    if (retryCount === 0) {
      clearImage();
    }

    try {
      // === Offline mode: use WebLLM ===
      if (useOfflineAI) {
        const offlineSystemPrompt = `You are a friendly travel assistant running OFFLINE in the browser.
Current time: ${currentTime}${locationInfo}
Travel plan: "${planTitle}" in "${planRegion}" (${planStartDate} ~ ${planEndDate})
Schedules:
${(schedules || []).slice(0, 30).map(s => `- ${s.date}${s.time ? ` ${s.time}` : ''}: ${s.title}${s.place ? ` @ ${s.place}` : ''}`).join('\n')}

Rules:
- Keep answers concise (1-3 sentences)
- ${getLanguageInstructions()}
- You CAN answer questions, give travel tips, help with English phrases
- You CANNOT directly modify schedules, but you CAN suggest changes
- When user asks to add/edit/delete a schedule, respond with your message AND include a JSON action block like this:
  %%%ACTION{"type":"add","date":"2026-05-28","title":"센소지 방문","place":"센소지, 도쿄","time":"10:00"}%%%
  %%%ACTION{"type":"edit","scheduleId":637,"title":"new title"}%%%
  %%%ACTION{"type":"delete","scheduleId":637}%%%
- Only include %%%ACTION...%%% when user explicitly asks to modify schedules
- The action will be shown as a clickable card for the user to confirm`;

        const reply = await offlineEngine.chat(offlineSystemPrompt, messages, messageToSend!);

        // Parse action cards from AI response
        const actionRegex = /%%%ACTION(\{[^%]+\})%%%/g;
        const actions: Array<Record<string, any>> = [];
        let cleanReply = reply;
        let match;
        while ((match = actionRegex.exec(reply)) !== null) {
          try { actions.push(JSON.parse(match[1])); } catch {}
        }
        cleanReply = cleanReply.replace(/%%%ACTION\{[^%]+\}%%%/g, '').trim();

        const assistantMessage: Message = {
          role: 'assistant',
          content: cleanReply,
          ...(actions.length > 0 ? { actions } : {}),
        } as any;
        setMessages(prev => [...prev, assistantMessage]);
        if (ttsEnabled) speak(assistantMessage.content);
        setIsLoading(false);
        return;
      }

      // === Online mode: use server API ===
      // Auth credential for backend authorization
      const credential =
        localStorage.getItem('X-Auth-Credential') ||
        localStorage.getItem('x-auth-credential') ||
        localStorage.getItem('authCredential') ||
        localStorage.getItem('google_credential') || '';

      const response = await fetch(`${window.location.origin}/api/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(credential ? { 'X-Auth-Credential': credential } : {}),
        },
        body: JSON.stringify({
          message: messageToSend,
          history: messages.slice(-6).map(msg => ({ role: msg.role, parts: [{ text: msg.content }] })),
          planId,
          planTitle,
          planRegion,
          planStartDate,
          planEndDate,
          schedules: schedules.map(s => ({ id: s.id, date: s.date, time: s.time, title: s.title, place: s.place, memo: s.memo, latitude: s.latitude, longitude: s.longitude, country_code: s.country_code })),
          memos,
          image: currentImage || undefined,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error('Assistant API error:', response.status, errBody);
        throw new Error(errBody.detail || errBody.error || `Assistant error ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = { role: 'assistant', content: data.reply || data.response || t('chat.errors.noResponse') };
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);

      // If schedules were modified, notify parent to reload with modified IDs
      if (data.hasChanges && onScheduleChange) {
        onScheduleChange(data.modifiedScheduleIds || []);
      }

      // If memos were modified, notify parent to reload
      if (data.hasMemoChanges && onMemoChange) {
        onMemoChange();
      }

      // Stop STT again in case it was restarted
      if (isListening) {
        stopListening();
      }

      // Automatically speak the assistant's response if TTS is enabled
      if (ttsEnabled) {
        speak(assistantMessage.content);
      }
    } catch (error: any) {
      console.error('Error sending message to assistant:', error);
      console.error('Error name:', error?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      console.error('Error type:', typeof error, Object.keys(error || {}));
      console.error('Request details:', { 
        origin: window.location.origin, 
        url: `${window.location.origin}/api/assistant`,
        hasImage: !!currentImage,
        messageLength: messageToSend?.length
      });

      // Retry up to 3 times
      if (retryCount < 3) {
        console.log(`Retrying... Attempt ${retryCount + 1}/3`);
        setIsLoading(false);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return handleSendMessage(retryCount + 1, messageToSend);
      }

      setMessages((prevMessages) => [
        ...prevMessages,
        { role: 'assistant', content: t('chat.errors.sendFailed') },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-grow overflow-y-auto p-6">
        <div className="flex flex-col space-y-4">
          {/* Offline mode indicator */}
          {offlineMode && (
            <div className={`alert ${useOfflineAI ? 'alert-warning' : 'alert-info'} py-2 text-xs`}>
              {useOfflineAI
                ? t('chat.offline.mode', { model: OfflineEngineManager.getModelInfo(offlineState.modelSize || 'medium').label })
                : offlineState.status === 'downloading' || offlineState.status === 'loading'
                  ? t('chat.offline.loading', { progress: offlineState.progress })
                  : offlineState.status === 'error'
                    ? t('chat.offline.error', { error: offlineState.error })
                    : t('chat.offline.preparing')
              }
              {useOfflineAI && messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); offlineEngine.isReady() && offlineEngine.resetChat?.(); }}
                  className="btn btn-xs btn-ghost ml-auto"
                  title={t('chat.resetTitle')}
                >{t('chat.reset')}</button>
              )}
            </div>
          )}

          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="chat chat-start">
                <div className="chat-bubble chat-bubble-info">
                  {t('chat.welcome')}<br />
                  <span className="text-xs opacity-80">{t('chat.welcomeSub')}</span>
                </div>
              </div>
              <div className="px-2 space-y-3">
                {[
                  { label: t('chat.examples.schedule.label'), items: [
                    t('chat.examples.schedule.item1'),
                    t('chat.examples.schedule.item2'),
                    t('chat.examples.schedule.item3'),
                  ]},
                  { label: t('chat.examples.food.label'), items: [
                    t('chat.examples.food.item1'),
                    t('chat.examples.food.item2'),
                    t('chat.examples.food.item3'),
                  ]},
                  { label: t('chat.examples.local.label'), items: [
                    t('chat.examples.local.item1'),
                    t('chat.examples.local.item2'),
                    t('chat.examples.local.item3'),
                  ]},
                ].map((group) => (
                  <div key={group.label} className="bg-base-200/50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-base-content/70 mb-2">{group.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((example, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setInput(example);
                            inputRef.current?.focus();
                          }}
                          className="badge badge-outline badge-sm hover:badge-primary cursor-pointer transition-colors py-3"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}>
              <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-primary' : 'chat-bubble-secondary'}`}>
                {msg.content}
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => speak(msg.content)}
                    className="btn btn-xs btn-ghost mt-2"
                    disabled={isSpeaking}
                  >
                    {t('chat.listenAgain')}
                  </button>
                )}
              </div>
              {/* Offline action cards */}
              {msg.role === 'assistant' && (msg as any).actions?.map((action: any, ai: number) => (
                <div key={ai} className="mt-1 ml-10">
                  <button
                    className="btn btn-sm btn-outline btn-primary gap-1 text-xs"
                    onClick={async () => {
                      try {
                        if (action.type === 'add') {
                          await import('../lib/api').then(m => m.schedulesAPI.create({
                            plan_id: planId,
                            date: action.date,
                            title: action.title,
                            place: action.place || null,
                            time: action.time || undefined,
                          }));
                          onScheduleChange?.();
                        } else if (action.type === 'edit' && action.scheduleId) {
                          const patch: any = {};
                          if (action.title) patch.title = action.title;
                          if (action.place) patch.place = action.place;
                          if (action.time) patch.time = action.time;
                          if (action.date) patch.date = action.date;
                          await import('../lib/api').then(m => m.schedulesAPI.update(action.scheduleId, patch));
                          onScheduleChange?.([action.scheduleId]);
                        } else if (action.type === 'delete' && action.scheduleId) {
                          if (confirm(t('chat.confirmDeleteSchedule'))) {
                            await import('../lib/api').then(m => m.schedulesAPI.delete(action.scheduleId));
                            onScheduleChange?.();
                          }
                        }
                        setMessages(prev => prev.map((m, mi) =>
                          mi === index ? { ...m, actions: (m as any).actions?.filter((_: any, j: number) => j !== ai) } as any : m
                        ));
                      } catch (err: any) {
                        alert(t('chat.actionFailed', { message: err.message || t('chat.retryOnline') }));
                      }
                    }}
                  >
                    {action.type === 'add' && t('chat.actionAdd', { title: action.title, date: action.date, time: action.time ? ` ${action.time}` : '' })}
                    {action.type === 'edit' && t('chat.actionEdit', { title: action.title || t('chat.schedule') })}
                    {action.type === 'delete' && t('chat.actionDelete', { id: action.scheduleId })}
                  </button>
                </div>
              ))}
            </div>
          ))}
          {isLoading && (
            <div className="chat chat-start">
              <div className="chat-bubble chat-bubble-secondary">
                <Loading />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      {/* Image Preview */}
      {imagePreview && (
        <div className="px-4 py-2 bg-base-200 border-t border-base-300">
          <div className="relative inline-block">
            <img src={imagePreview} alt="Preview" className="h-20 rounded-lg object-cover" />
            <button
              onClick={clearImage}
              className="absolute -top-2 -right-2 btn btn-circle btn-xs btn-error"
              title={t('chat.removeImage')}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      <div className="sticky bottom-0 bg-base-100 p-4 border-t border-base-200 flex items-center gap-2">
        {/* Hidden file input + Image/STT buttons — online only */}
        {!offlineMode && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            
            {/* Image upload button */}
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              variant={imageData ? 'secondary' : 'ghost'}
              className="btn-circle"
              title={t('chat.attachPhoto')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </Button>
          </>
        )}
        
        {!offlineMode && browserSupportsSpeechRecognition && (
          <Button
            onClick={isListening ? stopListening : startListening}
            disabled={isLoading}
            variant={isListening ? 'secondary' : 'ghost'}
            className="btn-circle"
            title={t('chat.voiceInput')}
          >
            {isListening ? <Loading /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 0-6-6v-1.5m6 7.5v3m-3-3h6m-10.875-9.75a6 6 0 0 1 6-6h.75m-12.75 6h.75m-3 0a6 6 0 0 0 6 6h.75" /></svg>}
          </Button>
        )}
        {isSpeaking && (
          <Button
            onClick={stopSpeaking}
            variant="error"
            className="btn-circle"
            title={t('chat.voiceStop')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
            </svg>
          </Button>
        )}
        <Button
          onClick={() => setTtsEnabled(!ttsEnabled)}
          variant={ttsEnabled ? 'primary' : 'ghost'}
          className="btn-circle"
          title={ttsEnabled ? t('chat.ttsOff') : t('chat.ttsOn')}
        >
          {ttsEnabled ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          )}
        </Button>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Stop TTS when user starts typing
            if (isSpeaking) {
              stopSpeaking();
            }
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSendMessage();
            }
          }}
          placeholder={imageData ? t('chat.placeholderImage') : t('chat.placeholder')}
          className="input input-bordered w-full"
          disabled={isLoading || isListening} // Disable input while listening
        />
        <Button onClick={() => handleSendMessage()} disabled={isLoading || isListening} variant="primary">
          {t('chat.send')}
        </Button>
      </div>
    </div>
  );
}
