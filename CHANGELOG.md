# Changelog

All notable changes to SideQuest are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project is in **beta**
(pre‑1.0), so history is grouped by theme rather than by semantic version.

## [Unreleased]

### Added
- **Business & influencer track** — management hub at `/manage`, multiple companies per
  owner, per‑company teams with roles (owner / manager / editor / viewer) and single‑use
  invite links, priced events, "events at your place" counts, private team notes, reviews.
- **Subscriptions** — Premium (person) and Pro (business / influencer) tiers; activation
  currently starts a free 30‑day trial (billing not yet wired).
- **Discover** — unified nearby / trip event list merging internal SideQuest events with
  external providers (Ticketmaster + holiday sources) behind a common schema; "Near me"
  (GPS) and "City / trip" modes; server‑side date/keyword/distance filtering with an
  in‑memory cache.
- **Real‑time chat** — per‑event and direct messages over Socket.IO (text / image / audio),
  read receipts, 15‑minute edit window.
- **Interactive onboarding** — a guided tour driven by real user actions.
- **Legal pages** — Terms, Privacy, Legal Notice (GDPR / LCEN / LSSI).
- **Admin** — secured Flask‑Admin dashboard at `/admin/` (gated by `User.is_admin`).

### Changed
- **Auth moved to httpOnly cookie** — the JWT is no longer stored in `localStorage`; a
  global `fetch` patch attaches the `sq_access_token` cookie + `X‑CSRF‑TOKEN` to every
  backend call and strips legacy `Authorization` headers.
- **HTTP layer consolidated** — screen data loads and mutations now go through
  `services/api.js`; the dead `Bearer null` helpers were removed. Background capability
  probes, the retry wrapper and external (Nominatim) calls intentionally stay raw.
- **UI language** — remaining Spanish strings translated to English across Login, Navbar,
  Messages, Profile, EventModal, ButtonNavbar (comments stay Spanish by convention).

### Fixed
- **Discover** — past events created by business / influencer accounts now disappear like
  any other event (a "today" floor was added, matching the map's rule).
- **Frontend crash** — removed a dead 4Geeks helper component that statically imported a
  deleted asset and broke the whole app on load.
- **Fly.io deploy** — run migrations on every deploy (`release_command`), inject
  `VITE_BACKEND_URL` at build time, and allow the Fly domain in the Socket.IO CORS origins
  (fixes 500s on login/register, a blank frontend, and rejected WebSocket handshakes).

### Removed
- 4Geeks boilerplate leftovers: template README, demo pages/routes, duplicate components,
  and the dead `RecoverPassword` screen (the real reset flow lives in `ResetPassword`).

—

Maintained by **SideQuest Teams**.
