#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /mnt/c/Users/user/travel

PROMPT='Read PLAN_DETAIL_UX_REVIEW.md, then read src/pages/PlanDetailPage.tsx, src/components/DayView.tsx, src/components/ScheduleCard.tsx. After reading all files, write your UX review to REVIEW_RESULT.md. For each item A through F say APPROVE or MODIFY or REJECT with reason. List risks, priority order, and additional UX improvements. Write in Korean. Do NOT implement changes, only review.'

codex exec --full-auto "$PROMPT"
