# Viva & interview preparation

Questions examiners and interviewers actually ask, with answers grounded in **our**
code. Read `docs/LEARN.md` first.

**Golden rule:** never bluff. "I haven't implemented that, but here's how I would"
scores far better than a confident wrong answer. Examiners are testing whether you
understand your own project, not whether you memorised a textbook.

---

## A. Opening questions

### "Explain your project in two minutes."

> HireSmart AI is an AI-powered applicant tracking system with a resume analyzer.
>
> It solves a two-sided problem. Candidates apply to dozens of jobs and get silence,
> never learning why they were rejected. Recruiters get hundreds of resumes and read
> them in arrival order, so the best candidate might be number 187.
>
> The system scores any resume against any job from 0 to 100 using four weighted
> components — skill match at 55%, semantic content similarity at 25% using TF-IDF and
> cosine similarity, experience at 15%, and education at 5%. Recruiters see applicants
> automatically ranked; candidates see which jobs fit them and exactly which skills
> they're missing.
>
> The key design principle is that **every score is explainable**. We never show a bare
> number — we always show the four components, the matched and missing skills, and
> plain-English reasons. That's what makes it trustworthy enough to actually use in
> hiring.
>
> It's built on the MERN stack: MongoDB, Express, React and Node, with JWT
> authentication, role-based access control for three roles, and 40 automated tests.

### "What is the most technically interesting part?"

Go straight to the matching engine and the false-positive bug (section C below).
That single story demonstrates testing, debugging, root-cause analysis and regression
prevention — far more than listing features.

### "Which part are you personally responsible for?"

Answer honestly. If you worked in a team, name your modules. If asked about code you
did not write, say "that was handled by X, but here's how it works" and then explain
it — showing you understand the whole system is the point.

---

## B. The AI (expect the most questions here)

### "Is this real AI or just keyword matching?"

> It's classical machine learning and information retrieval, not a large language
> model — and that's a deliberate choice.
>
> The core is TF-IDF vectorisation with cosine similarity, which is the same family of
> techniques search engines were built on. On top of that we have a weighted scoring
> model with normalisation.
>
> I chose this over calling an LLM API for four reasons. It's **deterministic** — the
> same resume always gets the same score, which matters legally in hiring. It's
> **explainable** — I can show exactly which component contributed what, whereas an LLM
> is a black box. It's **free and offline** — no API key, no quota, no network
> dependency. And it's **fast** — scoring 200 candidates takes milliseconds.
>
> The architecture does support adding an LLM layer for narrative feedback on top,
> with this engine as the deterministic fallback.

### "Explain TF-IDF."

> TF-IDF weights how important a word is to a document.
>
> **TF, term frequency**, is how often a word appears in this document. **IDF, inverse
> document frequency**, is how rare that word is across all documents — calculated as
> the log of total documents divided by documents containing the word.
>
> Multiply them and you get the intuition: a word that appears often *here* but rarely
> *elsewhere* is highly informative. So in a resume, "kubernetes" gets a high weight
> while "experience" gets almost none, because "experience" appears in every document.
>
> Without IDF, a job description full of filler words like "team", "role" and
> "responsibilities" would dominate the similarity calculation and every candidate
> would look the same.

**If pushed on the formula:**

```js
const tf = count / total;
const idf = Math.log((1 + documentCount) / (1 + documentFrequency.get(token))) + 1;
weight = tf * idf;
```

> The `+1` terms are smoothing — they prevent division by zero when a word appears in
> no other document, and keep IDF positive.

### "Why cosine similarity and not just count matching words?"

> Because document length would dominate. A five-page resume shares more raw words with
> any job description than a sharp one-page resume does, so counting overlap rewards
> padding.
>
> Cosine similarity measures the **angle** between two vectors, not their magnitude.
> It answers "are these documents *about* the same thing?" rather than "how much text
> do they share?". A concise, perfectly-targeted resume can score 1.0.

### "Why those specific weights — 55, 25, 15, 5?"

Be honest here; examiners respect it.

