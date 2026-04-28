---
description: Fetch and analyse logs from a GitHub Actions CI run
---
The user wants to view logs from a GitHub Actions CI run.

Ask the user for the GitHub Actions URL if not provided: $@

Then run the get-logs script:

```bash
./get-logs.sh <github-actions-url>
```

After fetching logs:
- Summarise the result for the user
- If there are failures, identify the root cause and suggest a fix
- Keep the summary concise — don't dump raw logs back to the user
