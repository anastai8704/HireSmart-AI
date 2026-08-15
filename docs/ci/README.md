# Enabling Continuous Integration

The GitHub Actions workflow lives here as **`github-actions-ci.yml`** rather than in
`.github/workflows/`.

**Why:** GitHub deliberately refuses to let an automated app create or modify workflow
files without an explicit `workflows` permission — a sensible security measure, since a
workflow file can run arbitrary code with repository credentials. So this one final
step has to be done by you, by hand. It takes about thirty seconds.

## Activate it

```bash
mkdir -p .github/workflows
cp docs/ci/github-actions-ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions pipeline"
git push
```

Then open the **Actions** tab on GitHub. You should see the workflow running.

## What it does

Two parallel jobs on every push and pull request:

| Job | Steps |
|---|---|
| **Backend tests** | Starts a real MongoDB 7 service container, waits for it to be healthy, installs with `npm ci`, syntax-checks every file, runs all 42 tests |
| **Frontend lint and build** | Installs with `npm ci`, runs ESLint, then proves the production build succeeds |

## Why it is worth doing

- **It catches what you forget.** Push a broken import at 2 a.m. and GitHub tells you
  in ninety seconds instead of your examiner finding it in the demo.
- **It proves the project works on a clean machine.** CI has none of your local
  environment, so it silently disproves "it works on my machine".
- **The badge is a credibility signal.** A green *CI passing* badge at the top of your
  README is the cheapest professional signal available, and recruiters do notice it.

The badge is already in `README.md` and will turn green once the workflow runs.

## Note on `npm ci` vs `npm install`

The workflow uses `npm ci`, which installs the exact versions locked in
`package-lock.json` and fails if the lockfile and `package.json` disagree. `npm install`
may quietly resolve to newer versions, meaning CI could pass on dependencies you never
tested. Always use `npm ci` in automation.
