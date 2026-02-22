// XP 지급 + 레벨 계산

const LEVEL_THRESHOLDS = [
  { level: 20, xp: 10000 },
  { level: 15, xp: 5000 },
  { level: 10, xp: 2500 },
  { level: 7, xp: 1500 },
  { level: 5, xp: 800 },
  { level: 3, xp: 300 },
  { level: 2, xp: 100 },
  { level: 1, xp: 0 },
];

export function calcLevel(xp: number): number {
  for (const t of LEVEL_THRESHOLDS) {
    if (xp >= t.xp) return t.level;
  }
  return 1;
}

const LEVEL_TITLES: Record<number, { titleKey: string; title: string; emoji: string }> = {
  1: { titleKey: 'level_1', title: '여행 새싹', emoji: '🐣' },
  2: { titleKey: 'level_2', title: '초보 여행자', emoji: '🎒' },
  3: { titleKey: 'level_3', title: '길 위의 탐험가', emoji: '🧭' },
  5: { titleKey: 'level_5', title: '프리퀀트 트래블러', emoji: '✈️' },
  7: { titleKey: 'level_7', title: '숙련 여행자', emoji: '🗺️' },
  10: { titleKey: 'level_10', title: '월드 트래블러', emoji: '🌍' },
  15: { titleKey: 'level_15', title: '여행 마스터', emoji: '🏆' },
  20: { titleKey: 'level_20', title: '레전드 트래블러', emoji: '👑' },
};

export function getLevelInfo(level: number) {
  // 정의된 레벨 중 가장 가까운 하위 레벨 찾기
  const defined = Object.keys(LEVEL_TITLES).map(Number).sort((a, b) => b - a);
  for (const lv of defined) {
    if (level >= lv) return { level, titleKey: LEVEL_TITLES[lv].titleKey, title: LEVEL_TITLES[lv].title, ...LEVEL_TITLES[lv] };
  }
  return { level, titleKey: 'level_1', title: '여행 새싹', emoji: '🐣' };
}

export function getNextLevelXP(currentXP: number): number | null {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (LEVEL_THRESHOLDS[i].xp > currentXP) return LEVEL_THRESHOLDS[i].xp;
  }
  return null; // max level
}

/**
 * XP 지급 (idempotent)
 * @returns true if XP was granted, false if duplicate
 */
export async function grantXP(
  db: D1Database,
  userId: number,
  action: string,
  xp: number,
  idempotencyKey: string,
  refType?: string,
  refId?: number
): Promise<boolean> {
  // INSERT with conflict check
  const result = await db.prepare(
    `INSERT INTO xp_events (user_id, action, xp, idempotency_key, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO NOTHING`
  ).bind(userId, action, xp, idempotencyKey, refType ?? null, refId ?? null).run();

  if (!result.meta.changes) return false;

  // Update user XP + recalc level
  const user = await db.prepare('SELECT xp FROM users WHERE id = ?').bind(userId).first<{ xp: number }>();
  const newXP = (user?.xp ?? 0) + xp;
  const newLevel = calcLevel(newXP);

  await db.prepare(
    'UPDATE users SET xp = ?, level = ? WHERE id = ?'
  ).bind(newXP, newLevel, userId).run();

  return true;
}

// XP 액션별 포인트
export const XP_VALUES = {
  plan_create: 10,
  schedule_place: 5,
  moment_photo: 30,
  moment_text: 15,
  moment_rating: 5,
  new_city: 50,
  new_country: 100,
  plan_complete: 50,
  plan_public: 20,
  invite_member: 10,
} as const;

/**
 * 모먼트 생성 시 XP 지급 (사진/텍스트/별점 분리)
 */
export async function grantMomentXP(db: D1Database, userId: number, momentId: number, hasPhoto: boolean, hasNote: boolean, hasRating: boolean) {
  if (hasPhoto) {
    await grantXP(db, userId, 'moment_photo', XP_VALUES.moment_photo, `moment_photo:moment:${momentId}`, 'moment', momentId);
  } else if (hasNote) {
    await grantXP(db, userId, 'moment_text', XP_VALUES.moment_text, `moment_text:moment:${momentId}`, 'moment', momentId);
  }
  if (hasRating) {
    await grantXP(db, userId, 'moment_rating', XP_VALUES.moment_rating, `moment_rating:moment:${momentId}`, 'moment', momentId);
  }
}

/**
 * 새 도시/국가 방문 체크 + XP
 */
export async function grantVisitXP(
  db: D1Database,
  userId: number,
  countryCode: string,
  cityKey: string,
  cityDisplay?: string,
  countryDisplay?: string,
  sourceType?: string,
  sourceId?: number
) {
  if (!countryCode) return;

  // 국가 첫 방문 체크
  const existingCountry = await db.prepare(
    'SELECT 1 FROM visited_places WHERE user_id = ? AND country_code = ? LIMIT 1'
  ).bind(userId, countryCode).first();

  // 도시 등록 (ON CONFLICT 무시)
  await db.prepare(
    `INSERT INTO visited_places (user_id, country_code, city_key, city_display, country_display, source_type, source_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, country_code, city_key) DO NOTHING`
  ).bind(userId, countryCode, cityKey || '__unknown__', cityDisplay ?? null, countryDisplay ?? null, sourceType ?? null, sourceId ?? null).run();

  // 새 국가면 +100
  if (!existingCountry) {
    await grantXP(db, userId, 'new_country', XP_VALUES.new_country, `new_country:user:${userId}:${countryCode}`, 'country', null);
  }

  // 새 도시면 +50
  if (cityKey && cityKey !== '__unknown__') {
    await grantXP(db, userId, 'new_city', XP_VALUES.new_city, `new_city:user:${userId}:${countryCode}:${cityKey}`, 'city', null);
  }
}
