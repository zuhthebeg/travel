// Assistant Action ACL — 역할 기반 1차 게이트
import type { AccessLevel } from './auth';

export type AssistantActionType =
  | 'chat'
  | 'add'
  | 'update'
  | 'delete'
  | 'shift_all'
  | 'delete_matching'
  | 'update_plan'
  | 'add_memo'
  | 'update_memo'
  | 'delete_memo'
  | 'generate_memos'
  | 'add_moment'
  | 'update_moment'
  | 'delete_moment'
  | 'add_member'
  | 'remove_member'
  | 'set_visibility';

type RoleForAcl = 'owner' | 'member';

const ACL: Record<AssistantActionType, Record<RoleForAcl, boolean>> = {
  chat:            { owner: true, member: true },
  add:             { owner: true, member: false },
  update:          { owner: true, member: false },
  delete:          { owner: true, member: false },
  shift_all:       { owner: true, member: false },
  delete_matching: { owner: true, member: false },
  update_plan:     { owner: true, member: false },
  add_memo:        { owner: true, member: false },
  update_memo:     { owner: true, member: false },
  delete_memo:     { owner: true, member: false },
  generate_memos:  { owner: true, member: false },
  add_moment:      { owner: true, member: true },
  update_moment:   { owner: true, member: true },  // + 소유권 2차 체크
  delete_moment:   { owner: true, member: true },  // + 소유권 2차 체크
  add_member:      { owner: true, member: false },
  remove_member:   { owner: true, member: false },
  set_visibility:  { owner: true, member: false },
};

/**
 * action 실행 전 권한 체크. public/null은 전면 차단.
 */
export function canExecute(
  actionType: string,
  access: AccessLevel
): boolean {
  if (!access || access === 'public') return false;
  const rule = ACL[actionType as AssistantActionType];
  if (!rule) return false;
  return rule[access as RoleForAcl] ?? false;
}
