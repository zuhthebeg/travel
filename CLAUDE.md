# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Travel MVP is a web application for creating, managing, and sharing travel plans with AI assistant capabilities. Built with React + Vite frontend and Cloudflare Pages Functions backend, using Cloudflare D1 (SQLite) for data storage and Gemini API for AI features.

**Key Features:**
- Travel plan creation and management with drag-and-drop scheduling
- AI-powered travel assistant (Gemini 2.5 Flash) for plan suggestions and natural language scheduling
- Google Maps integration for location visualization
- LocalStorage-based state persistence
- Text-to-schedule parsing (natural language to structured schedules)

## Development Commands

### Frontend Development
- `npm run dev` - Start Vite dev server (frontend only, no backend)
- `npm run build` - Build TypeScript and bundle frontend (MUST run after frontend changes)
- `npm run preview` - Preview production build locally
- `npm test` - Run Vitest tests

### Backend Development (Cloudflare)
- `npm run pages:dev` - Build frontend + start Wrangler dev server with Functions (port 8788)
- `npm run pages:deploy` - Build + deploy to Cloudflare Pages

### Database (D1)
- `wrangler d1 execute travel-mvp-db --local --file=schema.sql` - Apply schema to local DB
- `wrangler d1 execute travel-mvp-db --local --file=test-data.sql` - Load test data
- `wrangler d1 execute travel-mvp-db --remote --file=schema.sql` - Apply schema to production

**Important:** Always run `npm run build` after frontend changes to verify TypeScript compilation succeeds before committing.

## Architecture

### Frontend (src/)
- **React Router** - Page routing: `/`, `/my`, `/plan/:id`, `/plan/new`, `/assistant`
- **Zustand** - Global state management with localStorage persistence ([src/store/useStore.ts](src/store/useStore.ts))
- **TailwindCSS + DaisyUI** - Styling framework
- **react-beautiful-dnd** - Drag-and-drop schedule reordering
- **@react-google-maps/api** - Map integration

**State Management Pattern:**
- Zustand store persists only `currentUser` to localStorage
- Plans and schedules are fetched from API on page load
- API module ([src/lib/api.ts](src/lib/api.ts)) handles all backend communication
- API_BASE_URL switches between `http://127.0.0.1:9999` (dev) and relative URLs (production)

### Backend (functions/api/)
- **Cloudflare Pages Functions** - Serverless API endpoints
- **File-based routing** - `functions/api/plans.ts` → `/api/plans`, `functions/api/plans/[id].ts` → `/api/plans/:id`
- **Shared types** - [functions/types.ts](functions/types.ts) defines all database models and API contracts

**Key API Endpoints:**
- `/api/plans` - CRUD for travel plans
- `/api/schedules` - CRUD for schedules
- `/api/assistant` - Gemini AI chat interface
- `/api/assistant/parse-plan` - Parse natural language to structured plan
- `/api/schedules/from-text` - Convert text description to schedule

**Environment Variables:**
- `GEMINI_API_KEY` - Stored in `.dev.vars` for local development, Cloudflare dashboard for production
- Bound to `context.env` in Functions via Cloudflare's environment system

### Database (Cloudflare D1)
Schema defined in [schema.sql](schema.sql):
- `users` - Simple user accounts (username/password)
- `plans` - Travel plans with title, region, dates, thumbnail, visibility
- `schedules` - Individual schedule items with date, time, title, place, memo, plan_b/plan_c alternatives, order_index
- `recommendations` - Like/recommendation counts
- `conversations` - AI chat history (planned for future use)

**Important Database Details:**
- `schedules.time` field added for time-specific scheduling
- `schedules.order_index` enables drag-and-drop reordering within same day
- Cascade deletes configured (deleting plan removes all schedules)

### AI Integration (Gemini)
- Model: `gemini-2.5-flash-latest`
- Common Gemini interface: [functions/api/assistant/_common.ts](functions/api/assistant/_common.ts)
- Features:
  - **Chat assistant** - Context-aware travel planning help
  - **Plan parsing** - Converts freeform text to structured JSON schedule
  - **Text-to-schedule** - Natural language like "오사카성 방문 10:00 AM" → structured schedule

