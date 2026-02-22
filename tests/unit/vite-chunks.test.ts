import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('vite chunk splitting config', () => {
  it('contains manualChunks mapping for heavy dependencies', () => {
    const p = path.join(process.cwd(), 'vite.config.ts');
    const txt = fs.readFileSync(p, 'utf8');

    expect(txt.includes('manualChunks')).toBe(true);
    expect(txt.includes('@mlc-ai/web-llm')).toBe(true);
    expect(txt.includes('leaflet')).toBe(true);
    expect(txt.includes('react-beautiful-dnd')).toBe(true);
  });
});
