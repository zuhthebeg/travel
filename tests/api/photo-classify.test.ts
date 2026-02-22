import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('photo classify endpoint', () => {
  it('should exist and include fallback assignment rule', () => {
    const p = path.join(process.cwd(), 'functions', 'api', 'assistant', 'classify-photos.ts');
    const txt = fs.readFileSync(p, 'utf8');
    expect(txt.includes('fallbackAssign')).toBe(true);
    expect(txt.includes('MUST assign every photo')).toBe(true);
  });
});