**AI Prompt Pattern:**
- Frontend constructs system prompt with plan context (title, region, dates, existing schedules)
- Backend receives `systemPrompt` + `message` + `history` and calls Gemini
- All AI responses are in Korean by default

## Project Structure Patterns

### Type Safety
- Shared types between frontend/backend in [functions/types.ts](functions/types.ts) and [src/store/types.ts](src/store/types.ts)
- Frontend types mirror backend types but are kept separate to avoid build complexity
- Always maintain type consistency when modifying data models

### API Request Flow
1. Frontend component calls `plansAPI.create()` or `schedulesAPI.update()` from [src/lib/api.ts](src/lib/api.ts)
2. Request proxied to Cloudflare Function via Vite dev server (port 9999 in dev) or direct in production
3. Function validates, interacts with D1 database, returns JSON
4. Frontend updates Zustand store with response data

### Component Organization
- Pages in [src/pages/](src/pages/) - Route-level components
- Reusable components in [src/components/](src/components/)
- Custom hooks in [src/hooks/](src/hooks/) - Speech recognition, browser notifications

## Development Workflow

### Adding New Features
1. Update database schema in [schema.sql](schema.sql) if needed
2. Run migration: `wrangler d1 execute travel-mvp-db --local --file=schema.sql`
3. Update types in [functions/types.ts](functions/types.ts)
4. Create/modify API endpoint in `functions/api/`
5. Update frontend API client in [src/lib/api.ts](src/lib/api.ts)
6. Update Zustand store if needed in [src/store/useStore.ts](src/store/useStore.ts)
7. Implement UI in components/pages
8. Run `npm run build` to verify TypeScript compilation
9. Test with `npm run pages:dev` to verify full stack integration

### Working with Gemini AI
- API key required in `.dev.vars`: `GEMINI_API_KEY=your-key-here`
- Modify prompts in component code (e.g., [src/pages/CreatePlanPage.tsx](src/pages/CreatePlanPage.tsx))
- Common Gemini utilities in [functions/api/assistant/_common.ts](functions/api/assistant/_common.ts)
- Test AI features with `npm run pages:dev` (requires backend running)

### Vite Dev Server Proxy
The Vite config proxies `/api/*` to `http://localhost:8788` in development. When developing full-stack:
1. Run `npm run pages:dev` in one terminal (starts backend on port 8788, frontend on port 5173)
2. OR run `wrangler pages dev ./dist --port=9999` + `npm run dev` separately
3. Frontend dev server proxies API calls to backend automatically

## Known Patterns & Conventions

- **Date Format:** ISO 8601 strings (`YYYY-MM-DD`) for dates, `HH:MM AM/PM` for times
- **Error Handling:** Backend returns `{ error: "message" }` with appropriate HTTP status codes
- **CORS:** Backend includes `Access-Control-Allow-Origin: *` for development
- **Drag-and-Drop:** Uses `react-beautiful-dnd` with horizontal list layout in [src/pages/PlanDetailPage.tsx](src/pages/PlanDetailPage.tsx)
- **Optimistic Updates:** Not implemented - UI waits for API responses before updating
- **Image Upload:** Placeholder implementation exists in [functions/api/upload.ts](functions/api/upload.ts), R2 bucket integration commented out in [wrangler.toml](wrangler.toml)

## Configuration Files

- [wrangler.toml](wrangler.toml) - Cloudflare configuration (D1 binding, environment vars)
- [vite.config.ts](vite.config.ts) - Frontend build configuration with API proxy
- [tsconfig.json](tsconfig.json) - TypeScript compiler options (strict mode enabled)
- [tailwind.config.js](tailwind.config.js) - TailwindCSS + DaisyUI theme configuration
- `.dev.vars` - Local environment variables (gitignored, contains GEMINI_API_KEY)

## Important Notes

- The frontend build output ([dist/](dist/)) is served by Cloudflare Pages
- Database is SQLite (D1) - no need for migrations framework, just apply SQL files
- Authentication is basic username/password (no JWT, no OAuth yet)
- The app is designed for Korean users - UI text and AI responses are primarily Korean
- LocalStorage persistence is minimal (user info only) to avoid sync issues
