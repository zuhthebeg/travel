import { useEffect, useMemo, useState } from 'react';
import { membersAPI } from '../lib/api';
import type { PlanMember } from '../store/types';
import { Loading } from './Loading';
import { Button } from './Button';

interface MemberAvatarsProps {
  planId: number;
  isOwner: boolean;
}

export default function MemberAvatars({ planId, isOwner }: MemberAvatarsProps) {
  const [owner, setOwner] = useState<PlanMember | null>(null);
  const [members, setMembers] = useState<PlanMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const allMembers = useMemo(() => {
    const unique = new Map<number, PlanMember>();
    if (owner) unique.set(owner.user_id, owner);
    members.forEach((member) => {
      if (!unique.has(member.user_id)) unique.set(member.user_id, member);
    });
    return Array.from(unique.values());
  }, [owner, members]);

  const loadMembers = async () => {
    try {
      setIsLoading(true);
      const result = await membersAPI.getByPlanId(planId);
      setOwner(result.owner);
      setMembers(result.members || []);
    } catch (error) {
      console.error('멤버 정보를 불러오지 못했습니다:', error);
      setOwner(null);
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (planId) {
      loadMembers();
    }
  }, [planId]);

  const getDisplayName = (member: PlanMember) =>
    member.username || member.email || `member-${member.user_id}`;

  const getInitial = (member: PlanMember) =>
    getDisplayName(member).charAt(0).toUpperCase() || '🙂';

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      alert('이메일을 입력해주세요.');
      return;
    }

    try {
      setIsInviting(true);
      await membersAPI.invite(planId, email);
      setInviteEmail('');
      setIsInviteOpen(false);
      await loadMembers();
      alert('멤버 초대가 완료되었습니다.');
    } catch (error) {
      alert(error instanceof Error ? error.message : '초대 요청에 실패했습니다.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (member: PlanMember) => {
    if (!isOwner || member.role === 'owner') return;

    const message = `${member.username} 님을 플랜에서 제외할까요?`;
    if (!window.confirm(message)) return;

    try {
      await membersAPI.remove(planId, member.user_id);
      await loadMembers();
    } catch (error) {
      alert(error instanceof Error ? error.message : '멤버 제거에 실패했습니다.');
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {allMembers.map((member) => (
          <button
            key={member.user_id}
            type="button"
            onClick={() => isOwner && handleRemove(member)}
            className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full overflow-hidden bg-base-300 text-xs font-medium text-base-content border-2 transition-all ${
              isOwner && member.role !== 'owner'
                ? 'border-transparent hover:border-error cursor-pointer'
                : 'border-base-100'
            } ${member.picture ? '' : 'ring ring-base-200'}`}
            title={`${member.username || member.email}${
              isOwner && member.role !== 'owner' ? ' - 클릭해 제거' : ''
            }`}
          >
            {member.picture ? (
              <img
                src={member.picture}
                alt={member.username}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{getInitial(member)}</span>
            )}
            {member.role === 'owner' && (
              <span className="absolute -top-1 -right-2 text-[10px] bg-primary text-primary-content rounded-full px-1 py-0.5 border border-base-100">
                O
              </span>
            )}
          </button>
        ))}

        {isOwner && (
          <button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            className="h-9 w-9 rounded-full border border-dashed border-base-300 text-base-content/70 flex items-center justify-center hover:bg-base-200 transition-colors"
            title="멤버 초대"
          >
            +
          </button>
        )}
      </div>

      {isInviteOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setIsInviteOpen(false)}
        >
          <div
            className="bg-base-100 rounded-xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">멤버 초대</h3>
            <p className="text-sm text-base-content/70">
              초대할 멤버의 구글 계정 이메일을 입력해주세요.
            </p>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              className="w-full rounded-lg border border-base-300 bg-base-50 px-3 py-2"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsInviteOpen(false);
                  setInviteEmail('');
                }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleInvite}
                disabled={isInviting || !inviteEmail.trim()}
              >
                {isInviting ? <span className="loading loading-spinner loading-xs" /> : '초대'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
