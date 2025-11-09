import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { plansAPI } from '../lib/api';
import { getTempUserId, formatDate } from '../lib/utils';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { LoadingOverlay } from '../components/Loading';

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

  const handleGenerateDraft = async () => {
    if (!formData.region || !formData.start_date || !formData.end_date) {
      alert('AI 초안을 만들려면 지역과 날짜를 모두 입력해주세요.');
      return;
    }

    setIsGenerating(true);
    try {
      const userId = getTempUserId();
      const newPlan = await plansAPI.create({
        user_id: userId,
        title: formData.title || `${formData.region} 여행`,
        region: formData.region,
        start_date: formData.start_date,
        end_date: formData.end_date,
        is_public: formData.is_public,
        thumbnail: formData.thumbnail || undefined,
      });

      const response = await fetch('/api/assistant/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: newPlan.id,
          destination: formData.region,
          start_date: formData.start_date,
          end_date: formData.end_date,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate draft');
      }

      navigate(`/plan/${newPlan.id}`);
    } catch (error) {
      console.error('Failed to generate draft:', error);
      alert('AI 초안 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsGenerating(false);
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
      <main className="container mx-auto px-4 py-8 max-w-2xl">
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
                <Button
                  type="button"
                  variant="accent"
                  onClick={handleGenerateDraft}
                  disabled={!formData.region || !formData.start_date || !formData.end_date || isGenerating}
                >
                  {isGenerating ? 'AI 초안 생성 중...' : 'AI 초안 만들기'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(-1)}
                >
                  취소
                </Button>
                <Button type="submit" variant="primary">
                  직접 만들기
                </Button>
              </Card.Actions>
            </form>
          </Card.Body>
        </Card>
      </main>
    </div>
  );
}
