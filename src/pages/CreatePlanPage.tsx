import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { plansAPI, schedulesAPI } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Loading, LoadingOverlay } from '../components/Loading';
import useSpeechRecognition from '../hooks/useSpeechRecognition'; // Import the hook
import useBrowserNotifications from '../hooks/useBrowserNotifications'; // Import the new hook

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
    is_public: true, // 기본값 true로 변경
    thumbnail: '',
  });
  const [pastedPlan, setPastedPlan] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition(); // Use the hook

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (transcript) {
      setInput(transcript); // Update input with transcribed text
    }
  }, [transcript]);

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

  const { showNotification } = useBrowserNotifications(); // Use the notification hook

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
      
      // 임시 user_id로 1 사용 (운영 DB에 id=1인 사용자가 없으면 생성 필요)
      const newPlan = await plansAPI.create({
        user_id: 1,
        title: title || formData.title,
        region: region || formData.region,
        start_date: start_date || formData.start_date,
        end_date: end_date || formData.end_date,
        is_public: true, // 기본 공개
        thumbnail: formData.thumbnail || undefined,
      });

      if (schedules && schedules.length > 0) {
        // Process schedules asynchronously and show notification
        let createdSchedulesCount = 0;
        for (const schedule of schedules) {
          try {
            await schedulesAPI.create({
              ...schedule,
              plan_id: newPlan.id,
            });
            createdSchedulesCount++;
          } catch (scheduleError) {
            console.error('Failed to create individual schedule:', scheduleError);
            // Optionally show a notification for failed individual schedules
          }
        }
        showNotification('일정 생성 완료', {
          body: `${createdSchedulesCount}개의 일정이 성공적으로 추가되었습니다.`,
          onClick: () => navigate(`/plan/${newPlan.id}`),
        });
      } else {
        showNotification('여행 계획 생성 완료', {
          body: '일정 없이 여행 계획이 생성되었습니다.',
          onClick: () => navigate(`/plan/${newPlan.id}`),
        });
      }

      navigate(`/plan/${newPlan.id}`);

    } catch (error) {
      console.error('Failed to parse plan:', error);
      alert('일정 파싱에 실패했습니다. 다시 시도해주세요.');
      showNotification('일정 파싱 실패', {
        body: '여행 계획 파싱 중 오류가 발생했습니다.',
      });
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
      // 임시 user_id로 1 사용 (운영 DB에 id=1인 사용자가 없으면 생성 필요)
      const newPlan = await plansAPI.create({
        user_id: 1,
        title: formData.title,
        region: formData.region || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_public: true, // 기본 공개
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
                    <img src={formData.thumbnail} alt="thumbnail preview" className="mt-4 w-full h-auto rounded-lg" />
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
                    <span className="label-text">지역 (AI 초안 생성에 필요)</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="form-control w-full">
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

                  <div className="form-control w-full">
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

                {/* 버튼 */}
                <Card.Actions className="justify-end pt-4">
                  <Button type="submit" variant="primary">
                    직접 만들기
                  </Button>
                </Card.Actions>
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
                {browserSupportsSpeechRecognition && (
                  <Button
                    onClick={isListening ? stopListening : startListening}
                    disabled={isChatLoading}
                    variant={isListening ? 'secondary' : 'ghost'}
                    className="btn-circle"
                  >
                    {isListening ? <Loading /> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 0-6-6v-1.5m6 7.5v3m-3-3h6m-10.875-9.75a6 6 0 0 1 6-6h.75m-12.75 6h.75m-3 0a6 6 0 0 0 6 6h.75" /></svg>}
                  </Button>
                )}
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
