import { describe, it, expect } from 'vitest';
import { generateICS } from '../src/lib/ics';

const mockSchedules = [
  {
    id: 1, plan_id: 81, date: '2026-03-15', time: '17:00',
    title: '인천 출발 OZ6614', place: '인천국제공항 T1', memo: '아시아나/유나이티드',
    place_en: null, plan_b: null, plan_c: null, order_index: 1,
    rating: null, review: null, latitude: 37.4602, longitude: 126.4407,
    country_code: 'KR', created_at: '2026-02-17',
  },
  {
    id: 2, plan_id: 81, date: '2026-03-20', time: null,
    title: 'SF 자유관광', place: '샌프란시스코', memo: '골든게이트, 피어39',
    place_en: null, plan_b: null, plan_c: null, order_index: 1,
    rating: null, review: null, latitude: 37.7749, longitude: -122.4194,
    country_code: 'US', created_at: '2026-02-17',
  },
  {
    id: 3, plan_id: 81, date: '2026-03-21', time: '08:00',
    title: '[D1] SF -> 요세미티', place: 'Yosemite National Park',
    memo: '필수비 160USD/인, 약 4시간 이동',
    place_en: null, plan_b: null, plan_c: null, order_index: 2,
    rating: null, review: null, latitude: 37.8651, longitude: -119.5383,
    country_code: 'US', created_at: '2026-02-17',
  },
];

describe('ICS Generator', () => {
  it('should generate valid ICS structure', () => {
    const ics = generateICS('미국 여행', mockSchedules);
    
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Travly//Travel Plan//EN');
  });

  it('should contain all events', () => {
    const ics = generateICS('미국 여행', mockSchedules);
    
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(3);
  });

  it('should handle timed events with DTSTART/DTEND', () => {
    const ics = generateICS('test', mockSchedules);
    
    expect(ics).toContain('DTSTART:20260315T170000');
    expect(ics).toContain('DTEND:20260315T180000'); // +1 hour
  });

  it('should handle all-day events', () => {
    const ics = generateICS('test', mockSchedules);
    
    expect(ics).toContain('DTSTART;VALUE=DATE:20260320');
    expect(ics).toContain('DTEND;VALUE=DATE:20260321');
  });

  it('should include DTSTAMP in every event', () => {
    const ics = generateICS('test', mockSchedules);
    
    const stampCount = (ics.match(/DTSTAMP:/g) || []).length;
    expect(stampCount).toBe(3);
  });

  it('should escape special characters in SUMMARY', () => {
    const ics = generateICS('test', mockSchedules);
    
    // Commas should be escaped
    expect(ics).not.toMatch(/SUMMARY:.*[^\\],/);
  });

  it('should include LOCATION and GEO', () => {
    const ics = generateICS('test', mockSchedules);
    
    expect(ics).toContain('LOCATION:Yosemite National Park');
    expect(ics).toContain('GEO:37.8651;-119.5383');
  });

  it('should include DESCRIPTION with place and memo', () => {
    const ics = generateICS('test', mockSchedules);
    
    expect(ics).toContain('DESCRIPTION:');
    // memo content should be present (escaped)
    expect(ics).toMatch(/DESCRIPTION:.*160USD/);
  });

  it('should have unique UIDs', () => {
    const ics = generateICS('test', mockSchedules);
    
    expect(ics).toContain('UID:travly-1@travly.cocy.io');
    expect(ics).toContain('UID:travly-2@travly.cocy.io');
    expect(ics).toContain('UID:travly-3@travly.cocy.io');
  });

  it('should handle empty schedules', () => {
    const ics = generateICS('빈 여행', []);
    
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('should use CRLF line endings', () => {
    const ics = generateICS('test', mockSchedules);
    
    expect(ics).toContain('\r\n');
    // Should not have bare LF
    const withoutCRLF = ics.replace(/\r\n/g, '');
    expect(withoutCRLF).not.toContain('\n');
  });

  it('should fold long lines', () => {
    const longMemo = {
      ...mockSchedules[2],
      id: 99,
      memo: 'A'.repeat(200),
    };
    const ics = generateICS('test', [longMemo]);
    
    // Folded lines start with space after CRLF
    const lines = ics.split('\r\n');
    const foldedLines = lines.filter(l => l.startsWith(' '));
    expect(foldedLines.length).toBeGreaterThan(0);
  });
});
