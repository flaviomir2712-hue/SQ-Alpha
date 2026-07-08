# Contributing to SideQuest

Thanks for helping build SideQuest! This guide keeps the codebase consistent and the
review loop fast.

## Ground rules

- **UI text is English.** Labels, buttons, placeholders and toasts are written in English.
- **Code comments stay in Spanish.** That is the existing convention across the repo
  (the running `Tanda N —` / `Phase N —` notes). Don't translate them.
- **Dark mode everywhere.** Every new UI element must match the dark theme — no default
  Bootstrap light surfaces (`variant="light"`, `bg-white`, unstyled Modal/Card/Form).
  Tokens: primary indigo `#4f46e5` / `#6366f1`, surfaces `#161922` / `#0f111a`, borders
  `#262a36`, text `#e9ecef` / `#adb5bd`.
- **Reuse before adding.** Check `routes.py`, `models.py` and existing components before
  duplicating logic or styles.
- **Backend calls go through `services/api.js`** (`api.get/post/put/del`). Don't hand‑roll
  `fetch` with an `Authorization` header — auth is a cookie + CSRF added globally by
  `services/auth.js`. Intentional exceptions (background capability probes, retry wrappers,
  external APIs like Nominatim) may stay raw and should carry a short comment saying why.

## Branch & PR flow

1. Branch off the working branch (currently `teamFixes`) using a descriptive name:
   `feat/…`, `fix/…`, `chore/…`, `docs/…`.
2. Keep PRs focused. One feature or fix per PR.
3. Open a Pull Request and fill in the template. Link any related issue.
4. At least one review approval before merge.

## Commit messages

Use short, imperative summaries, optionally with a scope:

```
feat(discover): hide past business events like the map
fix(auth): stop leaking a dead Bearer header
docs: rewrite the README for SideQuest
```

## Definition of done

A change is done when:

- [ ] It works end‑to‑end, verified in the running app (not just "compiles").
- [ ] UI is dark‑mode consistent and English.
- [ ] New API routes are tested and functional.
- [ ] Migrations are generated **and** applied (`pipenv run migrate` → review → `upgrade`),
      with no model ↔ migration drift.
- [ ] `npm run lint` passes (0 warnings).
- [ ] No secrets committed; `.env` stays local.

## Running the app

See the [README](README.md#getting-started). Backend on `:3001`
(`pipenv run start`), frontend on `:3000` (`npm run start`).

## Reporting bugs & requesting features

Use the GitHub issue templates. For security issues, contact the maintainers privately
rather than opening a public issue.

—

Maintained by **SideQuest Teams**.
