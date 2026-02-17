// ICS (iCalendar) 파일 생성기
import type { Schedule } from '../store/types';

// ICS 텍스트 이스케이프
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// ICS 라인 폴딩 (75옥텟 제한, RFC 5545)
function foldLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) return line;
  const parts: string[] = [line.slice(0, maxLen)];
  for (let i = maxLen; i < line.length; i += maxLen - 1) {
    parts.push(' ' + line.slice(i, i + maxLen - 1));
  }
  return parts.join('\r\n');
}

function formatDateTime(date: string, time: string): string {
  const d = date.replace(/-/g, '');
  const t = time.replace(/:/g, '').padEnd(4, '0') + '00';
  return `${d}T${t}`;
}

function formatDateOnly(date: string): string {
  return date.replace(/-/g, '');
}

function addHours(date: string, time: string, hours: number): string {
  const d = new Date(`${date}T${time}`);
  d.setHours(d.getHours() + hours);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}${m}${day}T${h}${min}00`;
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function nowStamp(): string {
  const d = new Date();
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

export function generateICS(planTitle: string, schedules: Schedule[]): string {
  const lines: string[] = [];
  
  const addLine = (line: string) => lines.push(foldLine(line));

  addLine('BEGIN:VCALENDAR');
  addLine('VERSION:2.0');
  addLine('PRODID:-//Travly//Travel Plan//EN');
  addLine('CALSCALE:GREGORIAN');
  addLine('METHOD:PUBLISH');
  addLine(`X-WR-CALNAME:${escapeICS(planTitle)}`);

  const stamp = nowStamp();

  schedules.forEach(s => {
    addLine('BEGIN:VEVENT');
    addLine(`UID:travly-${s.id}@travly.cocy.io`);
    addLine(`DTSTAMP:${stamp}`);
    addLine(`SUMMARY:${escapeICS(s.title)}`);

    if (s.time) {
      addLine(`DTSTART:${formatDateTime(s.date, s.time)}`);
      addLine(`DTEND:${addHours(s.date, s.time, 1)}`);
    } else {
      addLine(`DTSTART;VALUE=DATE:${formatDateOnly(s.date)}`);
      addLine(`DTEND;VALUE=DATE:${nextDay(s.date)}`);
    }

    const descParts: string[] = [];
    if (s.place) descParts.push(`장소: ${s.place}`);
    if (s.memo) descParts.push(s.memo);
    if (descParts.length) {
      addLine(`DESCRIPTION:${escapeICS(descParts.join('\n'))}`);
    }

    if (s.place) addLine(`LOCATION:${escapeICS(s.place)}`);
    if (s.latitude && s.longitude) addLine(`GEO:${s.latitude};${s.longitude}`);

    addLine('END:VEVENT');
  });

  addLine('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(planTitle: string, schedules: Schedule[]) {
  const ics = generateICS(planTitle, schedules);
  // BOM 추가 (한글 호환)
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // 파일명: 영문 fallback
  const safeName = planTitle.replace(/[^\w가-힣\s-]/g, '').trim() || 'travel-plan';
  a.download = `${safeName}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