> They're informed judgements, not learned from data — and I'd flag that as the main
> limitation.
>
> The reasoning: skills carry the most weight because a job's skill list is the most
> explicit, unambiguous statement of what's required. Semantic similarity is second
> because it catches relevant experience the skill list never mentioned. Experience is
> third — important but often a soft requirement. Education is lowest because in
> software it's the weakest predictor of ability.
>
> To do this properly I'd need a labelled dataset of resumes with real hiring outcomes,
> then fit the weights with logistic regression. That's the natural next step, and the
> code is structured for it — the weights are a single frozen constant, so swapping in
> learned values means changing four numbers.

### "What is that calibration ceiling?"

```js
const CALIBRATION_CEILING = 0.45;
score = Math.min(1, similarity / CALIBRATION_CEILING);
```

> When I tested with real resumes, even an excellent match only reached about 0.42
> cosine similarity. That's expected — a CV contains education history, project
> details and formatting that a job advert never has, so the vectors can never fully
> align.
>
> Reporting that raw would show "42% match" for a perfect candidate, which is
> misleading. So I calibrate: 0.45 and above maps to 100%. It's the same idea as
> grading on a curve, and the constant is named and commented so it's honest rather
> than a magic number.

### "Why doesn't your stemmer remove '-er'?"

This one impresses people because it shows domain awareness.

> A textbook Porter stemmer strips `-er`, which would turn **docker** into **dock** and
> destroy the skill. Same problem with several other technology names.
>
> In this domain, preserving technology names matters more than linguistic
> completeness, so I use a conservative stemmer that handles plurals and verb endings
> like `-ing` and `-ed` but leaves agent nouns alone. There's an explicit test
> documenting that decision so nobody "fixes" it later.

### "Walk me through a bug you found in the AI."

**This is your best story. Tell it in full.**

> While testing the resume analyzer against a real resume, the output listed the
> candidate's skills as javascript, **java**, **c**, **go**, **r**, react, node...
>
> Only javascript, react and node were actually in the resume. The problem was
> substring matching: `"javascript".includes("java")` is true, `"github"` contains
> `"git"`, and single letters like c, r and go appear inside ordinary English words.
> A candidate would be credited with four programming languages they never mentioned —
> which would corrupt every match score.
>
> The fix was a word-boundary regex, but only for the ambiguous short names, because
> applying it everywhere would break skills containing punctuation. I also had to
> escape regex metacharacters so `c++` and `c#` still work.
>
> Then I wrote two regression tests: one asserting the false positives are gone,
> and one asserting genuinely-mentioned languages *are* still detected — because it
> would be easy to over-correct and break the real case.

### "How do you handle a resume with no skills listed?"

> Two ways. First, skills are credited from the resume **text**, not just the declared
> profile list — candidates constantly forget to tick a skill their projects clearly
> demonstrate.
>
> Second, when a component genuinely can't be measured, it's marked `applicable: false`
> and excluded, then the remaining weights are re-normalised. Without that, a job with
> no stated experience requirement would cap every candidate at 85%, because the 15%
> experience component could never be earned. The UI shows "not enough data" for that
> component rather than a misleading zero.

---

## C. Backend

### "Explain middleware."

> Middleware is a function that runs between the request arriving and the controller
> handling it. It gets `(req, res, next)` and either responds itself or calls `next()`
> to pass control on.
>
> The analogy is airport security: check-in, passport, scanner, gate. Each station can
> wave you through or stop you.
>
> In our routes it reads like English:
> `router.post("/", protect, authorize("recruiter"), createJob)` — are you logged in,
> are you a recruiter, then do the work.
>
> The benefit is that authentication is written once and reused on 30 routes, instead
> of being copy-pasted into every controller where one of them would eventually be
> forgotten.

### "How does JWT authentication work?"

> On login we verify the password with bcrypt, then create a token containing the user
> id and role, signed with a secret key only the server knows. The browser stores it
> and sends it in the `Authorization: Bearer` header on every request.
>
> On each protected request, `jwt.verify()` checks the signature. If anyone modified
> the payload — say changing `role: "candidate"` to `role: "admin"` — the signature no
> longer matches and verification throws.
>
> One thing worth being clear about: a JWT is **signed, not encrypted**. Anyone can
> base64-decode it and read the contents. So we only store the id and role, never
> anything sensitive.
>
> We also re-load the user from the database on every request rather than trusting the
> token blindly, because the account might have been deactivated since the token was
> issued.

### "Why JWT instead of sessions?"

