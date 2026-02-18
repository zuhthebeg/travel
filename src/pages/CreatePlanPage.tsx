import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { plansAPI, schedulesAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { GlobalNav } from '../components/GlobalNav';
import { Loading } from '../components/Loading';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useBrowserNotifications from '../hooks/useBrowserNotifications';
import { Sparkles, MapPin, Clock, ChevronDown, ArrowRight, MessageCircle, FileText } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// AI 분석 중 롤링 팁
const LOADING_TIPS = [
  '💡 일정이 등록되면 정확한 예약에 맞춰 시간을 수정할 수 있어요',
  '🗺️ 장소를 검색하면 자동으로 지도에 핀이 찍혀요',
  '🤖 AI 비서에게 "일정 하루 미뤄줘"라고 요청해보세요',
  '📍 좌표가 틀리면 장소명을 수정하고 좌표 보정 버튼을 눌러주세요',
  '👥 친구를 초대하면 함께 일정을 편집할 수 있어요',
  '📸 여행 후 사진을 추가하면 앨범이 자동으로 만들어져요',
  '🔄 일정을 드래그해서 날짜를 쉽게 변경할 수 있어요',
  '⭐ 방문한 장소에 별점을 남기면 다른 여행자에게 도움이 돼요',
  '📋 플랜 B, C도 등록해두면 현지에서 유연하게 대응할 수 있어요',
  '🌐 여행을 공개하면 다른 사람들이 참고할 수 있어요',
  '📱 홈 화면에 추가하면 앱처럼 사용할 수 있어요 (PWA)',
  '✈️ 비행기 모드에서도 저장된 여행을 확인할 수 있어요',
  '📶 인터넷 없이도 일정 조회가 가능해요 — 오프라인 모드 지원!',
];

function RollingTips() {
  const [tipIndex, setTipIndex] = useState(0);
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTipIndex(i => (i + 1) % LOADING_TIPS.length);
        setFade(true);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, []);
  return (
    <p
      className={`text-sm text-base-content/60 text-center mt-2 transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}
      style={{ minHeight: '2.5em' }}
    >
      {LOADING_TIPS[tipIndex]}
    </p>
  );
}

// 예시 질의 목록
const EXAMPLE_QUERIES = [
  '3시간 거리 혼자 갈만한 여행지 추천해줘',
  '이번 주말 2박3일 가족여행 추천',
  '지금 시즌에 3명 갈만한 곳',
  '당일치기 드라이브 코스 추천',
  '비 와도 즐길 수 있는 여행지',
];

export function CreatePlanPage() {
  const navigate = useNavigate();

  // 로그인 체크
  const isOffline = localStorage.getItem('offline_mode') === 'true';
  if (isOffline) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card bg-base-100 shadow-xl max-w-md w-full">
          <div className="card-body text-center">
            <p className="text-4xl mb-2">✈️</p>
            <h2 className="card-title justify-center">오프라인 모드</h2>
            <p className="text-base-content/70">새 여행 생성은 온라인에서만 가능합니다. 프로필에서 오프라인 모드를 끄거나, 인터넷에 연결해주세요.</p>
            <div className="card-actions justify-center mt-2">
              <button className="btn btn-primary" onClick={() => navigate(-1)}>돌아가기</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasAuth = !!(localStorage.getItem('X-Auth-Credential') || localStorage.getItem('google_credential'));
  if (!hasAuth) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div className="card bg-base-100 shadow-xl max-w-md w-full">
          <div className="card-body text-center">
            <p className="text-4xl mb-2">🔐</p>
            <h2 className="card-title justify-center">로그인이 필요합니다</h2>
            <p className="text-base-content/70">여행을 만들려면 먼저 로그인해주세요.</p>
            <div className="card-actions justify-center mt-2">
              <button className="btn btn-primary" onClick={() => navigate('/')}>홈으로</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    region: '',
    start_date: formatDate(new Date()),
    end_date: formatDate(new Date(Date.now() + 86400000)),
    is_public: true,
    thumbnail: '',
  });
  const [pastedPlan, setPastedPlan] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; city?: string } | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const { showNotification } = useBrowserNotifications();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  // Get user location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
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

  // 현재 시간 포맷 (브라우저 시간대 사용)
  const getCurrentTimeContext = () => {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      dateTime: now.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'long',
        timeZone: tz
      }),
      timezone: tz,
      isoNow: now.toISOString(),
      season: (() => {
        const month = now.getMonth() + 1;
        if (month >= 3 && month <= 5) return '봄';
        if (month >= 6 && month <= 8) return '여름';
        if (month >= 9 && month <= 11) return '가을';
        return '겨울';
      })(),
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!response.ok) throw new Error('File upload failed');
      const { url } = await response.json();
      setFormData((prev) => ({ ...prev, thumbnail: url }));
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('썸네일 업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const geocodeRegion = async (region: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(region)}&limit=1`);
      if (response.ok) {
        const data = await response.json();
        if (data.places && data.places.length > 0) {
          return { lat: data.places[0].lat, lng: data.places[0].lng };
        }
      }
    } catch (e) {
      console.error('Geocode error:', e);
    }
    return null;
  };

  const handleParsePlan = async () => {
    if (!pastedPlan) return;

    setIsGenerating(true);
    try {
      const { dateTime, timezone, isoNow } = getCurrentTimeContext();

      const response = await fetch('/api/assistant/parse-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pastedPlan,
          currentTime: dateTime,
          timezone,
          isoNow,
          userLocation,
        }),
      });

      if (!response.ok) throw new Error('Failed to parse plan');

      const { title, region, start_date, end_date, schedules } = await response.json();
      
      let regionCoords: { lat: number; lng: number } | null = null;
      if (region) {
        regionCoords = await geocodeRegion(region);
      }

      const days = start_date && end_date 
        ? Math.ceil((new Date(end_date).getTime() - new Date(start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
        : 1;
      const autoTitle = region 
        ? `${region} ${days > 1 ? `${days}일` : ''} 여행`.trim()
        : `새 여행 ${new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`;
      
      const newPlan = await plansAPI.create({
        title: title || autoTitle,
        region: region || formData.region,
        start_date: start_date || formData.start_date,
        end_date: end_date || formData.end_date,
        thumbnail: formData.thumbnail || undefined,
      });

      let createdSchedulesCount = 0;
      if (schedules && schedules.length > 0) {
        // 심플: 여행 지역 좌표 하나로 전체 적용. 정확한 좌표는 보정 버튼으로.
        setProgressInfo({ current: 0, total: schedules.length });
        for (const schedule of schedules) {
          try {
            const finalCoords = regionCoords;

            await schedulesAPI.create({
              plan_id: newPlan.id,
              date: schedule.date,
              time: schedule.time || undefined,
              title: schedule.title || '일정',
              place: schedule.place || undefined,
              place_en: schedule.place_en || undefined,
              memo: schedule.memo || undefined,
              plan_b: schedule.plan_b || undefined,
              plan_c: schedule.plan_c || undefined,
              latitude: finalCoords?.lat,
              longitude: finalCoords?.lng,
            });
            createdSchedulesCount++;
            setProgressInfo({ current: createdSchedulesCount, total: schedules.length });
          } catch (scheduleError) {
            console.error('Failed to create schedule:', scheduleError);
          }
        }
        setProgressInfo(null);
      }

      navigate(`/plan/${newPlan.id}`);
      
      if (createdSchedulesCount > 0) {
        showNotification('여행 생성 완료', {
          body: `${newPlan.title} - ${createdSchedulesCount}개 일정 추가됨`,
        });
      }

    } catch (error) {
      console.error('Failed to parse plan:', error);
      // Alert removed - if plan was created, user is already navigated
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim()) return;

    const userMessage = { role: 'user' as const, content: text };
    const newMessages: Message[] = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsChatLoading(true);

    try {
      const { dateTime, season } = getCurrentTimeContext();
      
      // Build context-aware message
      const contextMessage = `[사용자 컨텍스트]
현재 시간: ${dateTime}
계절: ${season}
위치: ${userLocation?.city || '알 수 없음'}

[질문]
${text}`;

      const history = newMessages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: contextMessage, 
          history,
          userLocation,
          currentTime: dateTime,
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const { reply } = await response.json();
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages([...newMessages, { role: 'assistant', content: '죄송합니다, 오류가 발생했습니다.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // AI 답변을 텍스트 입력으로 옮기기 (불필요한 멘트 제거)
  const transferToTextInput = (content: string) => {
    const lines = content.split('\n');
    const filtered = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true; // 빈 줄 유지
      // 인사/안내 멘트 패턴 제거
      const fillerPatterns = [
        /^.{0,5}(일정을?\s*(짜|만들어|준비)|여행\s*일정을?\s*(짜|만들어))/,
        /추가\s*질문|다른\s*요청|말씀해\s*주세요|도움이\s*되|즐거운\s*여행|좋은\s*여행/,
        /^(안녕|네[,!]|좋아요|알겠|물론|여기|아래)/,
        /드릴게요[!.]?\s*$/,
        /참고해\s*주세요|참고하세요|유의하세요/,
        /궁금한\s*(점|것)|문의|연락/,
      ];
      return !fillerPatterns.some(p => p.test(trimmed));
    });
    // 앞뒤 빈 줄 제거
    const result = filtered.join('\n').trim();
    setPastedPlan(result);
    document.getElementById('text-input-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  // 여행 일정 포맷인지 감지 (간단한 휴리스틱)
  const looksLikeTravelPlan = (text: string) => {
    const patterns = [
      /\d+일차/,
      /\d+박\d+일/,
      /오전|오후|저녁/,
      /\d{1,2}:\d{2}/,
      /DAY\s*\d/i,
    ];
    return patterns.some(p => p.test(text));
  };

  // AI 답변에서 여행지 후보 추출 (1. 제주도 - ... / 2. 부산 - ... 형태)
  // 일정 포맷(시간, 일차 등)이 포함된 답변에서는 추출하지 않음
  const extractCandidates = (text: string): string[] => {
    // 일정 포맷이 포함된 텍스트면 후보 추출 안 함
    if (looksLikeTravelPlan(text)) return [];
    
    const lines = text.split('\n');
    const candidates: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // 시간 패턴 포함된 줄 스킵 (10:00, 오전, 오후 등)
      if (/\d{1,2}:\d{2}|오전|오후|저녁|아침/.test(trimmed)) continue;
      // "1. 제주도", "① 제주도" 등 (- 는 일정에서도 쓰이므로 번호 있는 것만)
      const match = trimmed.match(/^(?:\d+[\.\)]\s*|[①②③④⑤]\s*)\*{0,2}(.+?)\*{0,2}(?:\s*[-:–]|$)/);
      if (match && match[1].trim().length > 1 && match[1].trim().length < 30) {
        candidates.push(match[1].trim());
      }
    }
    return candidates;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.start_date || !formData.end_date) {
      alert('제목과 날짜를 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const newPlan = await plansAPI.create({
        title: formData.title,
        region: formData.region || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date,
        thumbnail: formData.thumbnail || undefined,
      });

      navigate(`/plan/${newPlan.id}`);
    } catch (error) {
      console.error('Failed to create plan:', error);
      alert('여행 생성에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      <GlobalNav />
      
      {/* 프로그레스 오버레이 */}
      {(isLoading || isGenerating || isUploading) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-base-100 p-6 rounded-lg shadow-xl w-80">
            {progressInfo ? (
              <>
                <p className="text-center font-medium mb-3">
                  📝 일정 등록 중 ({progressInfo.current}/{progressInfo.total})
                </p>
                <progress 
                  className="progress progress-primary w-full" 
                  value={progressInfo.current} 
                  max={progressInfo.total}
                />
                <p className="text-center text-sm text-base-content/60 mt-2">
                  {Math.round((progressInfo.current / progressInfo.total) * 100)}%
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Loading />
                <p className="font-medium">
                  {isGenerating ? 'AI가 일정을 분석 중...' : isUploading ? '업로드 중...' : '처리 중...'}
                </p>
                {isGenerating && <RollingTips />}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" /> 새 여행 만들기
            </h2>
            <p className="text-base-content/70 flex items-center gap-2 mt-1">
              {userLocation?.city && (
                <span className="badge badge-sm gap-1">
                  <MapPin className="w-3 h-3" /> {userLocation.city}
                </span>
              )}
              <span className="badge badge-sm gap-1">
                <Clock className="w-3 h-3" /> {getCurrentTimeContext().season}
              </span>
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            취소
          </Button>
        </div>

        {/* AI 비서 섹션 (우선 배치) */}
        <Card className="shadow-xl mb-6">
          <Card.Body>
            <Card.Title className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              AI 여행 비서
            </Card.Title>
            <p className="text-sm text-base-content/60 mb-4">
              여행지 추천부터 일정 생성까지, AI에게 물어보세요
            </p>

            {/* 예시 질의 칩 */}
            {messages.length === 0 && (
              <div className="mb-4">
                <p className="text-xs text-base-content/50 mb-2">💡 이런 것도 물어볼 수 있어요:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_QUERIES.map((query, i) => (
                    <button
                      key={i}
                      className="btn btn-sm btn-outline btn-primary"
                      onClick={() => handleSendMessage(query)}
                      disabled={isChatLoading}
                    >
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 채팅 영역 */}
            <div className="bg-base-200 rounded-lg p-4 max-h-80 overflow-y-auto mb-4">
              {messages.length === 0 ? (
                <div className="text-center text-base-content/50 py-8">
                  <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>AI에게 여행 관련 질문을 해보세요</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, index) => (
                    <div key={index} className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}>
                      <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-primary' : ''}`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        
                        {msg.role === 'assistant' && (() => {
                          const candidates = extractCandidates(msg.content);
                          const hasItinerary = looksLikeTravelPlan(msg.content);
                          if (candidates.length === 0 && !hasItinerary) return null;
                          return (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {/* 후보 여행지별 버튼 */}
                              {candidates.map((c, i) => (
                                <button
                                  key={i}
                                  className="btn btn-xs btn-primary gap-1"
                                  onClick={() => handleSendMessage(`${c} 여행 일정 만들어줘`)}
                                  disabled={isChatLoading}
                                >
                                  ✈️ {c}
                                </button>
                              ))}
                              {/* 일정 포맷이면 통째로 옮기기 */}
                              {hasItinerary && (
                                <button
                                  className="btn btn-xs btn-secondary gap-1"
                                  onClick={() => transferToTextInput(msg.content)}
                                >
                                  <ArrowRight className="w-3 h-3" />
                                  일정으로 옮기기
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="chat chat-start">
                      <div className="chat-bubble">
                        <Loading />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* 입력 */}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="여행지 추천, 일정 생성 등 무엇이든 물어보세요..."
                className="input input-bordered flex-1"
                disabled={isChatLoading}
              />
              <Button onClick={() => handleSendMessage()} disabled={isChatLoading || !input.trim()}>
                {isChatLoading ? <Loading /> : '전송'}
              </Button>
              {browserSupportsSpeechRecognition && (
                <Button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isChatLoading}
                  variant={isListening ? 'secondary' : 'ghost'}
                  className="btn-circle"
                >
                  🎤
                </Button>
              )}
            </div>
          </Card.Body>
        </Card>

        {/* 텍스트로 일정 만들기 */}
        <Card className="shadow-xl mb-6" id="text-input-section">
          <Card.Body>
            <Card.Title className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-secondary" />
              텍스트로 일정 만들기
            </Card.Title>
            <p className="text-sm text-base-content/60 mb-4">
              여행 일정을 붙여넣거나, AI 답변을 옮겨서 일정을 자동 생성하세요
            </p>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={8}
              placeholder={`예시:
부산 2박3일 여행

1일차
- 10:00 해운대 해수욕장
- 12:00 광안리 회센터에서 점심
- 15:00 감천문화마을

2일차
- 09:00 기장 죽성성당
...`}
              value={pastedPlan}
              onChange={(e) => setPastedPlan(e.target.value)}
            />
            <div className="flex justify-between items-center mt-1 text-xs text-base-content/60">
              <span>
                {pastedPlan.length > 4000 
                  ? `📦 ${pastedPlan.length.toLocaleString()}자 - 여러 번 나눠서 처리됩니다` 
                  : `${pastedPlan.length.toLocaleString()}자`}
              </span>
              {pastedPlan.length > 10000 && (
                <span className="text-warning">⚠️ 텍스트가 길어서 처리에 시간이 걸릴 수 있어요</span>
              )}
            </div>
            <Card.Actions className="justify-end mt-4">
              <Button 
                onClick={handleParsePlan} 
                variant="primary" 
                disabled={!pastedPlan || isGenerating}
                className="gap-2"
              >
                {isGenerating ? <Loading /> : <><Sparkles className="w-4 h-4" /> AI로 일정 생성</>}
              </Button>
            </Card.Actions>
          </Card.Body>
        </Card>

        {/* 수동 입력 폼 (접이식) */}
        <Card className="shadow-xl">
          <Card.Body>
            <button
              className="w-full flex items-center justify-between text-left"
              onClick={() => setShowManualForm(!showManualForm)}
            >
              <Card.Title className="flex items-center gap-2 mb-0">
                직접 입력하기
              </Card.Title>
              <ChevronDown className={`w-5 h-5 transition-transform ${showManualForm ? 'rotate-180' : ''}`} />
            </button>
            
            {showManualForm && (
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                {/* 썸네일 */}
                <div className="form-control w-full">
                  <label className="label">
                    <span className="label-text">썸네일</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="file-input file-input-bordered w-full"
                  />
                  {formData.thumbnail && (
                    <img src={formData.thumbnail} alt="preview" className="mt-4 w-full h-auto rounded-lg max-h-48 object-cover" />
                  )}
                </div>

                {/* 제목 */}
                <div className="form-control w-full">
                  <label className="label">
                    <span className="label-text">여행 제목 *</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="예: 제주도 3박 4일"
                    className="input input-bordered w-full"
                    required
                  />
                </div>

                {/* 지역 */}
                <div className="form-control w-full">
                  <label className="label">
                    <span className="label-text">지역</span>
                  </label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    placeholder="예: 제주도"
                    className="input input-bordered w-full"
                  />
                </div>

                {/* 날짜 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">시작일 *</span>
                    </label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className="input input-bordered w-full"
                      required
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">종료일 *</span>
                    </label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      min={formData.start_date}
                      className="input input-bordered w-full"
                      required
                    />
                  </div>
                </div>

                {/* 공개 여부 */}
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-4">
                    <input
                      type="checkbox"
                      checked={formData.is_public}
                      onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                      className="checkbox checkbox-primary"
                    />
                    <span className="label-text">다른 사람들에게 공개하기</span>
                  </label>
                </div>

                <Card.Actions className="justify-end pt-4">
                  <Button type="submit" variant="primary">
                    여행 만들기
                  </Button>
                </Card.Actions>
              </form>
            )}
          </Card.Body>
        </Card>
      </main>
    </div>
  );
}
