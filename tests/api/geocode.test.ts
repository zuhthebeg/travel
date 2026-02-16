import { describe, expect, it } from 'vitest';
import { api } from './helpers';

describe('Geocode API', () => {
  it('영어 장소 검색 (Tokyo Tower)', async () => {
    const res = await api<{ places: Array<{ name: string; lat: number; lng: number }> }>('GET', '/api/geocode?q=Tokyo%20Tower');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.places)).toBe(true);
    expect(res.data.places.length).toBeGreaterThan(0);
    expect(typeof res.data.places[0].lat).toBe('number');
    expect(typeof res.data.places[0].lng).toBe('number');
  });

  it('한국어 장소 검색 (도쿄타워) → 번역 후 검색', async () => {
    const res = await api<{ places: Array<{ name: string }> }>('GET', '/api/geocode?q=%EB%8F%84%EC%BF%84%ED%83%80%EC%9B%8C');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.places)).toBe(true);
    expect(res.data.places.length).toBeGreaterThan(0);
  });

  it('존재하지 않는 장소 → 빈 결과 또는 에러', async () => {
    const res = await api<{ places?: unknown[]; error?: string }>('GET', '/api/geocode?q=zzzz_nonexistent_place_12345');

    if (res.status === 200) {
      expect(Array.isArray(res.data.places)).toBe(true);
      expect(res.data.places?.length ?? 0).toBe(0);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
});
