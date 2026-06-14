# StudyFocus — dev log & planning notes

Reconstructed journal (Dec 2025 → Apr 2026). Dates are **estimates** where day-level detail wasn’t recoverable; sequence matches how the stack and features actually layered (auth → core tabs → realtime → AI → UX/docs). Use this for planning, retros, or reports — not as a git-accurate audit.

---

## December 2025 — foundations

### Mon 2 Dec
- **Work:** Repo setup: `create-react-app` client, root `package.json` with `concurrently`, Express on 3001, nodemon. CORS + `body-parser`, `server/data` auto-create.
- **Problems:** Port 3000 already taken once; killed stray process.
- **Decisions:** Keep everything in one repo; JSON files for persistence (no DB yet) so iteration stays fast.
- **Next:** Auth before building UI depth.

### Wed 4 Dec
- **Work:** Signup/login routes, `users.json`, SHA-256 passwords, base64 “token” payload (not real JWT — noted as tech debt).
- **Problems:** First pass returned too much user shape; trimmed to id/name/email on responses.
- **Decisions:** Auth middleware on tab routes; generic `GET/PUT /api/:tab` for per-user JSON files.
- **Next:** Wire `AuthWrapper` + token in `localStorage`.

### Fri 6 Dec
- **Work:** React login/signup screens, protected app shell, verify endpoint for session restore.
- **Problems:** Flash of wrong screen on refresh — fixed with loading state on verify.
- **Decisions:** Hardcode API base `http://localhost:3001` for local dev (env later).
- **Next:** Sidebar + main content router by tab id.

### Mon 9 Dec
- **Work:** Dark Notion-ish layout: `Sidebar`, `MainContent`, collapsed state. Started `DataContext` with debounced auto-save (~2s idle).
- **Problems:** Race when switching tabs before load finished — queued updates poorly; added simple loading flags.
- **Decisions:** One JSON file per user per tab key (`user_<id>_<tab>.json` pattern).
- **Next:** First real feature — Study Session.

### Wed 11 Dec
- **Work:** `StudySession` + Pomodoro-style timer, persist sessions array (subject, duration, timestamps, notes).
- **Problems:** Timer kept running in background when switching tabs; introduced minimized session + `FloatingTimer` idea (stubbed).
- **Decisions:** Store `startTime` / ISO strings consistently for later analytics.
- **Next:** Home dashboard cards linking to session.

### Fri 13 Dec
- **Work:** `Home` summary, basic stats from saved sessions. `Leaderboard` v1 — aggregate from friends’ session files server-side.
- **Problems:** Slow with many users — acceptable for coursework scale; noted O(n) read of friend files.
- **Decisions:** Leaderboard is friends-scoped, not global.
- **Next:** Schedule planner (weekly grid).

### Mon 16 Dec
- **Work:** `SchedulePlanner` UI + persistence; aligned CSS with rest of app.
- **Problems:** Timezone edge when editing — stored local date strings for blocks.
- **Decisions:** Planner data separate file from study sessions.
- **Next:** Friends + requests (needed for leaderboard + future collab).

### Thu 19 Dec
- **Work:** Friends list, send/accept/decline/remove; `user_*_friends.json`.
- **Problems:** Duplicate request edge case — added checks on server.
- **Decisions:** Friend ids as string timestamps (same as user ids).
- **Next:** Direct messages.

### Fri 20 Dec
- **Work:** `Messages` thread by friend, `POST /api/messages/send`, conversation fetch. Unread counts endpoint for badge.
- **Problems:** Polling vs sockets — used polling first for simplicity.
- **Decisions:** Message shape with timestamps for sort order.
- **Next:** Before holidays — quick `SettingsModal` stub (account section).

### Mon 23 Dec
- **Work:** Settings shell, profile display, logout wiring. `LanguageContext` + `translations.js` scaffold (few keys).
- **Problems:** —
- **Decisions:** Centralize strings early so we don’t paint ourselves into a corner.
- **Next:** Analytics charts (need something visual for demo).

### Fri 27 Dec (light day)
- **Work:** Skimmed D3 docs; added `Analytics` + `DailyStudyChart` / `SubjectPieChart` using session data.
- **Problems:** Empty state ugly — added placeholders.
- **Decisions:** Use `d3` directly (no chart wrapper lib) for control.
- **Next:** Jan — meal/health data or polish analytics; undecided.

