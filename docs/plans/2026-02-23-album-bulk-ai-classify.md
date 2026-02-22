# Album Bulk AI Classification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to bulk-upload up to 10 trip photos, classify them to existing schedules using AI + metadata, auto-apply assignments, and upload optimized images with easy post-move UX.

**Architecture:** Add a server endpoint to classify metadata against plan schedules via OpenAI. Add a frontend bulk importer in album tab that extracts EXIF on client, calls classifier, uploads optimized image once to R2, then creates moment links to one or more schedules. Keep fallback deterministic assignment so every photo is always assigned.

**Tech Stack:** Cloudflare Pages Functions (TypeScript), OpenAI JSON mode, React + Vite, existing moments/upload APIs, EXIF utility, image compression utility.

---

### Task 1: Add failing test for classifier endpoint contract

**Files:**
- Create: `tests/api/photo-classify.test.ts`

### Task 2: Implement `/api/assistant/classify-photos`

**Files:**
- Create: `functions/api/assistant/classify-photos.ts`

### Task 3: Add frontend API client for classification

**Files:**
- Modify: `src/lib/api.ts`

### Task 4: Build bulk importer UI component

**Files:**
- Create: `src/components/BulkMomentImporter.tsx`
- Modify: `src/lib/imageUtils.ts` (blob conversion helper)

### Task 5: Integrate bulk importer into album tab

**Files:**
- Modify: `src/pages/PlanDetailPage.tsx`

### Task 6: Add i18n keys for new UI text

**Files:**
- Modify: `src/i18n/locales/*/common.json` (ko/en/ja/zh-TW/ar/hi/pt/ru/th)

### Task 7: Validate end-to-end and commit

**Commands:**
- `npx vitest run -c tests/vitest.config.ts tests/api/photo-classify.test.ts`
- `npm run build`
- `git add ... && git commit ... && git push`
