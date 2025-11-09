import { formatDisplayDate } from '../lib/utils';
import type { Schedule } from '../store/types';

interface ScheduleCardProps {
  schedule: Schedule;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: number) => void;
}

export function ScheduleCard({ schedule, onEdit, onDelete }: ScheduleCardProps) {
  return (
    <div className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all">
      <div className="card-body">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {schedule.time && (
                <div className="badge badge-primary badge-lg font-mono">{schedule.time}</div>
              )}
              <div className="text-sm text-base-content/70">
                {formatDisplayDate(schedule.date)}
              </div>
            </div>
            <h3 className="card-title text-xl">{schedule.title}</h3>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-outline" onClick={() => onEdit(schedule)}>
              수정
            </button>
            <button
              className="btn btn-sm btn-error"
              onClick={() => {
                if (confirm('이 일정을 삭제하시겠습니까?')) {
                  onDelete(schedule.id);
                }
              }}
            >
              삭제
            </button>
          </div>
        </div>

        {schedule.place && (
          <p className="text-sm text-base-content/80 mb-2 flex items-center gap-1">
            <span className="text-lg">📍</span>
            <span className="font-medium">{schedule.place}</span>
          </p>
        )}

        {schedule.memo && (
          <p className="text-sm text-base-content/90 mb-3 whitespace-pre-wrap bg-base-200 p-3 rounded-lg">
            {schedule.memo}
          </p>
        )}

        {(schedule.plan_b || schedule.plan_c) && (
          <div className="divider">대안 계획</div>
        )}

        {schedule.plan_b && (
          <div className="alert alert-info shadow-sm mb-2">
            <div>
              <span className="font-bold">Plan B:</span> {schedule.plan_b}
            </div>
          </div>
        )}
        {schedule.plan_c && (
          <div className="alert alert-warning shadow-sm">
            <div>
              <span className="font-bold">Plan C:</span> {schedule.plan_c}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
