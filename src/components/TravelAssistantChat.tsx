import { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { Loading } from './Loading';
import type { Schedule, TravelMemo } from '../store/types';
import useSpeechRecognition from '../hooks/useSpeechRecognition'; // Import the hook

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
          console.error('Failed to get user location:', error);
        }
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
      alert('이미지 크기가 너무 큽니다. 10MB 이하의 이미지를 선택해주세요.');
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
      alert('이미지 처리에 실패했습니다.');
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

    const systemPrompt = `You are a friendly and helpful travel assistant. Your goal is to help users plan their trips.

  LANGUAGE: User's preferred language is ${userLanguage.name} (${userLanguage.stt})
  Current time: ${currentTime}${locationInfo}

  The current travel plan is for "${planTitle}" in "${planRegion}" from ${planStartDate} to ${planEndDate}.
  The plan currently has the following schedules:
  ${(schedules || []).map(s => {
    let scheduleInfo = `- ${s.date}${s.time ? ` ${s.time}` : ''}: ${s.title}`;
    if (s.place) scheduleInfo += ` at ${s.place}`;
    if (s.memo) scheduleInfo += ` (메모: ${s.memo})`;
    if (s.plan_b) scheduleInfo += ` [대안B: ${s.plan_b}]`;
    if (s.plan_c) scheduleInfo += ` [대안C: ${s.plan_c}]`;
    if (s.rating) scheduleInfo += ` [평점: ${s.rating}/5]`;
    if (s.review) scheduleInfo += ` [리뷰: ${s.review}]`;
    return scheduleInfo;
  }).join('\n')}

  You can provide information about destinations, suggest activities, and help with scheduling.
  Use the current time, user location, and detailed schedule information (including time, memo, alternatives, ratings, reviews) to provide more relevant and contextual answers.

  IMPORTANT: Keep your answers VERY concise and brief (1-2 sentences maximum). Use simple, natural language that sounds good when spoken aloud.
  Avoid long explanations, lists, or formatting. Focus on the most essential information only.
  ${getLanguageInstructions()}`;

    // Capture current image and clear it before sending
    const currentImage = imageData;
    if (retryCount === 0) {
      clearImage();
    }

    try {
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
          history: messages.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] })),
          planId,
          planTitle,
          planRegion,
          planStartDate,
          planEndDate,
          schedules,
          memos, // Include travel memos
          systemPrompt, // Pass the systemPrompt to the backend
          image: currentImage, // Include image if present
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from assistant');
      }

      const data = await response.json();
      const assistantMessage: Message = { role: 'assistant', content: data.reply || data.response || '응답을 받지 못했습니다.' };
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
    } catch (error) {
      console.error('Error sending message to assistant:', error);
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
        { role: 'assistant', content: '죄송합니다. 메시지를 처리하는 데 문제가 발생했습니다. (3회 재시도 실패)' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-grow overflow-y-auto p-6">
        <div className="flex flex-col space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="chat chat-start">
                <div className="chat-bubble chat-bubble-info">
                  안녕하세요! 여행에 대해 뭐든 물어보세요 🧳<br />
                  <span className="text-xs opacity-80">일정 수정, 맛집·명소 추천, 현지 정보까지 도와드릴게요.</span>
                </div>
              </div>
              <div className="px-2 space-y-3">
                {[
                  { label: '📅 일정 관리', items: [
                    '일정 모두 10일 뒤로 미뤄줘',
                    '첫째날 일정 추천해줘',
                    '하루에 주요 일정 2개만 남겨줘',
                  ]},
                  { label: '🍽️ 맛집·명소', items: [
                    '근처 현지인 맛집 추천해줘',
                    '비 오는 날 실내 관광지 알려줘',
                    '꼭 가봐야 할 곳 3곳만 골라줘',
                  ]},
                  { label: '🌤️ 현지 정보', items: [
                    '여행 기간 날씨 어때?',
                    '현지 교통수단 뭐가 좋아?',
                    '환전은 얼마나 해가면 될까?',
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
                    🔊 다시 듣기
                  </button>
                )}
              </div>
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
              title="이미지 제거"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      <div className="sticky bottom-0 bg-base-100 p-4 border-t border-base-200 flex items-center gap-2">
        {/* Hidden file input */}
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
          title="사진 첨부"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
        </Button>
        
        {browserSupportsSpeechRecognition && (
          <Button
            onClick={isListening ? stopListening : startListening}
            disabled={isLoading}
            variant={isListening ? 'secondary' : 'ghost'}
            className="btn-circle"
            title="음성 입력"
          >
            {isListening ? <Loading /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 0-6-6v-1.5m6 7.5v3m-3-3h6m-10.875-9.75a6 6 0 0 1 6-6h.75m-12.75 6h.75m-3 0a6 6 0 0 0 6 6h.75" /></svg>}
          </Button>
        )}
        {isSpeaking && (
          <Button
            onClick={stopSpeaking}
            variant="error"
            className="btn-circle"
            title="음성 중지"
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
          title={ttsEnabled ? 'TTS 끄기' : 'TTS 켜기'}
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
          placeholder={imageData ? "사진에 대해 물어보세요..." : "메시지를 입력하세요..."}
          className="input input-bordered w-full"
          disabled={isLoading || isListening} // Disable input while listening
        />
        <Button onClick={() => handleSendMessage()} disabled={isLoading || isListening} variant="primary">
          전송
        </Button>
      </div>
    </div>
  );
}