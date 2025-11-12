import { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { Loading } from './Loading';
import type { Schedule } from '../store/types';
import useSpeechRecognition from '../hooks/useSpeechRecognition'; // Import the hook

interface TravelAssistantChatProps {
  planId: number;
  planTitle: string;
  planRegion: string | null;
  planStartDate: string;
  planEndDate: string;
  schedules: Schedule[];
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition(); // Use the hook

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

  // TTS function
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
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

    const systemPrompt = `You are a friendly and helpful travel assistant. Your goal is to help users plan their trips.

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

  IMPORTANT: Keep your answers VERY concise and brief (1-2 sentences maximum). Use simple, natural Korean that sounds good when spoken aloud.
  Avoid long explanations, lists, or formatting. Focus on the most essential information only.
  All responses should be in Korean.`;

    try {
      const response = await fetch(`${window.location.origin}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSend,
          history: messages.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] })),
          planId,
          planTitle,
          planRegion,
          planStartDate,
          planEndDate,
          schedules,
          systemPrompt, // Pass the systemPrompt to the backend
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from assistant');
      }

      const data = await response.json();
      const assistantMessage: Message = { role: 'assistant', content: data.reply || data.response || '응답을 받지 못했습니다.' };
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);

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
            <div className="chat chat-start">
              <div className="chat-bubble chat-bubble-info">
                안녕하세요! 무엇을 도와드릴까요? 일정에 대해 궁금한 점을 물어보세요.
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
      <div className="sticky bottom-0 bg-base-100 p-4 border-t border-base-200 flex items-center gap-2">
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
          placeholder="메시지를 입력하세요..."
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