---
description: Check the CI status for the current Git branch
---
The user wants to know the CI status for their current branch.

Steps:

1. Get the current branch and repo:
   ```bash
   git branch --show-current
   gh repo view --json nameWithOwner -q .nameWithOwner
   ```

2. List recent workflow runs for that branch:
   ```bash
   gh run list --branch <BRANCH> --limit 5
   ```

3. Summarise the status concisely:
   - Show the overall status (passing / failing / in progress)
   - List each workflow run with its name, status, conclusion, and link
   - If any runs failed, highlight which jobs failed
   - If a run is in progress, mention it

4. If the user wants more detail on a failure, suggest using `/getlogs` with the run URL.
