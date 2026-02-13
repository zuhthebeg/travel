import { useNavigate } from 'react-router-dom';
import { Card } from './Card';
import { Button } from './Button';
import { formatDateRange, getDaysDifference, getCountryFlag, extractCountryFromRegion } from '../lib/utils';
import type { Plan } from '../store/types';
import { MapPin, Calendar, Globe } from 'lucide-react';

interface PlanCardProps {
  plan: Plan;
  showImportButton?: boolean;
  onImport?: (plan: Plan) => void;
}

export function PlanCard({ plan, showImportButton = false, onImport }: PlanCardProps) {
  const navigate = useNavigate();
  const days = getDaysDifference(plan.start_date, plan.end_date);
  
  // 국가 정보 (DB에 있으면 사용, 없으면 지역명에서 추출)
  const countryInfo = plan.country_code 
    ? { code: plan.country_code, name: plan.country || '' }
    : extractCountryFromRegion(plan.region);
  const flag = countryInfo ? getCountryFlag(countryInfo.code) : null;

  const handleCardClick = () => {
    navigate(`/plan/${plan.id}`);
  };

  const handleImportClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (onImport) {
      onImport(plan);
    }
  };

  return (
    <Card
      onClick={handleCardClick}
      className="shadow-xl hover:scale-105 transition-transform"
    >
      {plan.thumbnail && (
        <figure className="h-48">
          <img src={plan.thumbnail} alt={plan.title} className="w-full h-full object-cover" />
        </figure>
      )}
      <Card.Body>
        <Card.Title>
          {plan.title}
          {plan.is_public && <div className="badge badge-secondary">공개</div>}
        </Card.Title>
        {plan.region && (
          <p className="text-base-content/70 flex items-center gap-1.5">
            {flag ? (
              <span className="text-lg">{flag}</span>
            ) : (
              <Globe className="w-4 h-4 text-base-content/50" />
            )}
            <MapPin className="w-4 h-4 text-primary" />
            <span>{plan.region}</span>
            {countryInfo && countryInfo.name && countryInfo.name !== plan.region && (
              <span className="badge badge-ghost badge-sm">{countryInfo.name}</span>
            )}
          </p>
        )}
        <div className="flex-grow" />
        <Card.Actions className="justify-between items-center text-base-content/70">
          <div className="flex flex-col sm:flex-row gap-1 sm:gap-4">
            <span className="text-xs sm:text-sm flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateRange(plan.start_date, plan.end_date)}
            </span>
            <span className="font-medium text-xs sm:text-sm">{days}일</span>
          </div>
          {showImportButton && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleImportClick}
              className="flex-shrink-0"
            >
              <span className="hidden sm:inline">내 여행으로</span>
              <span className="sm:hidden">가져오기</span>
            </Button>
          )}
        </Card.Actions>
      </Card.Body>
    </Card>
  );
}
