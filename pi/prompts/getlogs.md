---
description: Fetch and analyse logs from a GitHub Actions CI run
---
The user wants to view logs from a GitHub Actions CI run.

Ask the user for the GitHub Actions URL if not provided: $@

Parse the URL to extract the repo (`owner/repo`), run ID, and optionally job ID from formats like:
- `https://github.com/owner/repo/actions/runs/RUN_ID`
- `https://github.com/owner/repo/actions/runs/RUN_ID/job/JOB_ID`

Use `gh` CLI directly:

1. Show a summary: `gh run view <RUN_ID> --repo <owner/repo>`
2. Fetch failed logs: `gh run view <RUN_ID> --repo <owner/repo> --log-failed 2>&1 | tail -150`
   - If a specific job ID is in the URL, add `--job <JOB_ID>`
   - If the run passed, use `--log` instead of `--log-failed`

After fetching logs:
- Summarise the result for the user
- If there are failures, identify the root cause and suggest a fix
- Keep the summary concise — don't dump raw logs back to the user
