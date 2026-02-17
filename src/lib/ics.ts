// ICS (iCalendar) 파일 생성기
import type { Schedule } from '../store/types';

function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function formatDate(date: string, time: string | null): string {
  const d = date.replace(/-/g, '');
  if (!time) return d; // 종일 이벤트
  const t = time.replace(/:/g, '').padEnd(4, '0') + '00';
  return `${d}T${t}`;
}

function addHours(date: string, time: string, hours: number): string {
  const d = new Date(`${date}T${time || '00:00'}`);
  d.setHours(d.getHours() + hours);
  const dd = d.toISOString().split('T')[0].replace(/-/g, '');
  const tt = d.toTimeString().slice(0, 5).replace(/:/g, '') + '00';
  return `${dd}T${tt}`;
}

export function generateICS(planTitle: string, schedules: Schedule[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Travly//Travel Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(planTitle)}`,
  ];

  schedules.forEach(s => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:travly-schedule-${s.id}@travly.cocy.io`);
    lines.push(`SUMMARY:${escapeICS(s.title)}`);

    if (s.time) {
      lines.push(`DTSTART:${formatDate(s.date, s.time)}`);
      lines.push(`DTEND:${addHours(s.date, s.time, 1)}`);
    } else {
      // 종일 이벤트
      lines.push(`DTSTART;VALUE=DATE:${s.date.replace(/-/g, '')}`);
      const next = new Date(s.date + 'T00:00:00');
      next.setDate(next.getDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${next.toISOString().split('T')[0].replace(/-/g, '')}`);
    }

    const descParts: string[] = [];
    if (s.place) descParts.push(`장소: ${s.place}`);
    if (s.memo) descParts.push(s.memo);
    if (descParts.length) lines.push(`DESCRIPTION:${escapeICS(descParts.join('\\n'))}`);

    if (s.place) lines.push(`LOCATION:${escapeICS(s.place)}`);
    if (s.latitude && s.longitude) lines.push(`GEO:${s.latitude};${s.longitude}`);

    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(planTitle: string, schedules: Schedule[]) {
  const ics = generateICS(planTitle, schedules);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${planTitle.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