> Sessions store state on the server, which means either sticky sessions or a shared
> store like Redis once you scale to multiple servers. JWTs are stateless — any server
> can verify any token with just the secret.
>
> The trade-off is honest: you can't easily revoke a JWT before it expires. Our
> mitigation is loading the user on each request and checking `isActive`, so a
> deactivated account is rejected immediately even with a valid token. For full
> revocation you'd add short-lived access tokens plus refresh tokens.

### "What is NoSQL injection? Show me."

> If a login endpoint passes user input straight into a query, an attacker sends this
> as the body:
>
> ```json
> { "email": { "$gt": "" }, "password": { "$gt": "" } }
> ```
>
> `$gt` is MongoDB's "greater than" operator. `{ email: { $gt: "" } }` matches *any*
> email, so the attacker logs in as the first user in the database without knowing a
> password.
>
> We defend with `express-mongo-sanitize`, which strips keys beginning with `$` or
> containing `.` from every body, query and params object before any handler sees them.

### "Why hash passwords? Why bcrypt specifically?"

> Hashing is one-way — you can compute the hash from a password but not the password
> from the hash. So if the database is stolen, the passwords aren't. To check a login
> we hash the attempt and compare hashes.
>
> bcrypt specifically because it's **deliberately slow** and has a tunable cost factor.
> A fast hash like MD5 or SHA-256 can be brute-forced at billions of guesses per second
> on a GPU. bcrypt with a cost factor caps that at thousands, which makes large-scale
> cracking impractical. It also salts automatically, so two users with the same
> password get different hashes.

### "Why separate services from controllers?"

> Single responsibility, and testability.
>
> Controllers handle HTTP: read the request, check permissions, send a response.
> Services hold logic that doesn't care about HTTP.
>
> The concrete payoff is our AI engine. Because `resumeMatchingService.js` is a pure
> function with no database and no Express, I can test it with a plain function call in
> a millisecond. If it lived inside a controller, testing it would require booting a
> server, a database, and constructing fake request objects.
>
> It's also reusable — the same scoring function powers candidate recommendations,
> recruiter ranking and single-application matching.

### "What are database indexes and where did you use them?"

> An index is a sorted lookup structure, like the index at the back of a textbook.
> Without one, finding all published jobs means MongoDB scanning every document — a
> collection scan.
>
> We index by query pattern. For example `{ status: 1, createdAt: -1 }` on jobs,
> because the public job board always filters by published status and sorts by newest
> first. A compound index serving both in one lookup.
>
> We also have a unique compound index on `{ job, candidate }` in applications, which
> makes duplicate applications **impossible at the database level** — not just
> prevented by application logic that could have a race condition.

### "How do you handle errors?"

> Three layers. `AppError` is a custom class carrying a status code, so a controller
> can just `throw new AppError("Job not found", 404)`.
>
> `asyncHandler` wraps async controllers, because Express 4 doesn't catch promise
> rejections — forget one try/catch and the request hangs forever with no response.
>
> Then a global error handler formats everything consistently. One detail there
> matters: for 5xx errors we deliberately replace the message with a generic
> "Internal Server Error", because raw database errors can leak your schema or file
> paths. The real stack trace goes to the Winston log file instead.

---

## D. Frontend

### "What is React state, and when does a component re-render?"

> State is data that changes over time and drives the UI. You declare it with
> `useState`, which returns the value and a setter.
>
> A component re-renders when its state changes, when its props change, or when its
> parent re-renders. The critical rule is that you must use the setter — assigning
> directly does nothing, because React has no way to know it should update.

### "Why put job filters in the URL instead of state?"

> Three concrete benefits. The browser back button works properly. Refreshing the page
> keeps your filters. And a filtered search can be copied and shared as a link.
>
> With `useState` alone, all three break — you'd filter to "React jobs in Pune", hit
> back, and land somewhere unrelated with your filters silently gone.

### "How do you prevent race conditions when searching?"

> Two mechanisms. Debouncing waits until the user stops typing, so we send one request
> instead of one per keystroke.
>
> But debouncing alone isn't enough — requests can still overlap and return out of
> order. If the request for "r" is slowest, it lands *after* the request for "rea" and
> overwrites the correct results with stale ones.
>
> So `useFetch` tags each request with an incrementing id and ignores any response
> whose id isn't the current one. Only the newest request is allowed to write state.