---

## January 2026 — depth, data bugs, social polish

### Mon 6 Jan
- **Work:** `MealPlanner` + server routes for custom meals; optional `health` / `sleep` file hooks (minimal UI, mostly structure).
- **Problems:** Scope creep vs “study app” — kept health/meal thin.
- **Decisions:** Still JSON-backed; same auth pattern.
- **Next:** Export PDF for analytics (html2canvas + jsPDF) — professor asked for printable summary.

### Wed 8 Jan
- **Work:** PDF export from analytics view; tweaked chart CSS for capture.
- **Problems:** Dark theme screenshots looked muddy — bumped contrast for export-only path.
- **Decisions:** Client-side export only (no server render).
- **Next:** Floating timer behavior when navigating away from Study Session.

### Fri 10 Jan
- **Work:** `FloatingTimer` + `minimizedSession` state in `App.js`; session end flows.
- **Problems:** Double-save on complete — debounce interaction with “stop” button.
- **Decisions:** Single source of truth in StudySession ref where possible.
- **Next:** Date field consistency in sessions (analytics grouped wrong on some rows).

### Tue 14 Jan
- **Work:** Chased mismatch between `date` string and `startTime` ISO — some sessions had `date` stuck on wrong calendar day. Wrote `fix-jan6-dates.js` one-off to re-derive `date` from `startTime` for seeded friend accounts.
- **Problems:** Seeded demo data made bug obvious; real users had fewer bad rows.
- **Decisions:** Going forward, set `date` from `startTime` on save in client.
- **Next:** Blackboard for solo study session (drawing layer).

### Thu 16 Jan
- **Work:** Solo `study-session` blackboard endpoints + canvas UI; save/load strokes JSON.
- **Problems:** Large payloads — throttle save frequency on draw end.
- **Decisions:** File per session id for blackboard state.
- **Next:** Goals module (coursework milestone).

### Mon 20 Jan
- **Work:** `Goals` tab: templates (weekly hours, exam prep, assignment), filters, completion, ties to `DataContext`.
- **Problems:** Translation keys exploded — added batches in `translations.js`.
- **Decisions:** Goals stored in `user_*_goals.json` (or tab key used by generic API — same pattern).
- **Next:** Message file attachments (multer already in server deps).

### Wed 22 Jan
- **Work:** `POST /api/messages/upload-file`, serve file, show in thread. Edit/delete message endpoints.
- **Problems:** File size — informal limit in multer config; watch for abuse if ever deployed.
- **Decisions:** Store uploads under `server/uploads/` with unique prefix names.
- **Next:** Real-time — evaluate Socket.IO for presence and study together.

### Fri 24 Jan
- **Work:** Spike: `socket.io` on HTTP server, basic connection from client. Presence hook sketch (`usePresence`).
- **Problems:** CORS/socket handshake mistakes first try — matched origin `localhost:3000`.
- **Decisions:** Use sockets for collaborative features, not for all CRUD.
- **Next:** Design Study Together flow (create → waiting room → sync timer).

---

## February 2026 — Study Together & realtime

### Mon 3 Feb
- **Work:** API routes: create/join session, list sessions, ready/start/pause/stop/leave. `study-together-sessions.json` + per-session files.
- **Problems:** State machine messy on paper — drew transitions before coding.
- **Decisions:** Session id separate from user id; store participants and host.
- **Next:** `WaitingRoom` UI + invite flow.

### Wed 5 Feb
- **Work:** `StudyTogether.js` layout, pending invites, scheduled sessions list. `SynchronizedStudySession` shell.
- **Problems:** Clock skew — server timestamps authority for phase changes.
- **Decisions:** Client displays server-driven phase; don’t trust only local timer.
- **Next:** Socket events for room updates (join, ready, start).

### Fri 7 Feb
- **Work:** Socket handlers for study-together rooms; reconnect handling first pass.
- **Problems:** Duplicate joins — idempotent join by user id.
- **Decisions:** Namespace or room id = session id string.
- **Next:** Chat inside session (`study-together-chat` file pattern).

### Tue 11 Feb
- **Work:** Chat send/list routes for study together; UI panel in session.
- **Problems:** Ordering — sort by server time; handle clock display in local TZ.
- **Decisions:** Separate chat JSON per session id.
- **Next:** Blackboard for study together (share with solo code where possible).

