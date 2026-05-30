# TraffIQ-Pro

Real-time traffic monitor for TraffIQ Pro. It queries the Google Distance Matrix
API for live, traffic-adjusted travel times between configured locations and
appends each measurement to a Google Sheet. It can run locally or hourly via
GitHub Actions.

## How it works

`monitor.py` fetches every configured route concurrently, retries transient
network errors, classifies congestion (`Normal` / `Moderate Congestion` /
`Heavy Traffic`), and writes all results to the target sheet in a single batched
append.

Routes and coordinates are defined at the top of `monitor.py` (`LOCATIONS` and
`ROUTES`).

## Requirements

- Python 3.10+
- A **Google Maps API key** with the Distance Matrix API enabled
- A **Google service account** with access to your Google Sheet, and its JSON
  key file

## Configuration

The script is configured through environment variables. Only the API key is
required; the rest have sensible defaults.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | yes | — | Google Maps Distance Matrix API key |
| `GOOGLE_SHEETS_KEY_FILE` | no | `credentials.json` | Path to the service-account JSON key |
| `SPREADSHEET_NAME` | no | `Traffic_Log` | Target spreadsheet name |
| `WORKSHEET_NAME` | no | `Log` | Target worksheet/tab name |

## Local setup

```bash
# 1. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Provide your secrets
echo "GOOGLE_MAPS_API_KEY=your_key_here" > .env
# Place your service-account key next to monitor.py as credentials.json

# 4. Run
python monitor.py
```

`.env` and `credentials.json` are git-ignored — never commit them.

The Google Sheet must already exist, be named to match `SPREADSHEET_NAME`,
contain a worksheet matching `WORKSHEET_NAME`, and be shared with the service
account's email address (found in the JSON key under `client_email`).

## Running on GitHub Actions

The workflow at `.github/workflows/hourly_traffic.yml` runs the monitor at the
top of every hour (and on-demand via **Run workflow**). It needs two repository
secrets:

| Secret name | Value |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Your Google Maps API key |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The full contents of your service-account JSON key file |

### Adding the secrets

**Option A — GitHub web UI**

1. Open the repo on GitHub → **Settings**.
2. In the left sidebar: **Secrets and variables** → **Actions**.
3. Click **New repository secret**.
4. Name it `GOOGLE_MAPS_API_KEY`, paste your key into **Secret**, and click
   **Add secret**.
5. Click **New repository secret** again. Name it
   `GOOGLE_SERVICE_ACCOUNT_JSON` and paste the **entire** contents of your
   `credentials.json` (open the file, copy everything including the braces),
   then click **Add secret**.

**Option B — GitHub CLI (`gh`)**

From the repository directory:

```bash
# Maps API key (you'll be prompted to paste the value)
gh secret set GOOGLE_MAPS_API_KEY

# Service-account JSON, read straight from the file
gh secret set GOOGLE_SERVICE_ACCOUNT_JSON < credentials.json
```

Verify they were added:

```bash
gh secret list
```

Once both secrets exist, the workflow reads `GOOGLE_MAPS_API_KEY` from the
environment and writes `GOOGLE_SERVICE_ACCOUNT_JSON` to `credentials.json` at
runtime — no secrets are stored in the repo.

> **Note:** These are *repository* secrets. If you instead use an
> [environment](https://docs.github.com/actions/deployment/targeting-different-environments)
> or organization-level secrets, add them in the corresponding section and make
> sure the workflow/job references that environment.

## Triggering from Google Apps Script

You can trigger the GitHub Actions workflow from Google Apps Script by calling
GitHub's workflow dispatch API. This is useful when a Google Sheet, Apps Script
timer, or other Google Workspace automation should start the traffic monitor
without moving the Python runtime out of GitHub Actions.

The Apps Script helper is in:

```text
google-apps-script/trigger-workflow.js
```

### Create a GitHub token

Create a fine-grained personal access token:

1. Open GitHub → **Settings** → **Developer settings**.
2. Open **Personal access tokens** → **Fine-grained tokens**.
3. Click **Generate new token**.
4. Select the owner and only this repository.
5. Set repository permissions:

| Permission | Access |
| --- | --- |
| `Actions` | Read and write |
| `Contents` | Read-only |

6. Generate the token and copy it. Store it securely; GitHub will not show it
   again.

### Configure Apps Script

1. Open [script.google.com](https://script.google.com/) and create a project.
2. Paste the contents of `google-apps-script/trigger-workflow.js` into the
   Apps Script editor.
3. Update these constants near the top of the file:

```js
const GITHUB_OWNER = 'OWNER';
const GITHUB_REPO = 'TraffIQ-Pro';
const WORKFLOW_FILE = 'hourly_traffic.yml';
const BRANCH = 'main';
```

4. In Apps Script, open **Project Settings**.
5. Under **Script properties**, add:

| Property | Value |
| --- | --- |
| `GITHUB_TOKEN` | The fine-grained GitHub token |

6. Run `triggerTrafficMonitor` manually once from the Apps Script editor and
   approve the requested permissions.
7. Open **Triggers** and add a time-based trigger for `triggerTrafficMonitor`.

For an hourly schedule, choose:

| Field | Value |
| --- | --- |
| Function | `triggerTrafficMonitor` |
| Event source | Time-driven |
| Type | Hour timer |
| Interval | Every hour |

When the trigger runs, Apps Script sends a `workflow_dispatch` request to:

```text
https://api.github.com/repos/OWNER/REPO/actions/workflows/hourly_traffic.yml/dispatches
```

The GitHub Actions workflow still uses the existing repository secrets
(`GOOGLE_MAPS_API_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON`) to run `monitor.py`.
Do not put Google Maps or Google service-account secrets in Apps Script for this
trigger-only setup.

## Development

Type-check with mypy (strict):

```bash
pip install mypy types-requests
mypy --strict monitor.py
```

## Dashboard UI (MUI v9)

The web dashboard lives in `frontend/` as a Vite + React app styled with
**MUI v9**. It loads live traffic rows through a Vercel serverless function
(`frontend/api/traffic.js`) that reads from Google Sheets using a service account.

### Local UI setup (pnpm)

```bash
cd frontend
pnpm install
pnpm dev
```

If you want local API access, run `vercel dev` from `frontend/` in another
terminal so `/api` routes are available. Vite proxies `/api` to
`http://localhost:3000`.

### Vercel environment variables

Set these in your Vercel project (Project Root: `frontend/`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | yes | **Base64-encoded** service-account JSON (full contents). |
| `SPREADSHEET_ID` | yes | Target Google Sheet ID. |
| `WORKSHEET_NAME` | no | Worksheet name (defaults to `Log`). |

The service account must have access to the spreadsheet (share the sheet with
the `client_email` from the JSON).

Generate the base64 value locally:

```bash
base64 -i credentials.json
```