### "What is prop drilling and how do you avoid it?"

> Prop drilling is passing data through many component layers that don't use it, just
> to reach a deep child. It's fragile — adding a field means touching every layer.
>
> We use React Context for genuinely global state, which for us is just the
> authenticated user. Any component calls `useAuth()` and gets it directly.
>
> I'd add that Context isn't a universal answer — every consumer re-renders when the
> value changes, so it suits rarely-changing global data like the current user, not
> high-frequency state.

### "Explain lazy loading."

> `React.lazy` with dynamic `import()` splits each page into its own JavaScript file,
> downloaded only when that route is visited.
>
> You can see the effect in our build output: the analytics page pulls in the charting
> library at 371 kB, but a candidate who never opens analytics never downloads it. The
> initial bundle stays small, so the app loads fast on a slow connection.

### "Your route guards — can a user bypass them?"

**Answer this one carefully; it's a trap for the overconfident.**

> Yes, trivially — and that's fine, because they were never a security boundary.
>
> Route guards are a **user-experience** feature. Anyone can open dev tools and modify
> the JavaScript running in their own browser. The guards just avoid showing people
> screens that would fail anyway.
>
> The real enforcement is server-side: `protect` and `authorize` on every route, plus
> ownership checks so a recruiter can only see applicants for jobs they actually own.
> If someone forces their way to `/admin` in the browser, every API call that page
> makes returns 403 and they see nothing.

---

## E. Testing and quality

### "What did you test and why?"

> 40 tests in about six seconds, split two ways.
>
> Unit tests cover the AI engine — pure functions, no database, so they're
> instantaneous. Integration tests cover auth, jobs and resume upload by making real
> HTTP requests through Express against an in-memory MongoDB.
>
> I prioritised the AI because it's the most complex logic and the easiest to break
> silently. A broken button is obvious; a subtly wrong score is not.

### "Show me a well-designed test."

```js
test("a genuinely matching resume scores far higher than an unrelated one", () => {
    const strong = calculateResumeJobMatch({ resumeText: STRONG_RESUME, ... });
    const weak   = calculateResumeJobMatch({ resumeText: WEAK_RESUME, ... });

    assert.ok(strong.matchScore >= 70);
    assert.ok(weak.matchScore <= 30);
    assert.ok(strong.matchScore - weak.matchScore > 40, "the gap should be decisive");
});
```

> The important part is that it asserts a **relationship**, not an exact number.
> Asserting `=== 87` would break every time I tuned a weight, and I'd learn nothing.
> Asserting "a full-stack developer beats a graphic designer for a MERN role,
> decisively" tests the property that actually matters.

### "What is that safety guard in your test setup?"

> Tests wipe the database between cases. If someone's `.env` accidentally pointed the
> test suite at the production Atlas cluster, that would delete everything.
>
> So before clearing, we check the host and database name and throw if it looks like
> production. It's defensive code for a mistake that would be unrecoverable.

---

## F. Design and architecture

### "Why MongoDB over MySQL?"

> The data has genuinely variable shape. One job lists 3 skills, another lists 30. One
> candidate has 5 projects with nested technology arrays, another has none. In SQL
> that's several join tables and a lot of ceremony; in MongoDB it's one natural
> document.
>
> I'd be honest about the trade-off though: MongoDB has weaker guarantees for
> multi-document transactions. If this were a banking system I'd use PostgreSQL without
> hesitating. For a document-shaped, read-heavy workload like job postings and resumes,
> the flexibility wins.

### "How would this scale to a million users?"

Don't over-claim. Show you understand the bottlenecks.

> The application layer is already stateless thanks to JWT, so I'd run several Node
> instances behind a load balancer.
>
> The real bottleneck is the matching engine — currently we score jobs on demand and
> cap the working set at 200 jobs per request. At scale I'd precompute and cache
> resume vectors instead of recomputing TF-IDF every time, move scoring to a background
> job queue, and store results.
>
> Beyond that: MongoDB replica sets for read scaling, Redis for caching hot job lists,
> and S3 for resume storage — which the storage service already supports behind a
> provider flag.

### "What are the limitations of your system?"

Listing your own weaknesses is a strength.

