import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { plansAPI } from '../lib/api';
import { getTempUserId, formatDate } from '../lib/utils';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Loading, LoadingOverlay } from '../components/Loading';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function CreatePlanPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    region: '',
    start_date: formatDate(new Date()),
    end_date: formatDate(new Date(Date.now() + 86400000)), // 내일
    is_public: false,
    thumbnail: '',
  });
  const [pastedPlan, setPastedPlan] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'ko-KR';
      recognitionRef.current.onresult = (event: any) => {
        setInput(event.results[0][0].transcript);
      };
      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
      };
    }
  }, []);

  const startSTT = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('File upload failed');
      }

      const { url } = await response.json();
      setFormData((prev) => ({ ...prev, thumbnail: url }));
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('썸네일 업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleParsePlan = async () => {
    if (!pastedPlan) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/assistant/parse-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pastedPlan }),
      });

      if (!response.ok) {
        throw new Error('Failed to parse plan');
      }

      const { title, region, start_date, end_date, schedules } = await response.json();
      
      const userId = getTempUserId();
      const newPlan = await plansAPI.create({
        user_id: userId,
        title: title || formData.title,
        region: region || formData.region,
        start_date: start_date || formData.start_date,
        end_date: end_date || formData.end_date,
        is_public: formData.is_public,
        thumbnail: formData.thumbnail || undefined,
      });

      // TODO: Save schedules

      navigate(`/plan/${newPlan.id}`);

    } catch (error) {
      console.error('Failed to parse plan:', error);
      alert('일정 파싱에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user' as const, content: input };
    const newMessages: Message[] = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsChatLoading(true);

    try {
      const history = newMessages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from assistant');
      }

      const { reply } = await response.json();
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.start_date || !formData.end_date) {
      alert('제목과 날짜를 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const userId = getTempUserId();
      const newPlan = await plansAPI.create({
        user_id: userId,
        title: formData.title,
        region: formData.region || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_public: formData.is_public,
        thumbnail: formData.thumbnail || undefined,
      });

      navigate(`/plan/${newPlan.id}`);
    } catch (error) {
      console.error('Failed to create plan:', error);
      alert('여행 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      {(isLoading || isGenerating || isUploading) && <LoadingOverlay />}

      {/* Header */}
      <header className="bg-base-100 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">새 여행 만들기</h1>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              취소
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <Card className="shadow-xl">
            <Card.Body>
              <Card.Title>
                여행 정보
              </Card.Title>
              <p className="text-base-content/70 -mt-2 mb-4">
                여행의 기본 정보를 입력해주세요
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* ... form fields ... */}
              </form>
            </Card.Body>
          </Card>
        </div>
        <div className="flex flex-col">
          <Card className="shadow-xl flex-1">
            <Card.Body>
              <Card.Title>AI 비서</Card.Title>
              <div className="flex-1 overflow-y-auto space-y-4 pr-4">
                {messages.map((msg, index) => (
                  <div key={index} className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}>
                    <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-primary' : ''}`}>
                      {msg.content}
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
              <div className="flex gap-2 mt-4">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="AI에게 무엇이든 물어보세요..."
                  className="input input-bordered w-full"
                  disabled={isChatLoading}
                />
                <Button onClick={handleSendMessage} disabled={isChatLoading}>
                  {isChatLoading ? <Loading /> : '전송'}
                </Button>
                <Button onClick={startSTT} disabled={isChatLoading}>
                  🎤
                </Button>
              </div>
            </Card.Body>
          </Card>
          <Card className="shadow-xl mt-8">
            <Card.Body>
              <Card.Title>텍스트로 일정 만들기</Card.Title>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={10}
                placeholder="여기에 여행 일정을 붙여넣으세요..."
                value={pastedPlan}
                onChange={(e) => setPastedPlan(e.target.value)}
              />
              <Card.Actions className="justify-end">
                <Button onClick={handleParsePlan} variant="primary" disabled={!pastedPlan || isGenerating}>
                  {isGenerating ? '일정 생성 중...' : '일정 생성'}
                </Button>
              </Card.Actions>
            </Card.Body>
          </Card>
        </div>
      </main>
    </div>
  );
}