### Thu 13 Feb
- **Work:** Shared blackboard routes under `study-together/blackboard`; conflict on concurrent edits — last-write-wins v1.
- **Problems:** Jitter when two draw — acceptable for MVP.
- **Decisions:** Action-based updates for strokes optional later; started with full snapshot save.
- **Next:** `useStudyTogetherSocket` hook to consolidate client socket logic.

### Mon 17 Feb
- **Work:** Extracted `useStudyTogetherSocket.js`; reduced prop drilling in Study Together components.
- **Problems:** —
- **Decisions:** Keep hook testable by passing socket factory if ever needed.
- **Next:** Accept/decline/cancel scheduled sessions; polish empty states.

### Wed 19 Feb
- **Work:** Schedule/accept/decline/cancel endpoints wired; UI for pending row states.
- **Problems:** Stale list after action — refetch + optimistic update mix.
- **Decisions:** Refetch on focus for simplicity.
- **Next:** StudyFocus AI — aggregate user data endpoint + OpenAI proxy.

### Fri 21 Feb
- **Work:** `GET /api/ai/user-data` builds context from sessions, schedule, together sessions, notes snippets, meal/health files. `POST /api/ai/chat` with `https` module to OpenAI.
- **Problems:** Key management — `.env` + `dotenv`; clear error if `OPENAI_API_KEY` missing.
- **Decisions:** No key in client; all chat through server.
- **Next:** `StudyFocusAI.js` UI, streaming not required for v1.

### Mon 24 Feb
- **Work:** AI chat UI, message list, inject context on first message. Styled to match dark theme.
- **Problems:** Token limits — trim context; cap `max_tokens`.
- **Decisions:** Model default `gpt-4` in route (can change in body later).
- **Next:** Sidebar search + favorites (navigation getting crowded).

---

## March 2026 — navigation, onboarding, help, docs

### Mon 3 Mar
- **Work:** `FavoritesContext`, star tabs in sidebar; search index in `Sidebar.js` with keyword routing to pages/features.
- **Problems:** Search result keyboard nav — basic arrow keys done, edge cases remain.
- **Decisions:** Favorites persisted in user settings JSON (or dedicated — whichever file already held preferences).
- **Next:** Onboarding modal for first-run (product ask).

### Wed 5 Mar
- **Work:** `OnboardingModal`, `OnboardingContext` (or inline state — implementation shifted), `/api/onboarding/status` GET/PUT.
- **Problems:** Overlap with welcome modal for new signups — split logic: onboarding vs “has seen welcome”.
- **Decisions:** New signups get welcome; onboarding checklist optional for all.
- **Next:** `WelcomeModal` + `/api/welcome/status`.

### Fri 7 Mar
- **Work:** Welcome flow only when `isNewSignup`; persist `hasSeenWelcome`. `App.js` effect to fetch status.
- **Problems:** Failed fetch showed modal anyway for new signup — intentional fallback.
- **Decisions:** Don’t show welcome on plain login.
- **Next:** HelpBot floating entry + markdown help.

### Tue 11 Mar
- **Work:** `HelpBot.js` + CSS; linked FAQ/User Guide viewers; `react-markdown` for `public/FAQ.md`, `USER_GUIDE.md`.
- **Problems:** Image paths in markdown — used `public/` assets.
- **Decisions:** Help bot icon in `public/` for easy reference.
- **Next:** Legal/FAQ modals — `TermsOfServiceViewer`, `PrivacyPolicyViewer` (if not already split).

### Thu 13 Mar
- **Work:** Settings sections expanded: account, notifications, appearance. `SimpleMessageModal` for quick confirmations/toast patterns.
- **Problems:** Modal z-index stacking — standardized layers in CSS.
- **Decisions:** Toast provider at app root for global feedback.
- **Next:** `MessageNotifications` polish + unread badge in sidebar.

### Mon 17 Mar
- **Work:** i18n pass on newer strings (Goals, Study Together, AI). Fixed a few hardcoded English leftovers.
- **Problems:** Long strings in `translations.js` — getting unwieldy; acceptable for now.
- **Decisions:** No i18n library — manual object map.
- **Next:** README install instructions for non-technical testers.

