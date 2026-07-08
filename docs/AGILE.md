# SideQuest — Agile / Scrum process

How the SideQuest Teams organise work. Lightweight by design: enough structure to stay
aligned, not enough to slow us down.

## Framework

We run **Scrum with Kanban limits**: fixed‑length sprints for planning and rhythm, plus a
work‑in‑progress limit so nobody juggles too many things at once.

- **Sprint length:** 1 week.
- **WIP limit:** at most 2 "In progress" items per person.

## Roles

| Role | Responsibility |
| --- | --- |
| **Product owner** | Owns the backlog and priorities; defines the "why". |
| **Scrum master / facilitator** | Runs ceremonies, removes blockers, guards the process. |
| **Developers** | Design, build, test, review and ship increments. |

Roles are hats, not job titles — a small team wears several.

## Ceremonies

- **Sprint planning** (start of sprint) — pull the top of the backlog into the sprint,
  break items into tasks, agree on the sprint goal.
- **Daily standup** (async or ~10 min) — yesterday / today / blockers.
- **Sprint review** (end of sprint) — demo the increment on the running app.
- **Retrospective** (end of sprint) — what to keep, drop, try.
- **Backlog refinement** (mid‑sprint) — clarify and estimate upcoming items.

## The board

Columns on the GitHub Project board:

`Backlog → Ready → In progress → In review → Done`

- **Ready** — refined, estimated, and unblocked; safe to start.
- **In review** — PR open, waiting for review / verification.
- **Done** — merged and verified in the running app.

## Definition of Ready

A backlog item is ready when it has: a clear user‑facing goal, acceptance criteria, a note
on whether a **DB migration** is needed, and a rough estimate.

## Definition of Done

Same as in [CONTRIBUTING.md](../CONTRIBUTING.md): verified end‑to‑end in the app,
dark‑mode + English UI, calls through `services/api.js`, routes tested, migrations applied
with no drift, lint clean, no secrets committed.

## Estimation

Story points on a modified Fibonacci scale (1, 2, 3, 5, 8, 13). Anything larger than 8
should be split before it enters a sprint.

## Labels

Issues and PRs use: `bug`, `enhancement`, `good first issue`, `help wanted`, plus priority
`P1` / `P2`. See `.github/settings.yml`.

—

Maintained by **SideQuest Teams**.
