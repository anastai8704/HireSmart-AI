# Learn HireSmart AI — from zero to production

This document teaches you **the whole project**, assuming you know almost nothing.
Read it top to bottom once, then keep it open while you explore the code.

Every section answers three questions:

1. **What** is this thing?
2. **Why** does it exist (what breaks without it)?
3. **How** is it done in *our* code, with the real file to open?

---

## Table of contents

1. [What we built and why](#1-what-we-built-and-why)
2. [The mental model: how a web app actually works](#2-the-mental-model)
3. [The tech stack, explained in plain English](#3-the-tech-stack)
4. [Project structure — what lives where](#4-project-structure)
5. [The backend, layer by layer](#5-the-backend-layer-by-layer)
6. [The AI engine — the real heart of the project](#6-the-ai-engine)
7. [The frontend, layer by layer](#7-the-frontend-layer-by-layer)
8. [Security: what we defend against](#8-security)
9. [Testing: how we know it works](#9-testing)
10. [Running it yourself](#10-running-it-yourself)
11. [Bugs we found and fixed (great viva material)](#11-bugs-we-found-and-fixed)
12. [What to build next](#12-what-to-build-next)

---

## 1. What we built and why

### The problem

When you apply for a job online, a human usually does **not** read your resume first.
A piece of software called an **ATS (Applicant Tracking System)** reads it, scores it,
and only the top-scoring resumes reach a recruiter.

This creates pain on both sides:

| Who | Their pain |
|---|---|
| **Candidate** | Applies to 100 jobs, hears nothing, and never learns *why*. Was it the skills? The formatting? A missing keyword? Total silence. |
| **Recruiter** | Receives 300 resumes for one role. Reads them in the order they arrived. The best candidate might be number 187 and never gets seen. |

### Our solution

**HireSmart AI** is both halves of that system, built honestly:

- For **candidates**: upload a resume, get a real ATS score, see exactly what to fix,
  and see which jobs genuinely fit you *before* you apply.
- For **recruiters**: post a job and every applicant is automatically scored and
  ranked — with the reasoning shown, so you stay in control.

### The one design principle that matters

> **Every number the AI produces must be explainable.**

A bare "72% match" invites the question *"says who?"*. So everywhere we show a score,
we also show the four components that produced it, the matched and missing skills, and
plain-English reasons. This is what separates a toy from a tool — and increasingly,
it's a legal requirement for hiring software in many countries.

---

## 2. The mental model

Before any code, understand the shape of a web application.

```
   ┌─────────────┐   HTTP request    ┌─────────────┐   query    ┌──────────┐
   │   BROWSER   │  ──────────────▶  │   SERVER    │ ─────────▶ │ DATABASE │
   │  (React)    │                   │  (Express)  │            │(MongoDB) │
   │             │  ◀──────────────  │             │ ◀───────── │          │
   └─────────────┘   JSON response   └─────────────┘   results   └──────────┘
      "the client"                     "the backend"
      runs on the user's laptop        runs on our server
```

**The single most important idea:** these are *three separate programs*, often on
three separate machines. They only talk through defined messages.

- The browser **cannot** touch the database. Ever. It asks the server.
- The server **does not** care what the browser looks like. It just sends data.
- Therefore **all security lives on the server.** Anyone can edit the JavaScript
  running in their own browser, so a check that exists only in React is a
  convenience, never a protection. We repeat this in [section 8](#8-security).

### A real request, traced end to end

Say a candidate clicks **"Apply"** on a job. Here is the entire journey:

| # | Where | What happens | File to open |
|---|---|---|---|
| 1 | Browser | User clicks the button; `handleApply()` runs | `client/src/pages/JobDetail.jsx` |
| 2 | Browser | `jobApi.apply(id)` builds the call | `client/src/lib/api.js` |
| 3 | Browser | axios attaches `Authorization: Bearer <token>` | `client/src/lib/apiClient.js` |
| 4 | Network | `POST /api/jobs/:id/apply` leaves the browser | — |
| 5 | Server | Security middleware (helmet, CORS, rate limit, sanitise) | `server/app.js` |
| 6 | Server | Router matches the URL | `server/routes/jobRoutes.js` |
| 7 | Server | `protect` verifies the JWT and loads the user | `server/middleware/authMiddleware.js` |
| 8 | Server | `authorize("candidate")` checks the role | same file |
| 9 | Server | Controller runs the business logic | `server/controllers/jobController.js` |
| 10 | Database | An `Application` document is created | `server/models/Application.js` |
| 11 | Server | Responds `{ success: true, ... }` as JSON | — |
| 12 | Browser | axios unwraps it, a toast appears, UI updates | `JobDetail.jsx` |

**If you understand those twelve steps, you understand this project.**
Everything else is a variation on that theme.

---

## 3. The tech stack

We use the **MERN** stack. Here's what each piece is, in plain terms.

### MongoDB — the database

Where data lives permanently. Unlike SQL tables with fixed columns, MongoDB stores
**documents** that look like JSON:

```js
{
  _id: "6a804d206b249ae55be92268",
  title: "Full Stack MERN Developer",
  company: "Cloud Systems AI",
  salary: 1200000,
  skills: ["React", "Node.js", "MongoDB"],   // an array, directly in the document
}
```

**Why we chose it:** job postings and resumes have messy, varying shapes. One job lists
3 skills, another lists 30. One candidate has 5 projects, another has none. Forcing
that into rigid SQL tables would mean lots of awkward join tables. Documents fit
naturally.

**Mongoose** is the library we use to talk to MongoDB. It adds **schemas** — rules
about what a document must contain — which MongoDB itself does not enforce.
See `server/models/`.

### Node.js — JavaScript outside the browser

JavaScript used to only run in browsers. Node.js lets it run as a normal program on a
server. **Why it matters for you:** one language for the entire project. You are not
switching between Java and JavaScript in the same afternoon.

### Express.js — the web framework

Node can technically serve HTTP on its own, but it's painful. Express gives you:

```js
app.get("/api/jobs", (req, res) => { ... })   // "when someone GETs /api/jobs, run this"
```

Plus **middleware**, which is the key concept — see [section 5](#5-the-backend-layer-by-layer).

### React — the user interface

React lets you build UI from **components**: reusable pieces that take input (props)
and return markup.

```jsx
<Button variant="primary">Apply</Button>
```

**Why not plain HTML/JS?** Because with 40 screens sharing buttons, cards and forms,
plain JS becomes a tangle of `document.getElementById` calls. React keeps the screen
automatically in sync with your data: you change the data, the screen follows.

### The supporting cast

| Tool | What it does | Why we need it |
|---|---|---|
| **Vite** | Dev server + bundler | Instant startup, hot reload, optimised production build |
| **Tailwind CSS** | Utility CSS classes | Style in the markup; no giant CSS files that nobody dares delete |
| **JWT** | Signed login tokens | Lets the server trust a request without storing sessions |
| **bcrypt** | Password hashing | Passwords are never stored readable — see [section 8](#8-security) |
| **Multer** | File upload handling | Parses uploaded resume files |
| **pdf-parse / mammoth** | Text extraction | Pulls readable text out of PDF and DOCX resumes |
| **Recharts** | Charts | The recruiter funnel and pie charts |
| **Winston** | Logging | Records errors to files so you can debug production |
| **Helmet** | Security headers | Sets a dozen protective HTTP headers |

---

## 4. Project structure

```
HireSmart-AI/
├── server/                  ← the backend (Node + Express + MongoDB)
│   ├── config/              ← environment variables, database connection
│   ├── constants/           ← shared fixed values (roles, statuses)
│   ├── controllers/         ← business logic: what happens for each endpoint
│   ├── middleware/          ← code that runs BETWEEN request and controller
│   ├── models/              ← Mongoose schemas: the shape of our data
│   ├── routes/              ← URL → controller mapping
│   ├── services/            ← reusable logic (the AI engine lives here)
│   ├── utils/               ← small helpers
│   ├── validators/          ← input checking
│   ├── scripts/             ← one-off commands (seed, bootstrap admin)
│   ├── test/                ← automated tests
│   ├── app.js               ← builds the Express app
│   └── server.js            ← starts it listening
│
├── client/                  ← the frontend (React + Vite + Tailwind)
│   └── src/
│       ├── components/
│       │   ├── ui/          ← the design system (Button, Card, Modal...)
│       │   ├── layout/      ← Navbar, Footer, route guards
│       │   ├── jobs/        ← job-specific components
│       │   └── ai/          ← score visualisation components
│       ├── pages/           ← one file per screen
│       ├── context/         ← global state (who is logged in)
│       ├── hooks/           ← reusable stateful logic
│       ├── lib/             ← API client and helpers
│       └── App.jsx          ← routes: URL → page
│
└── docs/                    ← this documentation
```

### The naming convention that saved us

Notice `controllers/authController.js` is lowercase-c. There was a real bug here:
the file was `AuthController.js` (capital A) but the route imported
`require("../controllers/authController")`.

On **Windows and macOS** filenames are case-insensitive, so it worked on the
developer's laptop. On **Linux** (every real server) it is case-sensitive, so the
app crashed instantly on boot with `Cannot find module`.

**Lesson:** pick one convention and never deviate. We use `camelCase.js` for
everything except React components, which use `PascalCase.jsx`.

---

## 5. The backend, layer by layer

The backend is deliberately built in layers. Each layer has **one job**.

```
Request
   ↓
[ app.js ]        security, parsing, logging       ← applies to every request
   ↓
[ routes/ ]       which controller handles this URL?
   ↓
[ middleware/ ]   is this person logged in? allowed?
   ↓
[ controllers/ ]  the actual business logic
   ↓
[ services/ ]     reusable logic (AI scoring, file storage, email)
   ↓
[ models/ ]       read and write the database
   ↓
Response
```

**Why bother with layers?** Because it makes each piece *testable and replaceable*.
Our AI scoring lives in a service with no database and no Express, so we can test it
with plain function calls in milliseconds. If it were embedded inside a controller,
testing it would require booting a server and a database.

### 5.1 Models — the shape of your data

Open `server/models/Job.js`:

```js
const jobSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,      // cannot be missing
        trim: true,          // strips accidental spaces
        maxlength: 150,      // stops someone storing a 5 MB "title"
    },
    salary: { type: Number, required: true, min: 0 },
    skills: {
        type: [String],
        validate: {
            validator: (skills) => skills.length > 0 && skills.length <= 50,
            message: "A job must list between 1 and 50 skills",
        },
    },
    recruiter: {
        type: mongoose.Schema.Types.ObjectId,   // a reference to another document
        ref: "User",
    },
}, { timestamps: true });   // adds createdAt and updatedAt automatically
```

Two things to notice:

**1. Relationships use references.** `recruiter` stores the *id* of a User document,
not a copy of the user. When we need the actual user we call `.populate("recruiter")`
and Mongoose fetches it. This is how you avoid storing the same name in 500 places.

**2. Indexes make queries fast.** At the bottom of the file:

```js
jobSchema.index({ status: 1, createdAt: -1 });
```

Without an index, finding published jobs means MongoDB reading **every single
document**. With one, it jumps straight to the answer — the difference between 2ms
and 2 seconds once you have real data.

### 5.2 Middleware — the concept that makes Express click

Middleware is a function that runs **between** the request arriving and your
controller. It receives `(req, res, next)` and either handles the request or calls
`next()` to pass it along.

Think of airport security: check-in → passport → scanner → gate. Each station can
either wave you through or stop you.

Our real authentication middleware, `server/middleware/authMiddleware.js`:

```js
exports.protect = async (req, res, next) => {
    try {
        // 1. Get the token out of the "Authorization: Bearer xxx" header
        let token;
        if (req.headers.authorization?.startsWith("Bearer")) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return next(new AppError("Access denied. No token provided.", 401));
        }

        // 2. Verify the signature. If anyone tampered with it, this throws.
        const decoded = jwt.verify(token, config.jwtSecret);

        // 3. Load the real user — the token could be for a deleted account
        const user = await User.findById(decoded.id).select("-password");
        if (!user) return next(new AppError("User not found", 404));
        if (!user.isActive) return next(new AppError("This account has been deactivated", 403));

        // 4. Attach the user so every later function can see who is calling
        req.user = user;
        next();               // ← pass control onward
    } catch (error) {
        return next(new AppError("Invalid or expired token", 401));
    }
};
```

And role checking, which *returns* a middleware so you can configure it:

```js
exports.authorize = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return next(new AppError("You are not authorized to access this resource.", 403));
    }
    next();
};
```

Used in a route, it reads almost like English:

```js
router.post("/", protect, authorize("recruiter", "admin"), createJob);
//               ^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^
//               logged   must be recruiter or admin       finally, do the work
//               in?
```

### 5.3 The error handling pattern

Express 4 does not catch errors from `async` functions. Forget one `try/catch` and
your server hangs forever with no response. Our solution, `middleware/asyncHandler.js`:

```js
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
```

Wrap any async controller in it and every thrown error automatically reaches the
global error handler. That handler (`middleware/errorHandler.js`) does something
important:

```js
res.status(statusCode).json({
    success: false,
    status: `${statusCode}`.startsWith("4") ? "fail" : "error",
    // Never leak internal details on a 500
    message: statusCode >= 500 ? "Internal Server Error" : message,
});
```

**Why hide 500 messages?** Because a raw database error can expose your schema,
file paths, or even query contents to an attacker. Users see a generic message;
the full stack trace goes to the log file.

### 5.4 Environment configuration

Secrets (database password, JWT signing key) must **never** be committed to Git.
They live in `server/.env`, which is git-ignored. `server/.env.example` is the
committed template showing which variables exist, with fake values.

`config/env.js` reads them once and validates:

```js
const validateEnvironment = () => {
    const required = ["MONGO_URI", "JWT_SECRET"];
    if (config.isProduction) required.push("CORS_ORIGIN");

    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
};
```

**Fail fast at startup**, loudly, rather than mysteriously breaking at 3 a.m. when
someone finally tries to log in.

---

## 6. The AI engine

This is the part that makes the project *yours* rather than another CRUD app.
Two files, both pure functions, both fully unit-tested.

### 6.1 What was there before (and why it was weak)

The original matching code compared raw words:

```js
const matchedSkills = jobSkills.filter((skill) => resumeSkills.has(skill));
const score = (matchedSkills.length / jobSkills.length) * 100;
```

Four problems, and you should be ready to name them in a viva:

1. **"React.js", "reactjs" and "React"** were three different strings — no match.
2. **Common words dominated.** A job description full of "the", "and", "we", "team"
   diluted every comparison.
3. **"developed" vs "develops"** did not match.
4. **One number, no explanation.** A recruiter cannot act on "42%".

### 6.2 The building blocks — `services/textAnalysis.js`

**Tokenisation** — split text into comparable words.

**Stop-words** — throw away words that carry no signal. We remove standard English
stop-words *plus* recruitment boilerplate ("responsibilities", "requirements",
"looking", "candidate") because they appear in literally every job advert.

**Stemming** — collapse word forms to one root, so `developed` and `develops` both
become `develop` and count as the same evidence.

> **A deliberate design decision worth explaining in your viva:** our stemmer does
> **not** strip the `-er` suffix. A textbook Porter stemmer would turn *docker* into
> *dock* and destroy the skill. We chose a conservative stemmer because in this
> domain, technology names matter more than linguistic purity. There's a test
> asserting exactly this in `test/matching.test.js`.

**Synonyms** — a lookup table mapping `js → javascript`, `k8s → kubernetes`,
`postgres → postgresql`, and so on.

**TF-IDF** — the classic Information Retrieval weighting:

- **TF (Term Frequency)** = how often a word appears *in this document*.
- **IDF (Inverse Document Frequency)** = how *rare* the word is across all documents.

Multiply them and a word like "kubernetes" (rare, meaningful) scores far higher than
"experience" (in every document, meaningless).

```js
const tf = count / total;
const idf = Math.log((1 + documentCount) / (1 + documentFrequency.get(token))) + 1;
vector.set(token, tf * idf);
```

The `+1`s are **smoothing** — they prevent division by zero for an unseen word.

**Cosine similarity** — measures the *angle* between two weighted vectors, from 0
(nothing in common) to 1 (identical).

> **Why the angle and not just the overlap?** Because a 5-page resume would otherwise
> beat a sharp 1-page resume simply for being longer. Cosine similarity normalises
> for length, so it measures *what the document is about*, not how much of it there is.

### 6.3 The scoring model — `services/resumeMatchingService.js`

The final score is a weighted blend of four independent components:

| Component | Weight | What it measures |
|---|---|---|
| **Skills** | 55% | Do they have the specific skills listed? |
| **Semantic** | 25% | Does the resume *read* like this job? (TF-IDF + cosine) |
| **Experience** | 15% | Do their years meet the requirement? |
| **Education** | 5% | Degrees and certifications |

Three subtleties that show real engineering thought:

**1. Skills are credited from the resume text, not just the profile.**
Candidates constantly forget to tick a skill on their profile even though their
projects clearly demonstrate it. We check both.

**2. Semantic scores are calibrated.**

```js
const CALIBRATION_CEILING = 0.45;
score = Math.min(1, similarity / CALIBRATION_CEILING);
```

Real resume-vs-job-description cosine similarity rarely exceeds ~0.45 even for an
excellent match, because a CV contains lots of text a job ad never does. Reporting a
raw 0.45 as "45%" would make every good candidate look mediocre, so we rescale.

**3. Weights are re-normalised when data is missing.**

```js
for (const [name, weight] of Object.entries(WEIGHTS)) {
    if (components[name].applicable) {
        weightedTotal += components[name].score * weight;
        usedWeight += weight;      // ← only count what we could actually measure
    }
}
const matchScore = usedWeight > 0 ? Math.round(weightedTotal / usedWeight) : 0;
```

Without this, a job that doesn't state an experience requirement would cap *every*
candidate at 85%, because the 15% experience component could never be earned.

### 6.4 The resume analyzer — `services/resumeAnalyzerService.js`

Grades a resume the way a real ATS does, across six weighted checks:

| Check | Weight | Looks for |
|---|---|---|
| Contact information | 15% | Email, phone, LinkedIn, GitHub |
| Resume structure | 20% | Summary, Skills, Experience, Education, Projects headings |
| Skill coverage | 25% | Recognised technologies, grouped by category |
| Quantified achievements | 20% | Bullets containing numbers, %, ₹, "50000 users" |
| Impactful writing | 15% | Action verbs present, weak filler phrases absent |
| Appropriate length | 5% | 400–900 words is the sweet spot |

It returns a letter grade **and a prioritised list of fixes**, sorted critical → high →
medium. Crucially, every suggestion says *what to do*, not just what's wrong:

> ❌ "Weak achievements"
> ✅ "Only 1 bullet point contains measurable results. Rewrite duties as outcomes,
>    for example *Reduced API response time by 40% by adding Redis caching*."

#### A real bug we caught while testing this

Our first version used simple substring matching to find skills. Testing against a
real resume returned this:

```
"skills": ["javascript", "java", "c", "go", "r", "react", ...]
```

**"java", "c", "go" and "r" were false positives** — `"javascript"` *contains*
`"java"`, `"github"` contains `"git"`, and single letters appear everywhere.
A candidate would be credited with four languages they never mentioned.

The fix uses a word-boundary regex for ambiguous short names:

```js
const AMBIGUOUS = new Set(["c", "r", "go", "java", "git", "be", "me", "spark"]);

const mentionedAsWord = (skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");   // escape c++ and c#
    return new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?:[^a-z0-9+#]|$)`, "i").test(lowerText);
};
```

Two tests now lock this behaviour in permanently — one asserting the false positives
are gone, one asserting genuinely-mentioned languages are still found.

**This is the single best story to tell in your viva.** It shows you tested against
real data, found a subtle correctness bug, understood the root cause, fixed it
precisely, and wrote regression tests.

---

## 7. The frontend, layer by layer

### 7.1 Components — the vocabulary of your UI

A component takes **props** and returns markup:

```jsx
const Badge = ({ variant = "default", children }) => (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs", VARIANTS[variant])}>
        {children}
    </span>
);
```

**Why a `<Button>` component instead of `<button className="...">` everywhere?**
Without it, every developer invents their own shade of indigo, their own padding, and
their own disabled state. One component means the product looks deliberate — and a
design change is one file, not forty.

Our `Button` also handles two things raw buttons get wrong: a **loading state that
disables itself** (preventing double-submits — a real bug class where users create two
applications by double-clicking), and an `as` prop so a link can look identical to a
button without duplicating styles.

### 7.2 State — the thing that trips everyone up

**State** is data that changes over time and, when it changes, the screen updates.

```jsx
const [count, setCount] = useState(0);
//     ^current  ^setter          ^initial
```

The rule: **never modify state directly.** `count = 5` does nothing. You must call
`setCount(5)` so React knows to re-render.

We use three levels of state, deliberately:

| Level | Tool | Used for | Example |
|---|---|---|---|
| **Local** | `useState` | One component only | Is this dropdown open? |
| **URL** | `useSearchParams` | Shareable, back-button-able | Job filters (`?keyword=react&page=2`) |
| **Global** | React Context | Needed everywhere | Who is logged in? |

> **Putting filters in the URL is a small change with big payoff.** The back button
> works, refreshing keeps your filters, and a filtered search can be pasted to a
> friend. See `client/src/pages/Jobs.jsx`.

### 7.3 The custom hooks that removed ~600 lines of duplication

Every screen that loads data needs the same four things: `data`, `isLoading`,
`error`, and a way to refetch. Writing that by hand in each component is ~20
duplicated lines and is where bugs breed.

`client/src/hooks/useApi.js` provides:

```jsx
const { data, isLoading, error, refetch } = useFetch(() => jobApi.list({ page }), [page]);
```

It handles three subtle problems you would otherwise hit:

**1. Race conditions.** You type "r", then "re", then "rea". Three requests fly out.
If the *first* one is slowest it lands last and overwrites your correct results with
stale ones. We tag each request and ignore superseded responses:

```js
const currentRequest = ++requestId.current;
// ...later...
if (isMounted.current && currentRequest === requestId.current) {
    setData(response);      // only the newest request may write
}
```

**2. Setting state after unmount.** Navigating away mid-request would otherwise warn
and leak memory. The `isMounted` ref prevents it.

**3. Debouncing.** `useDebouncedValue` waits until the user *stops* typing, so a
search fires one request instead of one per keystroke.

### 7.4 Context — global state without prop-drilling

The navbar, every dashboard and every route guard all need the current user.
Threading that through ten layers of props is miserable. Context makes it available
anywhere:

```jsx
const { user, isAuthenticated, role, logout } = useAuth();
```

`client/src/context/AuthContext.jsx` does one clever thing worth understanding.
On page load, a token in `localStorage` means the user *was* signed in — but the token
may have expired. So we don't trust it; we ask the server:

```js
const bootstrap = useCallback(async () => {
    if (!tokenStorage.get()) return;          // no token, nothing to verify

    try {
        const response = await userApi.getProfile();   // ← ask the server
        setUser(response.user);
        setStatus("authenticated");
    } catch {
        tokenStorage.clear();                 // token was rejected: sign out
        setStatus("anonymous");
    }
}, []);
```

And the API client tells the Context whenever *any* request returns 401, so a session
that expires mid-use clears the UI immediately instead of leaving a broken screen.

### 7.5 The API layer

`client/src/lib/apiClient.js` configures axios once, with two **interceptors** —
functions that run automatically on every request and response.

**Request interceptor** — attaches the token so no component ever touches it:

```js
apiClient.interceptors.request.use((config) => {
    const token = tokenStorage.get();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});
```

**Response interceptor** — normalises every error into a readable `error.message`,
and handles expired sessions centrally.

One detail that matters for deployment:

```js
const BASE_URL = import.meta.env.VITE_API_URL || "/api";
```

We default to a **relative** URL. The browser then calls the same origin it was served
from, and Vite's dev proxy forwards it to Express. Hard-coding `http://localhost:5000`
would break the instant anyone opens the app from another device.

### 7.6 Routing and code-splitting

`App.jsx` maps URLs to pages, grouped by who may see them:

```jsx
<Route element={<ProtectedRoute allowedRoles={["recruiter", "admin"]} />}>
    <Route path="/recruiter" element={<RecruiterDashboard />} />
    <Route path="/recruiter/jobs" element={<ManageJobs />} />
</Route>
```

Pages are **lazy-loaded**:

```jsx
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
```

The browser downloads only the code for the screen being viewed. You can see it
working in the build output — each page is a separate file, and the 371 kB charts
bundle is only downloaded by recruiters who open Analytics.

---

## 8. Security

Six real defences, each answering an actual attack.

### 8.1 Passwords are hashed, never stored

```js
const hashedPassword = await bcrypt.hash(password, 8);
```

**The attack:** someone steals your database. If passwords are plain text, every user
is compromised — including on other sites, because people reuse passwords.

**The defence:** bcrypt is a **one-way** function. `"password123"` becomes
`"$2b$08$se8GXvF/M2FSSpg..."` and there is no way back. To check a login we hash the
attempt and compare hashes. bcrypt is also *deliberately slow*, which makes
brute-forcing millions of guesses impractical.

Note the schema also has `select: false` on the password field, so it is never
included in queries by accident.

### 8.2 JWT for stateless authentication

A JWT has three parts: header, payload, and a **signature** made with your secret key.
Change a single character of the payload — say, `role: "candidate"` → `role: "admin"` —
and the signature no longer matches. `jwt.verify()` throws.

> **Important:** a JWT is *signed*, not *encrypted*. Anyone can read its contents by
> base64-decoding it. Never put a password or anything secret in a token payload.
> We store only `{ id, role }`.

### 8.3 Authorization is always checked server-side

The frontend hides links a role cannot use — but that is **only** UX. Anyone can edit
JavaScript in their browser. The real enforcement is on every route:

```js
router.get("/:id/applicants", protect, authorize("recruiter", "admin"), getApplicants);
```

And ownership is checked too, not just role — a recruiter must not read another
company's applicants:

```js
const assertJobAccess = (job, user) => {
    if (user.role === roles.admin) return;
    if (String(job.recruiter) !== String(user.id)) {
        throw new AppError("You are not authorized to access this job", 403);
    }
};
```

### 8.4 NoSQL injection prevention

**The attack.** Send this as your login body:

```json
{ "email": { "$gt": "" }, "password": { "$gt": "" } }
```

`$gt` means "greater than". `{ email: { $gt: "" } }` matches *any* email — the
attacker logs in as the first user in your database without knowing a password.

**The defence.** `express-mongo-sanitize` strips keys starting with `$` or containing
`.` from every request body, query and params. See `server/app.js`.

### 8.5 Rate limiting

Without it, an attacker can try 10,000 passwords per minute. We cap requests per IP:

```js
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isProduction ? 300 : 1000,
});
```

### 8.6 Private file storage

Resumes contain phone numbers and addresses. They are **never** served as static
files. Every download goes through an authenticated route that verifies the caller is
either the owner, or a recruiter whose job that candidate actually applied to. There's
a test asserting `/uploads/...` is not publicly reachable.

---

## 9. Testing

We have **40 automated tests** that run in about 6 seconds:

```bash
cd server && npm test
# tests 40
# pass 40
# fail 0
```

### Why bother?

Because manually clicking through 40 screens after every change is impossible. Tests
let you refactor fearlessly: change the code, run the tests, and know in six seconds
whether you broke something.

### The two kinds we use

**Unit tests** — test one pure function in isolation. Fast, no database.
`test/matching.test.js` and `test/resumeAnalyzer.test.js` are unit tests: they call
the scoring engine directly with sample resumes.

**Integration tests** — test a whole request through Express *and* a real database.
`test/auth.test.js` actually registers a user and logs in. These use
`mongodb-memory-server`, a throwaway in-memory MongoDB, so tests never touch real data.

### The safety guard worth pointing out

`test/setup.js` contains a deliberate paranoia check:

```js
if (currentHost.includes("mongodb.net") || currentDb === "hiresmart") {
    throw new Error(`[SAFETY GUARD] Attempted to clear database "${currentDb}"...`);
}
```

Tests wipe the database between cases. If a misconfigured `.env` ever pointed the test
suite at the production Atlas cluster, this refuses to run rather than deleting
everything. **This is exactly the kind of detail examiners notice.**

### A good test tells a story

```js
test("a genuinely matching resume scores far higher than an unrelated one", () => {
    const strong = calculateResumeJobMatch({ resumeText: STRONG_RESUME, ... });
    const weak   = calculateResumeJobMatch({ resumeText: WEAK_RESUME, ... });

    assert.ok(strong.matchScore >= 70, `strong resume scored only ${strong.matchScore}`);
    assert.ok(weak.matchScore <= 30,   `weak resume scored too high at ${weak.matchScore}`);
    assert.ok(strong.matchScore - weak.matchScore > 40, "the gap should be decisive");
});
```

Notice it asserts the *gap*, not exact numbers. Testing `=== 87` would break every
time you tuned a weight. Testing "a full-stack dev beats a graphic designer for a MERN
role, decisively" tests the thing that actually matters.

---

## 10. Running it yourself

### Prerequisites

- **Node.js 18+** — <https://nodejs.org>
- **MongoDB** — either installed locally, or a free cloud cluster at
  <https://www.mongodb.com/atlas>

### Setup

```bash
# 1. Backend configuration
cd server
cp .env.example .env
```

Now edit `server/.env` and set at minimum:

```ini
MONGO_URI=mongodb://127.0.0.1:27017/hiresmart_ai
JWT_SECRET=any_long_random_string_at_least_32_characters
```

> **Generate a real secret** with:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

```bash
# 2. Install and seed demo data
npm install
npm run seed          # creates 5 users, 6 jobs, 6 applications

# 3. Start the API (leave running)
npm run dev           # → http://localhost:5000

# 4. In a SECOND terminal, start the frontend
cd client
npm install
npm run dev           # → http://localhost:5173
```

Open <http://localhost:5173>.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Candidate | `anastai.candidate@hiresmart.ai` | `Password@123` |
| Recruiter | `alexander.recruiter@hiresmart.ai` | `Password@123` |

The login page has one-click buttons for both.

### Useful commands

| Command | Where | What it does |
|---|---|---|
| `npm run dev` | server | Start API with auto-restart |
| `npm test` | server | Run all 40 tests |
| `npm run seed` | server | Reset the database with demo data |
| `npm run bootstrap:admin` | server | Create the first admin account |
| `npm run dev` | client | Start the React dev server |
| `npm run build` | client | Production build into `dist/` |
| `npm run lint` | client | Check code quality |

### A five-minute demo script

1. **Landing page** → click **"Check my resume free"**
2. Click **"Use a sample resume"** → **"Analyse my resume"**
   → ATS score, grade, extracted skills, prioritised fixes. *No login needed.*
3. **Sign in as Candidate** → Dashboard → **"For You"**
   → jobs ranked 90%, 65%, 52% with reasons
4. Open a job → **"Check my fit with AI"** → full four-component breakdown
5. **Sign out, sign in as Recruiter** → My Jobs → **"applicants"**
   → candidates ranked by score
6. Click **"Why this score?"** → the explainable breakdown
7. **Analytics** → funnel and conversion rates

---

## 11. Bugs we found and fixed

These are real defects that existed in the repository. Being able to explain them
is worth more in an interview than any feature.

### Bug 1 — The app could not start on Linux

**Symptom:** every test failed with `Cannot find module '../controllers/authController'`.

**Cause:** the file was `AuthController.js` but the import said `authController`.
Windows and macOS have case-insensitive filesystems so it worked locally; Linux
servers are case-sensitive.

**Fix:** `git mv AuthController.js authController.js`.

**Lesson:** develop and deploy on the same case-sensitivity, or enforce a naming
convention with a linter.

### Bug 2 — Login returned HTTP 500

**Symptom:** registration worked, login crashed with a generic server error.

**Debugging:** the error handler correctly hides 500 details, so the message was
useless. I reproduced it in a script and found `jwt.sign()` was throwing —
`config.jwtSecret` was `undefined` because the test environment had no `.env` file.

**Fix:** `config/env.js` now supplies throwaway defaults **only** when
`NODE_ENV === "test"`, so a fresh clone can run its tests. Development and production
still fail loudly if a secret is missing.

**Lesson:** a project must work on a fresh clone. "It works on my machine because I
have an untracked file" is a broken project.

### Bug 3 — Tests could not run without internet

**Symptom:** `mongodb-memory-server` tried to download a MongoDB binary on every run
and failed behind a firewall.

**Fix:** added `test/mongo-binary.js`, which looks for an existing local `mongod`
before falling back to downloading.

### Bug 4 — Skill detection had false positives

Covered in detail in [section 6.4](#64-the-resume-analyzer). `"javascript"` was
matching `"java"`, `"github"` was matching `"git"`.

### Bug 5 — Three React correctness issues

Found by ESLint's React Compiler rules:

1. **`useFetch` mutated a ref during render.** Unsafe in React 18+ concurrent mode,
   where a render can be started and discarded before committing. Moved the
   assignment into an effect.
2. **`Profile` copied props into state with an effect.** This renders an empty form,
   then re-renders with data — and can wipe what the user is typing. Replaced with
   React's recommended `key`-based remount pattern.
3. **`Navbar` closed its menus from an effect**, causing a cascading render. Now
   derived during render by remembering which route the menu was opened on.

---

## 12. What to build next

Ordered by value-per-effort:

| # | Feature | Why it's valuable | Difficulty |
|---|---|---|---|
| 1 | **Email notifications** | `emailService.js` already exists. Wire it to status changes. | Easy |
| 2 | **In-app notifications** | A bell icon with unread counts. New model + polling. | Medium |
| 3 | **Interview scheduling** | Real ATS feature. Model + calendar UI. | Medium |
| 4 | **Bulk actions** | Shortlist 10 candidates at once from the ranked list. | Easy |
| 5 | **Export to CSV** | Recruiters genuinely want this. | Easy |
| 6 | **Optional LLM layer** | Add a Gemini/OpenAI key for narrative feedback, keeping the local engine as fallback. | Medium |
| 7 | **Docker Compose** | One command to run app + database. Great for deployment marks. | Medium |
| 8 | **CI with GitHub Actions** | Run the 40 tests on every push. | Easy |

### If you only do one thing

Add **GitHub Actions**. A green "tests passing" badge on your README is the single
cheapest signal of professionalism a recruiter will see:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd server && npm ci && npm test
```

---

## Where to go from here

- **`docs/VIVA.md`** — likely examiner questions with model answers
- **`docs/RESUME.md`** — how to describe this project on your CV and LinkedIn
- **`docs/backend-api.md`** — the complete API reference

**The best way to learn this codebase is to break it.** Change a weight in
`resumeMatchingService.js` and watch the scores move. Delete a middleware and see what
fails. Run the tests after each change. That loop — change, observe, understand — is
how the code becomes genuinely yours.