### Wed 19 Mar
- **Work:** README troubleshooting (ports, install-all, health check). Root scripts documented.
- **Problems:** —
- **Decisions:** Keep README honest about JSON storage limits.
- **Next:** QA sweep — mobile layout not primary but fix worst overflow.

### Fri 21 Mar
- **Work:** Responsive tweaks: sidebar collapse, main content min-width, chart overflow scroll.
- **Problems:** Touch targets on mobile still meh — noted.
- **Decisions:** Desktop-first app; mobile “usable” only.
- **Next:** Generate demo friend data script for screenshots (`generate-friend-study-data.js` usage).

---

## April 2026 — testing, fixes, polish to date

### Wed 2 Apr
- **Work:** End-to-end manual test checklist: auth, each tab, study together with two browsers, AI with and without API key.
- **Problems:** OpenAI quota once — added clearer error surfacing in UI.
- **Decisions:** Document `.env.example` locally (not committed if secrets).
- **Next:** Edge cases: leave session while host, reconnect.

### Fri 4 Apr
- **Work:** Study together leave/stop cleanup; socket disconnect doesn’t orphan user in list (retest).
- **Problems:** Rare ghost participant — added leave on unmount where safe.
- **Decisions:** Host transfer v2 deferred — documented limitation.
- **Next:** Analytics PDF + chart alignment for assignment screenshots.

### Tue 8 Apr
- **Work:** Chart style pass (`ChartStyles.css`), axis labels, legend contrast. Minor `Analytics.js` fixes.
- **Problems:** —
- **Decisions:** —
- **Next:** Product/grading writeup draft (separate doc); align feature list with README.

### Thu 10 Apr
- **Work:** Synced README feature list with actual tabs (meal/health “integrated” wording). Removed outdated doc references where confusing.
- **Problems:** Old planning docs referenced removed features — ignored archived filenames.
- **Decisions:** Single source of truth: README + USER_GUIDE in `public/`.
- **Next:** Session persistence files cleanup (don’t commit huge `server/data` in real deploy — gitignore review).

### Mon 14 Apr
- **Work:** Confirmed `index.html` / `index.css` global styles; favicon/meta for local demo.
- **Problems:** —
- **Decisions:** —
- **Next:** Final pass on HelpBot prompts and FAQ accuracy.

### Wed 16 Apr
- **Work:** FAQ updates for Study Together steps; cross-links from User Guide.
- **Problems:** Screenshots outdated after UI tweak — noted to re-capture if needed.
- **Decisions:** Text-first docs to avoid constant image churn.
- **Next:** Buffer for exam week — bugfix only.

### Fri 18 Apr
- **Work:** Light regression: signup → onboarding path, message file upload, leaderboard with zero friends.
- **Problems:** Empty leaderboard copy improved.
- **Decisions:** —
- **Next:** See Sat 19 Apr.

### Sat 19 Apr (today)
- **Work:** Reconstructed this dev log; quick sanity review of `App.js` shell (welcome, help, presence).
- **Problems:** Lost original notebook — this file is **reconstruction**, not original daily entries.
- **Decisions:** Keep maintaining this file going forward; even one line on slow days helps.
- **Next:** If continuing: real JWT refresh, gitignore `server/data` + `uploads`, optional SQLite migration; host transfer for Study Together; mobile pass; automated tests (currently minimal CRA default only).

---

## Backlog (unordered)

- Replace hand-rolled token with `jsonwebtoken` + expiry + refresh.
- Postgres/SQLite when JSON feels tight (concurrent writes, backups).
- Study Together: host migration when host leaves; stronger OT/CRDT for blackboard if collaboration grows.
- E2E tests (Playwright) for auth + one study session flow.
- Env-based `REACT_APP_API_URL` for deployment.
- Rate limiting on AI and upload routes.

---

## How to use this file

- **Planning:** Pick items from latest “Next” + backlog; estimate from past velocity (this log shows features often took multi-day chunks, not single evenings).
- **Reflection:** Early focus on persistence + one feature at a time paid off; realtime came after CRUD stable; AI last after context pipeline clear.
- **Reports:** Cross-reference `README.md`, `public/USER_GUIDE.md`, and server routes in `server/index.js` for accurate feature naming.

*Last updated: 2026-04-19*
