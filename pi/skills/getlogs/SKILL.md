---
name: getlogs
description: View logs from GitHub Actions CI runs. Paste a GitHub Actions URL to fetch and analyse the logs.
---

# Get CI Logs

Fetch and display logs from a GitHub Actions workflow run.

## Usage

The user will provide a GitHub Actions URL. Extract the owner, repo, and run ID from it and run:

```bash
./get-logs.sh <github-actions-url>
```

For example:
```bash
./get-logs.sh https://github.com/owner/repo/actions/runs/123456789
./get-logs.sh https://github.com/owner/repo/actions/runs/123456789/job/987654321
```

The script will:
1. Parse the URL to extract the repo and run ID
2. Show a summary of the run (status, branch, workflow name)
3. If the run failed, show only the failed job logs
4. If the run succeeded, show the full logs

## After fetching logs

- Summarise the result for the user
- If there are failures, identify the root cause and suggest a fix
- Keep the summary concise — don't dump raw logs back to the user
