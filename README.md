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
