# Job Tracker — Automated Job Search & Application Board

A self-hosted tool that pulls live job postings from public job APIs, scores each
one against your resume, and lets you track applications through a kanban-style
board (Saved → Applied → Interview → Offer → Rejected).

Built with **Node.js, Express, MongoDB (Mongoose), and a dependency-free vanilla
JS dashboard** — no frontend build step required.

## Features

- **Ingestion**: pulls postings from [Arbeitnow](https://www.arbeitnow.com/api/job-board-api)
  and [RemoteOK](https://remoteok.com/api) (both free, no API key needed), filtered
  by keywords you configure.
- **Dedup**: postings are upserted by a stable `sourceId`, so re-fetching never
  creates duplicates.
- **Resume matching**: paste text or upload a PDF; every job gets a 0–100 match
  score using **local semantic embeddings** (`all-MiniLM-L6-v2` via
  `@xenova/transformers` — no API key, no cost) blended with a curated
  tech-skill keyword overlap, with an automatic fallback to TF-cosine if the
  embedding model can't be loaded.
- **Tracking board**: move jobs between statuses, add notes, and everything
  persists in MongoDB.
- **Scheduled auto-fetch**: a cron job (configurable) re-fetches postings and
  rescoring runs automatically.

## Project structure

```
job-tracker/
├── server.js              # Express app entrypoint
├── config/db.js           # MongoDB connection
├── models/
│   ├── Job.js               # posting + tracking fields
│   ├── Resume.js            # a saved resume (name, text, cached embedding)
│   └── Settings.js          # tracks which resume is currently active
├── services/
│   ├── jobFetcher.js        # pulls + normalizes + upserts postings
│   ├── matcher.js           # resume <-> job description scoring
│   ├── embeddings.js        # local sentence-embedding model (all-MiniLM-L6-v2)
│   └── activeResume.js      # reads/sets which resume is currently active
├── routes/
│   ├── jobs.js               # list/filter, fetch trigger, status updates
│   └── resumes.js            # list/add/activate/delete resumes, triggers rescoring
├── scripts/fetchOnce.js     # run one ingestion pass from the CLI
└── public/                  # dashboard (index.html, style.css, app.js)
```

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Get MongoDB running** — either:
   - Local: install MongoDB Community Server and run `mongod`, or
   - Free cloud option: create a free cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

3. **Configure environment**
   ```bash
   cp .env.example .env
   # edit .env: set MONGO_URI, JOB_KEYWORDS, JOB_LOCATIONS to taste
   ```

4. **Run it**
   ```bash
   npm start          # production
   npm run dev        # auto-restart on changes (needs nodemon, already in devDependencies)
   ```

5. Open **http://localhost:4000** — click **"Resume"** to paste/upload your
   resume, then **"Fetch new jobs"** to pull postings and see match scores.

## How the matching algorithm works

Scoring blends two signals (`services/matcher.js`):

- **Semantic similarity (70% weight)** — cosine similarity between sentence
  embeddings from `all-MiniLM-L6-v2`, generated **locally** via
  [`@xenova/transformers`](https://github.com/xenova/transformers.js) (no API
  key, no external calls after the ~25MB model is cached on first run). This
  is what lets "led a cross-functional engineering team" match "managed
  software engineers" even with zero shared keywords.
- **Skill-dictionary overlap (30% weight)** — exact, word-boundary matches
  against a curated list of ~70 recognizable tech/professional skills. Kept
  alongside embeddings because it's precise and gives an interpretable "why
  did this score well" keyword list, which pure embeddings can't provide.

**Caching strategy** (`services/embeddings.js` + `services/jobFetcher.js`):
each job's embedding is computed once, when it's first fetched, and stored on
the document. Your resume's embedding is computed once, whenever you update
it. Re-scoring the whole job history after a resume change is therefore just
vector math on already-computed embeddings — no repeated model inference,
so it stays fast even with thousands of stored jobs.

**Graceful fallback**: if the embedding model can't be loaded (no internet on
first run, or a slow/blocked connection to Hugging Face), `matchScore` is
computed instead with the original TF-based cosine similarity, and jobs are
tagged `matchMethod: "keywords"` so you can see in the UI which method scored
each posting. Nothing breaks — it just degrades to the simpler heuristic.

The dashboard shows a small tooltip on each match-score pill indicating which
method produced it.

## Managing multiple resumes

Click **"Resumes"** in the top bar to open the resume manager. You can:

- **Add** a resume (paste text or upload a PDF, with a name like "Backend
  resume" or "Frontend resume")
- **Activate** any saved resume — every stored job is instantly re-scored
  against it (fast, since job embeddings are cached; only the resume needs
  re-embedding when it's first added)
- **Delete** a resume you no longer need

Only one resume is "active" at a time (used for scoring), but nothing stops
you from keeping several around and switching depending on which kind of role
you're currently focused on.

## Ideas to extend this into a bigger project

These are natural "v2" features if you want to go further for a resume/portfolio
project:

- **Even richer matching**: try a larger embedding model (e.g.
  `Xenova/bge-base-en-v1.5`) for better accuracy at the cost of a slower first
  load, or call an LLM to explain in plain English *why* a job is a good fit.
- **More sources**: add scraping for specific company career pages (many run on
  Greenhouse/Lever, which expose JSON endpoints), or LinkedIn/Indeed via a
  paid scraping API (careful with ToS on direct scraping).
- **Notifications**: a Telegram bot or email digest ("3 new 80%+ matches today").
- **Auto-fill**: use Playwright to pre-fill application forms from a saved
  profile (biggest engineering lift, biggest wow-factor).
- **Resume tailoring**: generate a tailored resume bullet list per job using an
  LLM, based on the job description's language.
- **Analytics dashboard**: response rate by source, average time in each
  status, which keywords correlate with interviews.
- **Auth**: if you want to host this for more than yourself, add user accounts
  (each with their own resume + board).
- **Deploy**: containerize with Docker, deploy on Render/Railway/Fly.io with
  MongoDB Atlas as the database — gives you a live demo link for your resume.

## Notes on job data sources

Arbeitnow and RemoteOK are used because they're free, require no API key, and
have no restrictive scraping ToS — good for a student/portfolio project.
Avoid directly scraping LinkedIn/Indeed, which explicitly prohibit it in their
terms of service; if you need broader coverage, look at paid, ToS-compliant
providers (e.g. Adzuna's API, which has a generous free tier).
