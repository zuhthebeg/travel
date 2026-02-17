// 뱃지 체크 + 수여

interface BadgeRow {
  id: string;
  condition_type: string;
  condition_value: number;
}

// 대륙별 국가 코드 매핑 (주요국만, 확장 가능)
const ASIA_CODES = new Set(['KR','JP','CN','TW','HK','TH','VN','SG','MY','ID','PH','IN','MN','KH','LA','MM','NP','LK','MV','UZ','KZ']);
const EUROPE_CODES = new Set(['GB','FR','DE','IT','ES','PT','NL','BE','CH','AT','CZ','PL','HU','GR','HR','SE','NO','DK','FI','IE','IS','RO','BG','SK','SI','EE','LV','LT','LU','MT','MC']);
const AMERICAS_CODES = new Set(['US','CA','MX','BR','AR','CL','CO','PE','EC','CR','PA','CU','JM','DO','PR','UY','PY','BO','VE','GT','HN','SV','NI','BZ','HT','TT']);

/**
 * 유저의 뱃지 조건 체크 후 새로 획득한 뱃지 수여
 * @returns 새로 획득한 뱃지 ID 배열
 */
export async function checkAndGrantBadges(db: D1Database, userId: number): Promise<string[]> {
  // 미획득 뱃지 목록
  const { results: unearned } = await db.prepare(
    `SELECT b.id, b.condition_type, b.condition_value
     FROM badges b
     WHERE b.id NOT IN (SELECT badge_id FROM user_badges WHERE user_id = ?)`
  ).bind(userId).all<BadgeRow>();

  if (!unearned.length) return [];

  // 유저 통계 수집 (한 번에)
  const stats = await getUserStats(db, userId);
  const earned: string[] = [];

  for (const badge of unearned) {
    const value = stats[badge.condition_type] ?? 0;
    if (value >= badge.condition_value) {
      await db.prepare(
        `INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)
         ON CONFLICT DO NOTHING`
      ).bind(userId, badge.id).run();
      earned.push(badge.id);
    }
  }

  return earned;
}

async function getUserStats(db: D1Database, userId: number): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};

  // 모먼트 관련
  const momentStats = await db.prepare(
    `SELECT
       COUNT(*) as moment_count,
       SUM(CASE WHEN photo_data IS NOT NULL THEN 1 ELSE 0 END) as photo_moment_count,
       SUM(CASE WHEN photo_data IS NULL AND note IS NOT NULL THEN 1 ELSE 0 END) as text_moment_count,
       SUM(CASE WHEN rating IS NOT NULL THEN 1 ELSE 0 END) as rated_moment_count
     FROM moments WHERE user_id = ?`
  ).bind(userId).first<Record<string, number>>();

  if (momentStats) {
    stats.moment_count = momentStats.moment_count ?? 0;
    stats.photo_moment_count = momentStats.photo_moment_count ?? 0;
    stats.text_moment_count = momentStats.text_moment_count ?? 0;
    stats.rated_moment_count = momentStats.rated_moment_count ?? 0;
  }

  // 완료된 여행 수 (end_date < today + 모먼트 3개 이상)
  const trips = await db.prepare(
    `SELECT COUNT(DISTINCT p.id) as cnt
     FROM plans p
     WHERE p.user_id = ? AND p.end_date < date('now')
     AND (SELECT COUNT(*) FROM moments m JOIN schedules s ON m.schedule_id = s.id WHERE s.plan_id = p.id) >= 3`
  ).bind(userId).first<{ cnt: number }>();
  stats.completed_trip_count = trips?.cnt ?? 0;

  // 방문 국가/도시
  const places = await db.prepare(
    `SELECT country_code FROM visited_places WHERE user_id = ?`
  ).bind(userId).all<{ country_code: string }>();

  const countryCodes = new Set(places.results.map(r => r.country_code));
  stats.country_count = countryCodes.size;
  stats.asia_country_count = [...countryCodes].filter(c => ASIA_CODES.has(c)).length;
  stats.europe_country_count = [...countryCodes].filter(c => EUROPE_CODES.has(c)).length;
  stats.americas_country_count = [...countryCodes].filter(c => AMERICAS_CODES.has(c)).length;

  // 대륙 수
  const continents = new Set<string>();
  for (const c of countryCodes) {
    if (ASIA_CODES.has(c)) continents.add('asia');
    if (EUROPE_CODES.has(c)) continents.add('europe');
    if (AMERICAS_CODES.has(c)) continents.add('americas');
    // 기타 대륙은 나중에 확장
  }
  stats.continent_count = continents.size;

  // 초대 횟수
  const invites = await db.prepare(
    `SELECT COUNT(*) as cnt FROM xp_events WHERE user_id = ? AND action = 'invite_member'`
  ).bind(userId).first<{ cnt: number }>();
  stats.invited_count = invites?.cnt ?? 0;

  return stats;
}

/**
 * 유저의 뱃지 목록 조회 (획득 + 미획득)
 */
export async function getUserBadges(db: D1Database, userId: number) {
  const { results } = await db.prepare(
    `SELECT b.*, ub.earned_at
     FROM badges b
     LEFT JOIN user_badges ub ON b.id = ub.badge_id AND ub.user_id = ?
     ORDER BY ub.earned_at DESC NULLS LAST, b.category, b.id`
  ).bind(userId).all();

  return results.map(r => ({
    ...r,
    earned: !!r.earned_at,
  }));
}
