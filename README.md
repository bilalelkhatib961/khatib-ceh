# KHATIB CEH — Personal Ethical Hacking Training System

KHATIB CEH is a local web app for CEH v13 revision. It is built from your own quiz and mock-exam screenshots. It runs entirely on your PC, with no server, accounts or cloud.

## Run it

1. Install [Node.js](https://nodejs.org) 18 or newer (already installed on this machine).
2. Double-click **`start.bat`**, or run the following in this folder:
   ```powershell
   npm install     # first time only
   npm run dev     # opens http://localhost:5173
   ```
3. Use **Chrome or Edge**. They are needed to save attempt files to disk.

Stop the app with `Ctrl+C` in its terminal window.

## Online version (any device)

**https://khatib-ceh.vercel.app**: sign in with your Supabase account on a phone, tablet, laptop or desktop.

- **What syncs:** attempts, settings, bookmarks, mock-answer verifications and any unfinished exam, all stored in your private Supabase project. You can start a mock on one device and finish it on another; the deadline is shared.
- **Offline:** each result is saved on the device first and uploaded when you're back online. The sidebar shows *Cloud synced*, *Upload pending* or *Offline*.
- **Question bank:** lives only in your Supabase database (`bank_files`) and is never part of the Vercel upload (see `.vercelignore`). Each device downloads it once, then reuses its cached copy until the bank version changes.
- **Local mode:** with `.env.local` present, `npm run dev` also uses the cloud and asks you to sign in. Rename `.env.local` to run the fully local version.

**Updating the bank** (for example after re-extraction):
```powershell
npm run build-data
node scripts/upload-bank.mjs
```

**Redeploying after code changes:**
```powershell
npx vercel@66.1.0 deploy --prod
```

The database setup is in `supabase/schema.sql`. Row-level security limits every table to signed-in users, and new sign-ups are disabled in Supabase Auth, so your account is the only one.

**Tests:**
- `node tests/cloud.mjs <url>`: signs in twice as a "laptop" and a "phone" (set the `KHATIB_EMAIL` / `KHATIB_PASSWORD` environment variables first) and checks that sync works between them.
- `node tests/mobile.mjs <url>`: checks every page at iPhone 18 Pro size (402 × 874, portrait and landscape) for sideways overflow and for form fields small enough to make iOS Safari zoom in. Set `CHROME_PATH` to use a browser other than Chrome or Edge.

## Connect the JSON storage folder (do this once)

Completed assessments are saved as individual JSON files. To set this up:

1. Click **“Data folder not connected”** at the bottom of the sidebar, or go to **Settings → Connect user-data folder**.
2. Select the **`user-data`** folder inside this project and allow **edit** access.
3. The app then creates or uses these files:
   ```text
   user-data/
   ├── attempts/mock-exams/        mock-exam_2026-11-19_093000_ab12cd34.json
   ├── attempts/chapter-quizzes/   chapter-12_2026-11-19_150230_….json
   ├── attempts/objective-quizzes/ chapter-12_objective-3_….json
   ├── attempts/custom-practice/   custom-mistakes_….json
   ├── active-sessions/current-session.json   (unfinished exam, for recovery)
   ├── settings.json, bookmarks.json, progress.json, question-overrides.json
   ```

- Each completed attempt is a new file, and existing files are never overwritten.
- Before the folder is connected, or if permission lapses, results are kept in the browser (IndexedDB). The sidebar then shows **“Synchronization pending (n)”**, and the pending results are written to disk automatically once you reconnect.
- On later launches the browser may ask you to **grant permission** again with one click.
- **Settings → Export / Import JSON** backs up and restores everything by hand.

## What's inside

| Area | What it does |
|---|---|
| Dashboard | Original CEH statistics shown separately from KHATIB CEH practice statistics, plus charts, weakest areas and recommended next sessions |
| Chapters → Objectives | Accuracy per chapter and objective. Each objective has **Correct / Incorrect / All** tabs; the Incorrect and All tabs hide answers until you click **Reveal Answer** |
| Exam Center | **Mock exam** (125 questions, 4 h): the only timed assessment. **Chapter quiz** (every verified question in the chapter), **objective quiz** (every verified question in the objective), and the practice modes Mistakes, Bookmarks, Weak chapters, Weak objectives, Unpracticed and Custom have no timer |
| Exam runner | One question at a time, with a navigator, mark-for-review, clear answer, progress that survives refresh or close, and keyboard shortcuts (1–7 / A–G, ←/→, M, X). The mock exam's 4 h countdown keeps running across refresh or close and auto-submits at zero |
| Results / History | Score breakdowns, answer review, retry incorrect, retake, trends, filters and JSON export |
| Weakness Radar | Learning states with transparent rules, a prioritized study queue, regression detection and inferred topic tags |
| Settings | Exam date, target score, option shuffling, storage folder, the extraction report and the **manual review queue** |

Graded tests use only questions with a verified correct answer. If a mode has fewer questions than requested, the app tells you before starting and uses all available questions without duplicating any.

## Question bank and extraction

The data lives in `public/data/`: `chapters.json`, `learning-objectives.json`, `questions.json`, `original-attempts.json` and `extraction-report.json`.

The extraction pipeline lives in `extraction/` and reads `D:\CEH\CEH Quizzes And Mocks` **read-only**. It never touches `D:\CEH\Tools`. Its steps are:

1. **Inventory** (`scripts/inventory.py`). Discovers chapters and objectives from folder names and sorts them numerically. Folders named “wrong answers” and “incorrect answers” are treated as the same.
2. **OCR**. Windows OCR word boxes are stored in `extraction/ocr/assessment-layout.jsonl`. This file was reused from earlier work; `scripts/ocr.ps1` regenerates it, and you must run it before extracting any new screenshots.
3. **Extract** (`scripts/extract.py`). Detects radio buttons from pixels, reads my selection from each radio's fill, and reads correct/incorrect from option text colour (green or red on feedback screens). Progress is saved to `extraction/checkpoints/extract-v6.jsonl`.
4. **Visual review**. Screenshots that OCR could not parse (arrow sequences, short flags, scrolled pages) were transcribed by eye into `extraction/manual-corrections.json`.
5. **Build** (`scripts/build_bank.py`). Applies the corrections, deduplicates questions, preserves every original attempt, repairs common OCR splits, and writes the data files plus `extraction/unresolved-questions.json`.

How each correct answer was established is recorded in its `answerBasis` field:

- `feedback`: the option shown in green on a feedback screen.
- `folder-correct`: the single selected option in a “correct answers” screenshot.
- `manual-visual`: confirmed or transcribed by visual review.
- `user-verified`: set by you in the review queue.

Mock-exam screenshots never show the answer, so those questions stay **unresolved** until you verify them.

### Resume or redo extraction

```powershell
python extraction/scripts/inventory.py                          # re-scan the screenshot folders
powershell -File extraction/scripts/ocr.ps1 -Kind assessment   # OCR only screenshots that are new (resumes automatically)
python extraction/scripts/extract.py                            # resumes from the checkpoint; only new or changed screenshots are processed
npm run build-data                                              # rebuild the JSON bank and reports/initial-study-report.md
```

Each step is safe to interrupt and re-run. To force a full re-extraction, delete `extraction/checkpoints/extract-v6.jsonl`.

## Reports

- `reports/initial-study-report.md`: your weakest chapters and objectives, revision priorities, and a 3-day plan.
- `extraction/extraction-report.json`: screenshot counts, failures, and per-chapter and per-objective totals.
- `extraction/unresolved-questions.json`: the review queue, also available in the app under Settings.

## Test

With the dev server running, `npm run test:e2e` runs a headless Edge/Chrome walkthrough. It covers navigation, hidden and revealed answers, an exam with a page reload part-way through, submission, results and history.
