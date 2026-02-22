import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

type Flat = Record<string, string>;

function flatten(obj: unknown, prefix = ''): Flat {
  if (!obj || typeof obj !== 'object') return {};
  const out: Flat = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, next));
    } else {
      out[next] = String(value);
    }
  }
  return out;
}

function readLocale(code: string): Flat {
  const p = path.join(process.cwd(), 'src', 'i18n', 'locales', code, 'common.json');
  return flatten(JSON.parse(fs.readFileSync(p, 'utf8')));
}

describe('i18n locale quality', () => {
  it('pt should translate key UI strings that were previously left in English', () => {
    const en = readLocale('en');
    const pt = readLocale('pt');

    const mustBeTranslated = [
      'main.worldTripsTitle',
      'createPlan.loadingTips.11',
      'createPlan.loadingTips.12',
      'chat.examples.local.item2',
      'chat.examples.local.item3',
      'planDetail.visibilityOption.public',
      'planDetail.errors.requiredPlanFields',
      'memo.emptyHint',
      'tripNotes.empty',
      'offline.caution3',
      'offline.offMessage',
      'profile.installHint2',
    ] as const;

    for (const key of mustBeTranslated) {
      expect(pt[key]).toBeTruthy();
      expect(pt[key]).not.toBe(en[key]);
    }
  });

  it('ru/th locales should exist and translate critical keys', () => {
    const en = readLocale('en');
    const ru = readLocale('ru');
    const th = readLocale('th');

    const criticalKeys = [
      'nav.home',
      'login.googleContinue',
      'main.worldTripsTitle',
      'createPlan.title',
      'planDetail.tripSettings',
      'chat.welcome',
      'translate.translate',
    ] as const;

    for (const key of criticalKeys) {
      expect(ru[key]).toBeTruthy();
      expect(th[key]).toBeTruthy();
      expect(ru[key]).not.toBe(en[key]);
      expect(th[key]).not.toBe(en[key]);
    }
  });
});
