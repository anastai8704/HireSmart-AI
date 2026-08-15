# Putting HireSmart AI on your resume and LinkedIn

Copy-paste ready wording, plus the reasoning behind it so you can adapt it.

---

## The rule that governs everything below

**Every bullet point must contain a number or a specific technology.**

> ❌ "Worked on an AI-powered job portal using MERN stack"
> ✅ "Built an explainable resume-matching engine (TF-IDF + cosine similarity) scoring
>    candidates across 4 weighted components, covered by 40 automated tests"

The first tells a recruiter nothing. The second tells them you understand information
retrieval, that you designed a model rather than copied one, and that you test your
work. Same project, completely different signal.

---

## 1. The resume entry

### Full version (use when you have space)

> **HireSmart AI — AI-Powered Applicant Tracking System & Resume Analyzer**
> *MCA Semester 3 Project · React, Node.js, Express, MongoDB, Tailwind CSS*
> [github.com/anastai8704/HireSmart-AI](https://github.com/anastai8704/HireSmart-AI)
>
> - Built an **explainable resume-to-job matching engine** using TF-IDF vectorisation
>   and cosine similarity, scoring candidates across 4 weighted components (skills 55%,
>   semantic relevance 25%, experience 15%, education 5%) with per-component breakdowns
>   instead of an opaque single score.
> - Developed an **ATS resume analyzer** that grades resumes across 6 weighted checks —
>   contact parsing, section detection, skill extraction, quantified-achievement
>   detection and writing quality — returning a letter grade and prioritised, actionable
>   fixes.
> - Implemented **JWT authentication with role-based access control** for 3 roles
>   (candidate, recruiter, admin), plus bcrypt hashing, NoSQL-injection sanitisation,
>   rate limiting and authenticated-only private file storage.
> - Designed a **REST API of 40+ endpoints** across 5 modules with a layered
>   architecture (routes → middleware → controllers → services → models), keeping the
>   scoring engine pure and dependency-free so it unit-tests in milliseconds.
> - Wrote **40 automated tests** (unit + integration with an in-memory MongoDB); caught
>   and fixed a substring-matching defect that falsely credited candidates with
>   unlisted programming languages, corrupting every match score.
> - Built a **responsive React SPA** with route-based code splitting, URL-driven
>   filter state, debounced search with race-condition guards, and a reusable
>   accessible design system.

### Compact version (single-page resume)

> **HireSmart AI — AI Applicant Tracking System** · React, Node.js, Express, MongoDB
> - Built an explainable resume-matching engine (TF-IDF + cosine similarity) scoring
>   candidates on 4 weighted components with full breakdowns, not an opaque number.
> - Developed an ATS resume analyzer producing a graded report with prioritised,
>   actionable improvements across 6 weighted checks.
> - Secured a 40+ endpoint REST API with JWT auth, role-based access control for 3
>   roles, bcrypt, input sanitisation and rate limiting; 40 automated tests passing.

### Two-line version (when you have many projects)

> **HireSmart AI** — AI applicant tracking system (MERN). Explainable resume-to-job
> matching via TF-IDF and cosine similarity across 4 weighted components; ATS resume
> analyzer with actionable feedback. JWT + RBAC across 3 roles, 40+ REST endpoints,
> 40 automated tests. `github.com/anastai8704/HireSmart-AI`

---

## 2. Tailoring by role

Recruiters scan for keywords matching the job description. Lead with what they need.

### Applying for a full-stack role
Lead with architecture and breadth:
> "Designed a layered REST API (routes → middleware → controllers → services → models)
> with 40+ endpoints, and a React SPA with code splitting, protected routing and a
> reusable design system."

### Applying for a backend role
Lead with security, data modelling and testing:
> "Implemented JWT auth with RBAC across 3 roles, bcrypt hashing, NoSQL-injection
> sanitisation and rate limiting. Designed compound MongoDB indexes including a unique
> `{job, candidate}` index making duplicate applications impossible at the database
> level. 40 automated tests including integration tests against in-memory MongoDB."

### Applying for a frontend role
Lead with UX engineering:
> "Built a responsive React SPA with route-based code splitting, URL-driven filter
> state (shareable, back-button-safe), debounced search with race-condition handling,
> and an accessible component library with proper ARIA wiring and focus management."

### Applying for a data / ML role
Lead with the algorithm and its honest limits:
> "Implemented TF-IDF vectorisation with cosine similarity for resume-job semantic
> matching, including custom domain-aware tokenisation, conservative stemming that
> preserves technology names, synonym normalisation, and score calibration against
> observed real-world similarity distributions. Weights are currently hand-tuned;
> designed the model so they can be replaced with values fitted from labelled hiring
> outcomes."

---

## 3. LinkedIn

### Project section

> **HireSmart AI — AI-Powered Applicant Tracking System**
>
> An ATS and resume analyzer that solves both sides of the hiring problem: candidates
> who never learn why they were rejected, and recruiters buried under hundreds of
> resumes.
>
> The core is an explainable matching engine built with TF-IDF and cosine similarity.
> It scores any resume against any job across four weighted components and always shows
> the breakdown — because a hiring decision should never come from an unexplained
> number.
>
> Candidates get an ATS score with prioritised, actionable fixes and see which roles
> genuinely fit them before applying. Recruiters get applicants ranked automatically,
> with the reasoning attached.
>
> **Tech:** React · Node.js · Express · MongoDB · Tailwind CSS · JWT
> **Highlights:** 40+ REST endpoints · role-based access control for 3 roles ·
> 40 automated tests · explainable AI scoring

### Announcement post

> Just shipped **HireSmart AI** 🚀
>
> Over 90% of large employers filter resumes through software before a human ever reads
> them. Candidates get rejected and never learn why. Recruiters read 300 resumes in
> whatever order they arrived.
>
> So I built both halves.
>
> 🧠 An **explainable matching engine** — TF-IDF + cosine similarity scoring resumes
> against jobs across four weighted components. It never shows a bare number; it always
> shows *why*.
>
> 📄 An **ATS resume analyzer** that grades your resume and tells you exactly what to
> fix, ordered by impact.
>
> 📊 **Automatic applicant ranking** so recruiters open the strongest candidates first.
>
> The thing I'm proudest of isn't a feature — it's a bug I caught. My skill detector was
> crediting candidates with "java" whenever they wrote "javascript", and "git" whenever
> they linked GitHub. Four phantom languages on every resume, quietly corrupting every
> score. Found it by testing against real data, fixed it with word-boundary matching,
> and locked it down with regression tests.
>
> That's the lesson that stuck: **your code is only as trustworthy as the data you
> tested it against.**
>
> Built with React, Node.js, Express and MongoDB. 40 automated tests. Code below 👇
>
> \#MERN #React #NodeJS #MongoDB #WebDevelopment #AI

---

## 4. GitHub presentation

Your repo *is* your portfolio. Many recruiters open it before reading your resume.

**Do these five things:**

1. **README with a screenshot at the top.** A hiring manager gives you 15 seconds.
   Show, don't describe.
2. **Live demo link** if you deploy it. Render or Railway for the API, Vercel or
   Netlify for the frontend — both have free tiers.
3. **Add a CI badge.** `![Tests](https://github.com/USER/REPO/actions/workflows/test.yml/badge.svg)`
   is the cheapest professionalism signal available. See `docs/LEARN.md` §12 for the
   workflow file.
4. **Repository topics:** `react`, `nodejs`, `mongodb`, `express`, `ats`,
   `resume-parser`, `mern-stack`, `tfidf`. This is how people find you.
5. **Clean commit history.** Conventional commits (`feat:`, `fix:`, `docs:`) look
   deliberate; 30 commits saying "update" do not.

---

## 5. Turning this into interview answers

Recruiters ask behavioural questions. Use **STAR**: Situation, Task, Action, Result.
Here are three ready to go.

### "Tell me about a bug you found and fixed."

> **Situation:** I was testing my resume analyzer against real resumes rather than my
> own test fixtures.
>
> **Task:** The output listed skills the candidate never mentioned — java, c, go and r
> appeared on almost every resume.
>
> **Action:** I traced it to substring matching. `"javascript"` contains `"java"`,
> `"github"` contains `"git"`, and single letters appear inside ordinary words. Since
> skills drive 55% of the match score, this was corrupting every result. I fixed it
> with a word-boundary regex applied selectively to ambiguous short names, escaping
> metacharacters so `c++` and `c#` still worked, and wrote two regression tests — one
> proving the false positives were gone, one proving genuinely-mentioned languages were
> still found, because it would be easy to over-correct.
>
> **Result:** Skill extraction became accurate, and the tests mean nobody can silently
> reintroduce it. The bigger lesson was that my original fixtures were too clean — I
> now test against messy real data deliberately.

### "Tell me about a technical decision you made."

> **Situation:** I needed AI matching for the core feature and the obvious route was
> calling an LLM API.
>
> **Task:** Choose between an LLM and a classical information-retrieval approach.
>
> **Action:** I chose TF-IDF with cosine similarity and a weighted scoring model. My
> reasoning was four-fold: hiring decisions need to be **deterministic** and
> reproducible; they need to be **explainable**, and an LLM is a black box; the system
> should work **offline with no API key or quota**; and scoring 200 candidates needed
> to take milliseconds. I structured it so an LLM layer could be added later for
> narrative feedback, with this engine as the deterministic fallback.
>
> **Result:** Scoring is instant and free, and every score comes with a four-component
> breakdown. Users can see exactly why they got the number, which is the whole point in
> a hiring context.

### "Tell me about a time you had to learn something quickly."

Adapt honestly to your own experience — for example:

> **Situation:** I needed semantic text matching but had only used exact string
> comparison before.
>
> **Task:** Understand information retrieval well enough to implement it correctly, not
> just paste it.
>
> **Action:** I studied TF-IDF and cosine similarity, then implemented them from
> scratch rather than importing a library, specifically so I'd understand the maths.
> That paid off immediately — I discovered that real resume-to-job similarity peaks
> around 0.45, not 1.0, because a CV contains text a job ad never does. So I added a
> calibration step, named and documented, instead of shipping misleading scores.
>
> **Result:** I can explain every line of that engine, and I caught a calibration
> problem I'd have missed entirely if I'd just called a library function.

---

## 6. Honesty guardrails

You will be asked to explain anything you write. Protect yourself:

- ❌ Don't say "machine learning model" — you didn't train one. Say **"TF-IDF and
  cosine similarity"**, which is precise and still impressive.
- ❌ Don't say "used by X companies" if it isn't deployed.
- ❌ Don't claim sole authorship of a team project. Say **"I built the matching engine
  and backend API"** — specific ownership is more credible than vague credit.
- ✅ **Do** state the limitations if asked. "The weights are hand-tuned rather than
  learned from data; the next step is fitting them with logistic regression on labelled
  hiring outcomes" is a *stronger* answer than pretending otherwise. It shows you know
  what good looks like.

---

## 7. Before you send it anywhere

- [ ] GitHub repo is public and the README has a screenshot
- [ ] `npm install && npm run seed && npm run dev` works on a **fresh clone**
- [ ] `.env` is git-ignored and **no secrets are committed** (check the history!)
- [ ] Tests pass: `cd server && npm test` → 40/40
- [ ] Every claim on your resume is something you can explain for five minutes
- [ ] You've done the demo run in `docs/VIVA.md` §H at least twice
