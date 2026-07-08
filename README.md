# SideQuest

**A social network for real‑life events between friends.** The home screen is a live
map: create events ("quests"), invite friends, RSVP, and chat in real time. Businesses
and influencers get their own space to publish events, manage a team, and reach people
nearby.

> Status: **beta** — deployed at `https://sidequest-beta.fly.dev`.
> The app UI is in **English**; in‑code comments are in Spanish (project convention).

---

## Features

- **Map home** — a full‑screen map (MapLibre / Leaflet) is the first screen after login;
  past events are always hidden, upcoming ones are capped by a time filter.
- **Events / quests** — create, edit, set date/time/duration, cover photo, location
  (address autocomplete via Nominatim), and an optional ticket price (pro accounts).
- **RSVP & participants** — going / maybe / not going, invite friends, suggest invites,
  approve or refuse suggestions, remove participants.
- **Per‑event chat** — real‑time messaging (text, image, audio), 15‑minute edit window,
  read receipts, powered by Socket.IO.
- **Friends & DMs** — friend requests (accept / refuse / cancel), a friend cap that
  grows with Premium, username search, suggestions, and one‑to‑one direct messages.
- **Discover** — one unified list of nearby / trip events that merges internal SideQuest
  events (from business & influencer accounts) with external providers (Ticketmaster,
  and holiday sources) behind a common schema. "Near me" (GPS) and "City / trip" modes.
- **Business & influencer hub (`/manage`)** — a Pro workspace: multiple companies per
  owner, per‑company **team management** with roles (owner / manager / editor / viewer)
  and single‑use invite links, priced events, an "events users created at your place"
  count, private team notes, and reviews.
- **Subscriptions** — Premium (person accounts: bigger friend cap, coins, rewards) and
  Pro (business / influencer: priced events, Discover priority, professional profile).
  Billing is not wired yet — activation turns on a free 30‑day trial.
- **Legal pages** — Terms, Privacy and Legal Notice (GDPR / LCEN / LSSI).
- **Admin panel** — a secured Flask‑Admin dashboard at `/admin/`.

---

## Tech stack

**Backend** — Python 3.13, Flask, SQLAlchemy, Flask‑Migrate (Alembic), Flask‑JWT‑Extended
(session in an httpOnly cookie + CSRF), Flask‑SocketIO (threading mode + `simple-websocket`),
Flask‑CORS, Flask‑Admin, Cloudinary (image/PDF uploads), `requests` (external event
providers), Gunicorn, PostgreSQL (`psycopg2`). Managed with **Pipenv**.

**Frontend** — React + Vite, React Router, React‑Bootstrap, React‑Icons, Leaflet /
React‑Leaflet / MapLibre GL (map), `socket.io-client`.

**Infrastructure** — single‑container deploy on **Fly.io** (Flask serves both the API and
the compiled frontend). Dev in GitHub Codespaces / Gitpod / Dev Containers.

---

## Project structure

```
src/
  api/            # Flask backend
    app.py            # app factory / entrypoint (do not edit lightly)
    routes.py         # REST API (/api/*)
    models.py         # SQLAlchemy models (User, Event, Business, Team, Chat, …)
    discover.py       # Discover blueprint: internal + external event providers
    sockets.py        # Socket.IO events (chat, presence)
    mailer.py         # transactional email (password reset, …)
    admin.py          # Flask-Admin dashboard (/admin)
    commands.py       # flask CLI commands (seed data, promote-admin)
    utils.py          # helpers
  front/            # React frontend
    pages/            # routed screens (Home/map, Friends, Events, Discover, /manage, …)
    components/       # EventModal, DiscoverPanel, Navbar, TeamManager, …
    services/         # api.js (HTTP wrapper) + auth.js (cookie + CSRF fetch patch)
    hooks/            # useChat, useNotifications, useGlobalReducer
migrations/         # Alembic migrations
```

