import { useNavigate } from 'react-router-dom';
import { Card } from './Card';
import { formatDateRange, getDaysDifference } from '../lib/utils';
import type { Plan } from '../store/types';

interface PlanCardProps {
  plan: Plan;
}

export function PlanCard({ plan }: PlanCardProps) {
  const navigate = useNavigate();
  const days = getDaysDifference(plan.start_date, plan.end_date);

  return (
    <Card
      onClick={() => navigate(`/plan/${plan.id}`)}
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
        {plan.region && <p className="text-base-content/70">📍 {plan.region}</p>}
        <Card.Actions className="justify-between text-base-content/70">
          <span>📅 {formatDateRange(plan.start_date, plan.end_date)}</span>
          <span className="font-medium">{days}일</span>
        </Card.Actions>
      </Card.Body>
    </Card>
  );
}
