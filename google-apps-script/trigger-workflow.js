/**
 * Triggers the TraffIQ-Pro GitHub Actions workflow from Google Apps Script.
 *
 * Setup:
 * 1. Create a fine-grained GitHub token scoped to this repository.
 *    Required repository permissions:
 *    - Actions: Read and write
 *    - Contents: Read-only
 * 2. In Apps Script, open Project Settings -> Script properties.
 * 3. Add GITHUB_TOKEN with the token value.
 * 4. Update GITHUB_OWNER, GITHUB_REPO, WORKFLOW_FILE, and BRANCH below.
 * 5. Run triggerTrafficMonitor manually once to approve permissions.
 * 6. Add a time-based Apps Script trigger for triggerTrafficMonitor.
 */

const GITHUB_OWNER = 'Solomon-green';
const GITHUB_REPO = 'TraffIQ-Pro';
const WORKFLOW_FILE = 'hourly_traffic.yml';
const BRANCH = 'main';

function triggerTrafficMonitor() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');

  if (!token) {
    throw new Error('Missing GITHUB_TOKEN script property.');
  }

  const url = [
    'https://api.github.com/repos',
    encodeURIComponent(GITHUB_OWNER),
    encodeURIComponent(GITHUB_REPO),
    'actions/workflows',
    encodeURIComponent(WORKFLOW_FILE),
    'dispatches',
  ].join('/');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    contentType: 'application/json',
    payload: JSON.stringify({
      ref: BRANCH,
    }),
    muteHttpExceptions: true,
  });

  const statusCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`GitHub workflow dispatch failed: ${statusCode} ${responseBody}`);
  }

  Logger.log(`GitHub workflow dispatch accepted: ${statusCode}`);
}