**Auth model (important).** The JWT lives in an httpOnly cookie (`sq_access_token`) that
JavaScript cannot read. A global `fetch` patch in `src/front/services/auth.js` attaches
the cookie (`credentials: "include"`) and the `X‑CSRF‑TOKEN` header to every backend call,
and strips any legacy `Authorization` header. Use `src/front/services/api.js`
(`api.get/post/put/del`) for backend requests — it centralises error handling and the
401 → `/login` redirect.

---

## Getting started

### GitHub Codespaces / Gitpod (recommended)

Python, Node and PostgreSQL come pre‑installed. Then:

```sh
pipenv install                 # backend deps
cp .env.example .env           # then fill in the variables (see below)
pipenv run upgrade             # apply DB migrations
pipenv run start               # backend on http://localhost:3001

npm install                    # frontend deps
npm run start                  # frontend on http://localhost:3000
```

### Local

Requires Python 3.13, Pipenv, Node, and a PostgreSQL database. Same steps as above.

### Useful commands

| Command | What it does |
| --- | --- |
| `pipenv run start` | Run the backend (`flask run -p 3001 -h 0.0.0.0`) |
| `npm run start` | Run the frontend (Vite dev server, port 3000) |
| `pipenv run migrate` | Autogenerate a migration after changing `models.py` |
| `pipenv run upgrade` / `downgrade` | Apply / roll back migrations |
| `npm run build` | Build the frontend into `dist/` |
| `npm run lint` | ESLint (0 warnings allowed) |
| `flask insert-test-data` | Seed demo data |
| `flask promote-admin <email>` | Grant a user admin access to `/admin/` |

---

## Environment variables

Fill these in your `.env` (see `.env.example` for the base set). **Never commit real
secrets.** `.env.example` currently ships only the core keys — the app also needs the
image, email and event‑provider keys below.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `FLASK_APP_KEY` | JWT / session signing key (rotating it invalidates sessions) |
| `FLASK_APP` | `src/app.py` |
| `VITE_BACKEND_URL` | Backend base URL, baked into the frontend **at build time** |
| `VITE_BASENAME` | Router base path (usually `/`) |
| `CLOUDINARY_URL` | Cloudinary credentials for image / PDF uploads |
| `MAIL_SMTP_HOST` / `MAIL_SMTP_PORT` / `MAIL_SMTP_USER` / `MAIL_SMTP_PASSWORD` / `MAIL_FROM` | Transactional email (e.g. password reset) |
| `TICKETMASTER_API_KEY` | Discover: Ticketmaster provider |
| `HASDATA_API_KEY`, `PREDICTHQ_TOKEN`, `CALENDARIFIC_API_KEY` | Discover: optional extra providers |

> On Fly.io, `VITE_BACKEND_URL` must be injected as a **build arg** (it is compiled into
> the bundle). If it is missing, the frontend calls `undefined/api/...` and cannot reach
> the backend.

---

## Deployment (Fly.io)

The app deploys as a **single container** (`Dockerfile`) where Flask serves the API,
`/socket.io/*`, and the compiled `dist/`. Key points baked into `fly.toml`:

- `release_command = "flask db upgrade"` runs migrations on every deploy (Fly ignores the
  `Procfile`, so this is required — otherwise schema drift causes 500s on login/register).
- Build with the backend URL: `fly deploy --build-arg VITE_BACKEND_URL=https://<app>.fly.dev`.
- `allowed_origins()` in `sockets.py` must include the Fly domain or the Socket.IO
  handshake is rejected (the client then falls back to long‑polling).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch flow, commit style, and the definition
of done. The team's agile process is documented in [docs/AGILE.md](docs/AGILE.md).
Change history lives in [CHANGELOG.md](CHANGELOG.md).

---

## License

No open‑source license yet — all rights reserved by the SideQuest Teams until a license
is chosen.

---

Made with ♦ by **SideQuest Teams**.