> Four honest ones.
>
> **The weights aren't learned.** They're informed judgement, not fitted to hiring
> outcomes. Proper approach is a labelled dataset and logistic regression.
>
> **No semantic understanding of unlisted synonyms.** The synonym table is manual, so
> "cloud infrastructure" and "AWS" only match if I've mapped them. Word embeddings
> would solve this properly.
>
> **Text extraction fails on scanned resumes.** A PDF that's really an image yields no
> text. We detect that and tell the user, but OCR would be better.
>
> **Potential for bias.** Any system trained on or tuned against historical hiring
> data can encode historical bias. We mitigate by scoring only skills and experience —
> never name, gender, age or institution — and by making every score explainable so a
> human can challenge it. But it should be audited before real-world use.

### "What would you do differently if you started again?"

> Write the tests first. I fixed several bugs that tests would have caught immediately
> — the case-sensitive import, the JWT config, the skill false positives.
>
> I'd also use TypeScript. Several bugs were shape mismatches between what the API
> returned and what the component expected, which TypeScript catches at compile time.

---

## G. Rapid-fire

| Question | Answer |
|---|---|
| **`PUT` vs `PATCH`?** | PUT replaces the whole resource; PATCH updates specific fields. We use PATCH for the single-field status toggle. |
| **What does 401 vs 403 mean?** | 401 = not authenticated (who are you?). 403 = authenticated but not allowed (I know who you are; no). |
| **What is CORS?** | Browsers block cross-origin requests by default. The server must explicitly allow the frontend's origin. In dev we sidestep it with Vite's proxy so requests are same-origin. |
| **What is `.env` for?** | Secrets and per-environment config, kept out of Git. `.env.example` is the committed template. |
| **Why `select: false` on password?** | So queries never return the hash by accident. You must explicitly `.select("+password")` to get it. |
| **What is `populate()`?** | Mongoose replaces a stored ObjectId reference with the actual document — like a SQL join. |
| **Why an index on `{job, candidate}`?** | Unique compound index makes duplicate applications impossible at the database level, not just in application logic. |
| **What is a pure function?** | Same input always gives the same output, with no side effects. Our AI engine is pure, which is why it's trivially testable. |
| **What does `useEffect` do?** | Runs side effects after render — fetching data, subscriptions, timers. Return a cleanup function to undo them. |
| **What is the virtual DOM?** | React keeps a lightweight copy of the UI, diffs it after a state change, and updates only the DOM nodes that actually changed. |
| **What is debouncing?** | Delay running a function until input stops. We use 400 ms on search so one request fires instead of one per keystroke. |
| **HTTP status you return on validation failure?** | 400 Bad Request, with a specific message naming the field. |
| **How do you prevent double submissions?** | The Button component disables itself while `isLoading` is true. |
| **What is rate limiting for?** | Stops brute-force password guessing and API abuse. 300 requests per IP per 15 minutes in production. |

---

## H. Live demo checklist

Practise until it's smooth. Have it **already running** before you walk in.

- [ ] MongoDB running, `npm run seed` done fresh
- [ ] Backend on :5000, frontend on :5173, both in visible terminals
- [ ] Browser open on the landing page, zoom at ~110% so it's readable from a distance
- [ ] `npm test` run once beforehand so you can show 40/40 passing
- [ ] Have `resumeMatchingService.js` open in your editor in a second tab

**The seven-minute run:**

1. Landing → "Check my resume free" → sample → **Analyse** (30s, no login — strong opener)
2. Point at the grade, extracted contact info, and the *prioritised* fixes
3. Sign in as Candidate → "For You" → note scores 90 / 65 / 52 and the reasons
4. Open a job → "Check my fit with AI" → the four-component breakdown
5. Sign out → Recruiter → My Jobs → applicants → ranked list
6. Click **"Why this score?"** — this is your money shot, explain the weights
7. Analytics → funnel and conversion rate
8. Switch to the terminal → `npm test` → 40 passing

**If something breaks live:** stay calm, say "let me show you the test suite proving
this works" and run `npm test`. Composure under failure reads as senior.

---

## I. Questions to ask them

Interviewers always leave time for this, and having none looks incurious.

- "How does your team handle explainability in ML features?"
- "What does your code review process look like?"
- "Do you write tests before or after the implementation?"
- "What would my first three months look like?"
