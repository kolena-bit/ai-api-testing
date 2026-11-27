# AI API Testing — Account API regression

Postman collection for regression testing of the `PATCH /v1/account` endpoint (user profile update).

## Contents

```
collections/account-api-collection.json   Postman collection v2.1
environments/account-api.example.json     environment template (empty values)
results/                                  newman run results (git-ignored)
reports/                                  HTML/JUnit reports (git-ignored)
```

### Test coverage

| Folder | Request | What is checked |
|---|---|---|
| Positive | Update profile - all fields | 200, JSON body, `success: true`, `data` present, response time < 3000 ms |
| Negative | no auth token / invalid token | 401, no 500, no sensitive fields in the error |
| Negative | missing body, empty JSON object, invalid email, invalid phone, wrong data types, null values, unsupported lang, unknown fields | expected 4xx (or 200 where the behaviour is not specified), never 500 |

Test names are tagged: `[CONTRACT]` — documented behaviour, `[ASSUMPTION]` — expected behaviour not confirmed by the docs yet, `[SECURITY]` — security checks.

## Setup

1. Copy the environment template and fill in the values:

   ```bash
   cp environments/account-api.example.json environments/account-api.postman_environment.json
   ```

   | Variable | Meaning |
   |---|---|
   | `base_url` | API base URL, without a trailing slash |
   | `token` | valid Bearer token of a test user |
   | `invalid_token` | any malformed/expired token |
   | `test_first_name`, `test_last_name`, `test_phone`, `test_email`, `test_lang` | profile values for the positive test |
   | `missing_body_expected_status` | optional, expected status for a request without body (default `422`) |

   Files matching `*.postman_environment.json` are git-ignored — **never commit real tokens**.

   > The tests update the profile of the user that owns `token`. Use a dedicated test account.

## Run in Postman

1. Import `collections/account-api-collection.json` and your environment file.
2. Select the environment, open the collection → **Run**.

## Run with newman (CLI)

Requires Node.js 18+.

```bash
npm install -g newman newman-reporter-htmlextra

newman run collections/account-api-collection.json \
  -e environments/account-api.postman_environment.json \
  -r cli,junit,htmlextra \
  --reporter-junit-export results/junit.xml \
  --reporter-htmlextra-export reports/report.html
```

The exit code is non-zero if any test fails, so the command can be used in CI as is.

## CI (GitHub Actions)

Workflow `.github/workflows/newman.yml` — **API regression (Newman)**:

- logs in via `POST /v1/auth/login` to get a fresh token, builds the environment and runs Newman (Node 22, `newman@6`, reporters `cli`, `json`, `htmlextra`);
- produces a JSON report and an HTML report ([newman-reporter-htmlextra](https://github.com/DannyDainton/newman-reporter-htmlextra));
- removes the token, `Authorization` headers, API host and test-user email from both reports (`scripts/sanitize-report.js`) — if anything is left, the step fails and nothing is published;
- uploads them as artifacts `newman-report` (JSON) and `newman-html-report` (HTML), kept 7 days;
- on `main`, publishes the HTML report to GitHub Pages in a separate job (`publish-report`), **also when assertions fail** — but only if Newman really ran:
  **https://kolena-bit.github.io/ai-api-testing/**

### When it runs

| Trigger | Jira gate | Regression |
|---|---|---|
| Push to `main` changing `collections/**`, `scripts/**` or the workflow | no | always |
| Manual run (**Actions → API regression (Newman) → Run workflow**), `jira_gate` off | no | always |
| Manual run with `jira_gate` on | yes | only if tickets are found |
| **Weekly schedule — Mondays 07:00 UTC** | yes | only if tickets are found |

### Jira gate

Job `jira-gate` decides whether the weekly run executes the regression:

1. Fails with an explicit error if `JIRA_EMAIL` or `JIRA_API_TOKEN` is not set — a scheduled run is never skipped silently.
2. Calls `GET /rest/api/3/myself` and fails unless it is a real, active Atlassian account. Jira can answer anonymous requests with `200` and an empty result, which would look like "no tickets".
3. Searches `POST /rest/api/3/search/jql` (all pages) on `https://e-chat.atlassian.net` with:

   ```
   project = CHAT AND status = 10225 AND summary ~ "API" ORDER BY key
   ```

   - `CHAT` is the **Chatum** project only;
   - status `10225` is **on STAGE**; the id is used so a rename does not break the query;
   - Jira text search ignores brackets, so `summary ~ "API"` is a coarse filter only — the gate then keeps tickets whose summary literally contains **`[API]`** (case-sensitive).
4. Writes the result to the run summary: ticket keys with links (no titles — the repository is public). With 0 tickets the `newman` and `publish-report` jobs are skipped and the run stays green.

To include a ticket in the weekly regression, create it in **Chatum**, put `[API]` in its summary (for example `[API] Check profile update`) and move it to **on STAGE**.

GitHub Pages must use **GitHub Actions** as the source (**Settings → Pages → Build and deployment → Source**).

> The Pages site is public. Environment and global variables are not included in the HTML report.

Required repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Meaning |
|---|---|
| `BASE_URL` | API base URL, without a trailing slash |
| `TEST_USER_EMAIL` | email of a dedicated test user |
| `TEST_USER_PASSWORD` | password of that user |
| `JIRA_EMAIL` | email of the Atlassian account that owns `JIRA_API_TOKEN` (Jira gate only) |
| `JIRA_API_TOKEN` | Atlassian API token, created at https://id.atlassian.com/manage-profile/security/api-tokens (Jira gate only) |
