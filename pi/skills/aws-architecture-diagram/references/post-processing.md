# Post-Processing Pipeline

> In pi there is no automatic PostToolUse hook. Run the pipeline manually after writing a
> `.drawio` file (see SKILL.md “Step 4”):
> `uv run --with "defusedxml>=0.7.1" python3 ~/.pi/agent/skills/aws-architecture-diagram/scripts/lib/post_process_drawio.py <file>.drawio`
> then `validate_drawio.py`.

Deterministic fixers run in this order:

1. **fix_nesting.py** — Sets Region `container=0`, re-parents children to root
2. **fix_icon_colors.py** — Corrects service icon fillColor to match category
3. **fix_step_badges.py** — Nudges overlapping step badges apart
4. **fix_placement.py** — Moves external actors below the title block (y >= 140)
5. **fix_legend_size.py** — Resizes legend panel to match diagram height

All scripts are in `scripts/lib/`. The pipeline is orchestrated by `scripts/lib/post_process_drawio.py`, which chains them in sequence.

**Dependency**: The pipeline requires `defusedxml`. Run the scripts via `uv run --with "defusedxml>=0.7.1" python3 ...` so the dependency is provided in an ephemeral environment — no global install needed.
