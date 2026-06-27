import os

# Tanda 7V — subida de media a Cloudinary (la lib ya estaba en el
# Pipfile sin usar). Se configura sola desde la env var CLOUDINARY_URL.
import cloudinary
import cloudinary.uploader
import secrets

from flask import Blueprint, request, jsonify, redirect, current_app
from flask_cors import CORS
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity,
    set_access_cookies, unset_jwt_cookies, get_csrf_token,
)
# Tanda 7E — tokens firmados con caducidad para los links de email
# (itsdangerous viene con Flask, sin dependencia nueva).
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import text, bindparam, or_
from api.models import (
    db, User, Event, Friendship, ChatRoom, ChatMessage,
    Notification, EventInvitation, InviteSuggestion,
    ChatRoomMembership, event_participants, Business,
    BusinessPost, Review, EventOpinion, Follow,
    Subscription, FREE_FRIEND_CAP, PREMIUM_FRIEND_CAP,
    TeamMembership, TeamInvite, TEAM_ROLES,
)
# Tanda 7F — Socket.IO: instancia global + helpers (ver api/sockets.py).
from api.sockets import socketio, emit_to_user, allowed_origins
# Tanda 7E — emails transaccionales (ver api/mailer.py).
from api.mailer import (
    mail_configured, frontend_base_url,
    send_verification_email, send_password_reset_email,
)
from datetime import datetime, timedelta

api = Blueprint('api', __name__)

# Tanda 7D — Con cookies de sesión (credentials) el navegador rechaza el
# comodín "*": hay que enumerar orígenes permitidos. En producción
# (Render) el propio Flask sirve el frontend (mismo origen) y CORS ni
# interviene; esta lista cubre el desarrollo en Codespaces y en local.
CORS(
    api,
    supports_credentials=True,
    origins=[
        r"https://.*\.app\.github\.dev",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://localhost:3000",
    ],
)


# Tanda 7D — JWT en cookies httpOnly (el token deja de vivir en
# localStorage, donde cualquier XSS podía leerlo).
#
# app.py es intocable en este proyecto, pero un blueprint puede inyectar
# config en la app durante su registro: record_once corre UNA sola vez,
# antes de servir la primera request — mismo efecto que escribirlo en
# app.py sin tocarlo.
@api.record_once
def _configure_jwt_cookies(state):
    app = state.app
    # "cookies" primero: el navegador adjunta la cookie httpOnly solo.
    # "headers" se mantiene como segunda vía para Postman / clientes API
    # (Authorization: Bearer <token del body del login>).
    app.config["JWT_TOKEN_LOCATION"] = ["cookies", "headers"]
    app.config["JWT_ACCESS_COOKIE_NAME"] = "sq_access_token"
    # Solo HTTPS — Codespaces y Render siempre lo son. (En un http://
    # plano el navegador no guardaría la cookie; ahí usa el flujo
    # Bearer de Postman.)
    app.config["JWT_COOKIE_SECURE"] = True
    # En dev el front (puerto 3000) y la API (3001) viven en subdominios
    # distintos de app.github.dev → la cookie debe ser SameSite=None
    # para viajar cross-origin. En Render (mismo origen) también vale.
    app.config["JWT_COOKIE_SAMESITE"] = "None"
    # Double-submit CSRF: además de la cookie httpOnly, el cliente debe
    # mandar el header X-CSRF-TOKEN en POST/PUT/PATCH/DELETE. Como en
    # dev el front no puede leer cookies del dominio de la API, el
    # login devuelve csrf_token también en el body. El CSRF solo aplica
    # a la vía cookie — la vía Bearer (Postman) queda exenta.
    app.config["JWT_COOKIE_CSRF_PROTECT"] = True


# Tanda 7F — Socket.IO sin tocar app.py: init_app envuelve app.wsgi_app
# con el middleware de socket.io, así el gunicorn / flask run existentes
# sirven también el tráfico de /socket.io. El handshake se autentica con
# la cookie httpOnly (ver api/sockets.py).
@api.record_once
def _init_socketio(state):
    socketio.init_app(state.app, cors_allowed_origins=allowed_origins())


# Tanda 7X — Discover (eventos del mundo, ver api/discover.py): blueprint
# propio registrado con el mismo truco record_once — app.py intacto.
from api.discover import discover_bp  # noqa: E402  (tras crear `api`)


@api.record_once
def _register_discover(state):
    state.app.register_blueprint(discover_bp, url_prefix="/api/discover")


# ── Tanda 7E — tokens de email (firmados + caducidad) ──────
# Firmados con la misma secret del JWT; el "salt" separa los usos para
# que un token de verificación jamás sirva para resetear contraseña.
EMAIL_VERIFY_SALT = "sq-email-verify"
EMAIL_VERIFY_MAX_AGE = 3 * 24 * 3600   # 3 días
PASSWORD_RESET_SALT = "sq-password-reset"
PASSWORD_RESET_MAX_AGE = 3600          # 1 hora


def _email_serializer():
    return URLSafeTimedSerializer(current_app.config["JWT_SECRET_KEY"])


def _make_email_token(user_id, salt, extra=None):
    payload = {"uid": user_id}
    if extra:
        payload.update(extra)
    return _email_serializer().dumps(payload, salt=salt)


def _read_email_token_data(token, salt, max_age):
    """Payload completo del token o None (firma inválida / caducado)."""
    try:
        return _email_serializer().loads(token, salt=salt, max_age=max_age)
    except (BadSignature, SignatureExpired, Exception):
        return None


def _read_email_token(token, salt, max_age):
    """user_id o None (firma inválida / caducado / malformado)."""
    data = _read_email_token_data(token, salt, max_age)
    return data.get("uid") if data else None


# How long a sender can edit their own chat message after posting it.
CHAT_EDIT_WINDOW = timedelta(minutes=15)

# JWT lifetime — coherent across all create_access_token calls.
JWT_LIFETIME = timedelta(days=7)

# Reminder look-ahead window: only "going" events starting within this
# window from now get an event_reminder notif. Bounded per-user and
# idempotent — see _dispatch_my_reminders below.
REMINDER_WINDOW = timedelta(hours=24)


# =========================================================
# NOTIFICATION HELPERS (internal)
# =========================================================

def _create_notification(user_id, notif_type, payload):
    notif = Notification(
        user_id=user_id, type=notif_type,
        payload=payload or {}, is_read=False,
    )
    db.session.add(notif)
    # Tanda 7F — ping en tiempo real a la sala personal del destinatario.
    # Único punto de emisión para TODOS los tipos de notificación. El
    # cliente refetchea /notifications al recibirlo (patrón ping→refetch):
    # si esta transacción aún no comiteó cuando llega el refetch, el poll
    # de fallback lo recoge en el siguiente tick — nunca hay estado
    # inventado en el cliente.
    emit_to_user(user_id, "notification:new", {"type": notif_type})
    return notif


def _delete_friend_request_notifications(friendship_id):
    notifs = Notification.query.filter_by(type="friend_request").all()
    for n in notifs:
        if (n.payload or {}).get("friendship_id") == friendship_id:
            db.session.delete(n)


def _delete_event_invite_notifications(event_id, user_id=None):
    q = Notification.query.filter_by(type="event_invite")
    if user_id is not None:
        q = q.filter_by(user_id=user_id)
    for n in q.all():
        if (n.payload or {}).get("event_id") == event_id:
            db.session.delete(n)


def _delete_invite_suggestion_notifications(event_id, suggestion_id=None):
    """Drop invite_suggestion notifications. If suggestion_id is given,
    only drop the notif for that specific suggestion; otherwise drop every
    invite_suggestion notif for the event."""
    q = Notification.query.filter_by(type="invite_suggestion")
    for n in q.all():
        p = n.payload or {}
        if p.get("event_id") != event_id:
            continue
        if suggestion_id is not None and p.get("suggestion_id") != suggestion_id:
            continue
        db.session.delete(n)


# ─────────────────────────────────────────────────────────
# MARK-AS-READ counterparts to the _delete_* helpers above.
#
# Use these when the user TOOK ACTION on the notification (accepted /
# refused / responded). The notif stays in the bell, just no longer
# bold, so the user can still scroll back and see "I accepted X's
# request yesterday". Only the explicit X button in the UI actually
# removes the row from the DB.
#
# The DELETE helpers are still used when the underlying entity goes
# away (event deleted, friend request cancelled by sender, participant
# kicked) — pointing the user to something that no longer exists makes
# no sense.
# ─────────────────────────────────────────────────────────

def _mark_friend_request_notifications_read(friendship_id, status=None):
    """Mark every friend_request notif for this friendship as read.
    When `status` is given ("accepted" | "refused"), also stamp it into
    the payload so the bell can render an updated label like "X is now
    your friend" instead of the stale "X sent you a friend request"."""
    notifs = Notification.query.filter_by(type="friend_request").all()
    for n in notifs:
        if (n.payload or {}).get("friendship_id") != friendship_id:
            continue
        n.is_read = True
        if status:
            # JSON columns need a fresh dict for SQLAlchemy to detect the
            # mutation and emit an UPDATE — mutating in place is silently
            # ignored by the change tracker.
            payload = dict(n.payload or {})
            payload["status"] = status
            n.payload = payload


def _mark_event_invite_notifications_read(event_id, user_id=None):
    q = Notification.query.filter_by(type="event_invite")
    if user_id is not None:
        q = q.filter_by(user_id=user_id)
    for n in q.all():
        if (n.payload or {}).get("event_id") == event_id:
            n.is_read = True


def _mark_invite_suggestion_notifications_read(event_id, suggestion_id=None):
    """Mark invite_suggestion notifications as read. Same filtering rules
    as `_delete_invite_suggestion_notifications` but non-destructive."""
    q = Notification.query.filter_by(type="invite_suggestion")
    for n in q.all():
        p = n.payload or {}
        if p.get("event_id") != event_id:
            continue
        if suggestion_id is not None and p.get("suggestion_id") != suggestion_id:
            continue
        n.is_read = True


# Lifecycle notifications attached to an event_id via payload. Called from
# delete_event so cancelling an event cleans up its update/reminder/rsvp
# trail too — without these the notifications would dangle after the event
# row is gone (event_id in payload → 404 when clicked).
_EVENT_PAYLOAD_NOTIF_TYPES = (
    "event_updated", "event_cancelled", "event_removed",
    "rsvp_changed", "event_reminder",
)


def _delete_event_payload_notifications(event_id, types=None):
    types = types or _EVENT_PAYLOAD_NOTIF_TYPES
    notifs = Notification.query.filter(Notification.type.in_(types)).all()
    for n in notifs:
        if (n.payload or {}).get("event_id") == event_id:
            db.session.delete(n)


def _notify_event_participants(event, notif_type, payload_extra=None,
                               exclude_user_ids=None):
    """Create a notification for every participant of `event` except the
    creator and any IDs in `exclude_user_ids`. Centralises the payload
    shape for event-wide notifications (updated / cancelled / etc.)."""
    exclude = set(exclude_user_ids or [])
    exclude.add(event.creator_id)
    base = {
        "event_id":    event.id,
        "event_title": event.title,
        "event_date":  event.date,
        "event_time":  event.time,
    }
    base.update(payload_extra or {})
    for p in event.participants:
        if p.id in exclude:
            continue
        _create_notification(
            user_id=p.id, notif_type=notif_type, payload=dict(base))


def _notify_rsvp_changed(event, responder, response):
    """Tell the creator that `responder` answered with `response`.
    No-op if responder IS the creator (no self-pings)."""
    if not event or not responder or responder.id == event.creator_id:
        return
    _create_notification(
        user_id=event.creator_id,
        notif_type="rsvp_changed",
        payload={
            "event_id":        event.id,
            "event_title":     event.title,
            "responder_id":    responder.id,
            "responder_username": responder.username,
            "response":        response,  # going | maybe | not_going
        },
    )


def _dispatch_my_reminders(user_id):
    """Per-user opportunistic reminder dispatcher.

    Called as a side-effect from `GET /api/notifications` and
    `/notifications/unread-count`. The work is bounded by the caller's
    own going-events in the next REMINDER_WINDOW — typically 0-5 events
    — so polling this from the navbar bell has negligible cost.

    Idempotent: a single query collects the user's existing
    event_reminder notifs and we skip every (event, user) pair already
    covered. No global state, no throttle, no cross-user iteration.
    """
    now = datetime.utcnow()
    upper = now + REMINDER_WINDOW

    # 1. The user's own events where they answered "going".
    rows = db.session.execute(
        text(
            "SELECT e.id, e.title, e.date, e.time "
            "FROM event e "
            "JOIN event_participants ep ON ep.event_id = e.id "
            "WHERE ep.user_id = :uid AND ep.rsvp = 'going'"
        ),
        {"uid": user_id},
    ).fetchall()
    if not rows:
        return

    # 2. Which events already have a reminder for this user. Scoped to
    #    `user_id` so the scan stays tiny even on a heavily-used account.
    existing = Notification.query.filter_by(
        user_id=user_id, type="event_reminder",
    ).all()
    sent_event_ids = {
        (n.payload or {}).get("event_id") for n in existing
    }

    # 3. Create the missing ones. Skip past events and events outside
    #    the window. Malformed date/time strings are silently dropped so
    #    a single bad row never breaks the bell's polling.
    created_any = False
    for eid, title, date_s, time_s in rows:
        if eid in sent_event_ids:
            continue
        try:
            event_dt = datetime.strptime(
                "{} {}".format(date_s, (time_s or "")[:5]),
                "%Y-%m-%d %H:%M",
            )
        except (ValueError, TypeError):
            continue
        if not (now <= event_dt <= upper):
            continue
        hours_until = max(0, int((event_dt - now).total_seconds() // 3600))
        _create_notification(
            user_id=user_id,
            notif_type="event_reminder",
            payload={
                "event_id":    eid,
                "event_title": title,
                "event_date":  date_s,
                "event_time":  time_s,
                "hours_until": hours_until,
            },
        )
        created_any = True

    if created_any:
        db.session.commit()


# =========================================================
# PAST-EVENT HELPERS (internal) — Tanda 7B
# =========================================================

def _event_datetime(event):
    """Parse the event's string date/time columns into a datetime.

    Returns None when the strings are malformed — callers must treat
    that as "not past" so a single bad row never blocks anything.
    """
    try:
        return datetime.strptime(
            "{} {}".format(event.date, (event.time or "")[:5]),
            "%Y-%m-%d %H:%M",
        )
    except (ValueError, TypeError):
        # Fallback: date-only (event counts as past from midnight on).
        try:
            return datetime.strptime(event.date, "%Y-%m-%d")
        except (ValueError, TypeError):
            return None


def _event_is_past(event):
    """True when the event's date+time is strictly behind utcnow().

    utcnow() for coherence with the reminder dispatcher above, which
    compares the same string columns against the same clock.
    """
    dt = _event_datetime(event)
    return dt is not None and dt < datetime.utcnow()


# Tanda 7F2 — "event:changed": ping en tiempo real a la AUDIENCIA de un
# evento (creador + participantes + invitados pendientes + amigos del
# creador si es público) cada vez que algo del evento cambia. El cliente
# (Mapview) refetchea /events al recibirlo — el mapa de todos se
# actualiza al instante al crear/editar/borrar/responder. Mismo patrón
# ping→refetch que notification:new y chat:message.

def _event_audience_ids(event):
    ids = {event.creator_id}
    ids.update(p.id for p in event.participants)
    ids.update(inv.user_id for inv in (event.invitations or []))
    if event.is_public:
        ids.update(_get_friend_ids(event.creator_id))
    return ids


def _emit_event_ping(event_or_ids, action, event_id=None):
    """Acepta el objeto Event o un set de user_ids precalculado (útil en
    delete_event, donde la audiencia hay que capturarla ANTES de borrar
    la fila). Best-effort vía emit_to_user — jamás rompe la request."""
    if isinstance(event_or_ids, (set, frozenset, list, tuple)):
        ids, eid = set(event_or_ids), event_id
    else:
        ids, eid = _event_audience_ids(event_or_ids), event_or_ids.id
    for uid in ids:
        emit_to_user(uid, "event:changed", {"event_id": eid, "action": action})


def _dispatch_my_event_confirmations(user_id):
    """Per-creator opportunistic confirmation dispatcher.

    Same lazy pattern as _dispatch_my_reminders: called as a side-effect
    from `GET /api/notifications` and `/notifications/unread-count`, so
    the question pops up in the bell shortly after the event ends —
    no cron needed.

    For every PAST event the user created whose `happened` is still
    NULL, create ONE `event_confirmation` notification asking whether
    the event took place as planned. Idempotent: events that already
    have a confirmation notif for this user are skipped, so answering
    "later" (leaving the notif unread) never duplicates it.
    """
    pending = Event.query.filter(
        Event.creator_id == user_id,
        Event.happened.is_(None),
    ).all()
    if not pending:
        return

    existing = Notification.query.filter_by(
        user_id=user_id, type="event_confirmation",
    ).all()
    asked_event_ids = {
        (n.payload or {}).get("event_id") for n in existing
    }

    created_any = False
    for event in pending:
        if event.id in asked_event_ids:
            continue
        if not _event_is_past(event):
            continue
        _create_notification(
            user_id=user_id,
            notif_type="event_confirmation",
            payload={
                "event_id":    event.id,
                "event_title": event.title,
                "event_date":  event.date,
                "event_time":  event.time,
            },
        )
        created_any = True

    if created_any:
        db.session.commit()


# =========================================================
# CHAT MEMBERSHIP HELPER (internal)
# =========================================================

def _get_or_create_membership(room_id, user_id):
    m = ChatRoomMembership.query.filter_by(
        room_id=room_id, user_id=user_id).first()
    if not m:
        m = ChatRoomMembership(
            room_id=room_id, user_id=user_id, last_read_at=None)
        db.session.add(m)
    return m


def _can_access_room(room, user_id):
    if room.type == "event":
        return room.event is not None and user_id in [p.id for p in room.event.participants]
    if room.type == "dm":
        return user_id in (room.user_a_id, room.user_b_id)
    return False


def _room_member_ids(room):
    """User ids con acceso a la sala (participantes del evento o par del DM)."""
    if room.type == "event":
        return [p.id for p in room.event.participants] if room.event else []
    return [uid for uid in (room.user_a_id, room.user_b_id) if uid is not None]


def _emit_chat_ping(room):
    """Tanda 7F — aviso en tiempo real a todos los miembros de la sala.

    Se emite DESPUÉS del commit del mensaje. Incluye al emisor a
    propósito: así sus otras pestañas/dispositivos también refrescan la
    lista de chats. Payload mínimo {room_id}; el cliente refetchea por
    la API REST (patrón ping→refetch).
    """
    for uid in _room_member_ids(room):
        emit_to_user(uid, "chat:message", {"room_id": room.id})


# =========================================================
# FRIENDSHIP HELPER (internal)
# =========================================================

def _are_friends(user_a_id, user_b_id):
    return Friendship.query.filter(
        Friendship.status == "accepted",
        ((Friendship.requester_id == user_a_id) & (Friendship.addressee_id == user_b_id)) |
        ((Friendship.requester_id == user_b_id) &
         (Friendship.addressee_id == user_a_id))
    ).first() is not None


def _get_friend_ids(user_id):
    """Return the list of user IDs who are accepted friends of `user_id`."""
    rows = Friendship.query.filter(
        Friendship.status == "accepted",
        (Friendship.requester_id == user_id) | (
            Friendship.addressee_id == user_id),
    ).all()
    ids = []
    for f in rows:
        ids.append(f.addressee_id if f.requester_id ==
                   user_id else f.requester_id)
    return ids


def _accepted_friend_count(user_id):
    """How many accepted friends `user_id` currently has. Used to enforce
    the friend cap (free persons: 150; premium persons: 1000)."""
    return Friendship.query.filter(
        Friendship.status == "accepted",
        (Friendship.requester_id == user_id) | (
            Friendship.addressee_id == user_id),
    ).count()


# =========================================================
# HELLO
# =========================================================

@api.route('/hello', methods=['GET'])
def handle_hello():
    return jsonify({"message": "Hello! I'm a message that came from the backend"}), 200


# =========================================================
# REGISTER
# =========================================================

@api.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == "GET":
        return jsonify({
            "endpoint": "/api/register",
            "method": "POST",
            "body": {"email": "test@test.com", "username": "alex", "password": "123456"}
        }), 200

    body = request.get_json() or {}
    email = (body.get("email") or "").strip().lower() or None
    username = (body.get("username") or "").strip() or None
    password = body.get("password")

    # 3-button chooser: person (default) | business | influencer.
    account_type = (body.get("account_type") or "person").strip().lower()
    if account_type not in ("person", "business", "influencer"):
        return jsonify({"msg": "Invalid account_type"}), 400

    # Influencer-only optional fields.
    homebase = (body.get("homebase") or "").strip() or None
    professional_email = (body.get("professional_email") or "").strip().lower() or None

    # #6 — personal identity fields. Mandatory for a regular person sign-up:
    #   name (one full name), birthdate (used as age), gender.
    # Gender is free text so "other" can carry the typed value; the UI
    # offers male / female / non-binary / other.
    full_name = (body.get("name") or "").strip() or None
    birthdate = (body.get("birthdate") or "").strip() or None
    gender = (body.get("gender") or "").strip() or None
    if account_type == "person":
        missing = [k for k, v in
                   (("name", full_name), ("birthdate", birthdate), ("gender", gender))
                   if not v]
        if missing:
            return jsonify({
                "msg": "Please fill in: " + ", ".join(missing)
            }), 400

    # Business: the owner's first business is created together with the
    # account. `business` is an object; only `name` is required here, the
    # richer fields (location, hours, picture, posts) are filled in later.
    business_payload = body.get("business") or {}
    business_name = (business_payload.get("name") or "").strip() or None
    if account_type == "business" and not business_name:
        return jsonify({"msg": "A business name is required to register a company"}), 400

    if not email or not password or not username:
        return jsonify({"msg": "Email, username and password are required"}), 400

    # Tanda 7D — misma regla mínima que reset-password (antes register
    # aceptaba contraseñas de 1 carácter).
    if not isinstance(password, str) or len(password) < 6:
        return jsonify({"msg": "Password must be at least 6 characters"}), 400

    # Quick syntactic check on username — alphanumeric + . _ - allowed.
    import re
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,30}", username):
        return jsonify({
            "msg": "Username must be 3-30 chars (letters, digits, . _ -)"
        }), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "Email already registered"}), 409
    if User.query.filter_by(username=username).first():
        return jsonify({"msg": "Username already taken"}), 409

    new_user = User(
        email=email,
        username=username,
        password=generate_password_hash(password),
        is_active=True,
        # Tanda 7E — nace sin verificar; se confirma con el link del email.
        email_verified=False,
        account_type=account_type,
        # #6 — full name stored in first_name; birthdate doubles as age; gender.
        first_name=full_name,
        birthdate=birthdate,
        gender=gender,
        # Only meaningful for influencers; harmless NULLs otherwise.
        homebase=homebase if account_type == "influencer" else None,
        professional_email=professional_email if account_type == "influencer" else None,
    )
    db.session.add(new_user)
    db.session.commit()

    # Company accounts get their first Business created right away. The
    # owner can add more businesses later (one owner → many businesses).
    business = None
    if account_type == "business":
        business = Business(
            owner_id=new_user.id,
            name=business_name,
            category=(business_payload.get("category") or "").strip() or None,
            location=(business_payload.get("location") or "").strip() or None,
            latitude=business_payload.get("latitude"),
            longitude=business_payload.get("longitude"),
            description=(business_payload.get("description") or "").strip() or None,
            hours=business_payload.get("hours") or {},
            profile_picture_url=(business_payload.get("profile_picture_url") or "").strip() or None,
        )
        db.session.add(business)
        db.session.commit()

    # Tanda 7E — email de confirmación (best-effort: si el SMTP no está
    # configurado o falla, el registro NO se rompe; el front informa).
    email_sent = False
    if mail_configured():
        token = _make_email_token(new_user.id, EMAIL_VERIFY_SALT)
        # El link apunta al BACKEND, que valida y redirige al login del
        # frontend con ?verified=1|0 (un email no puede hacer fetch).
        verify_url = "{}/api/verify-email/{}".format(
            request.url_root.rstrip("/").replace("http://", "https://"), token)
        email_sent = bool(send_verification_email(new_user, verify_url))

    return jsonify({
        "msg": "User registered successfully",
        "user": new_user.serialize(),
        "business": business.serialize() if business else None,
        "verification_email_sent": email_sent,
    }), 201


# Tanda 7E — el usuario clica el link del email: validamos el token y
# redirigimos al login del frontend con el resultado en la query string.
@api.route('/verify-email/<token>', methods=['GET'])
def verify_email(token):
    front = frontend_base_url()
    user_id = _read_email_token(token, EMAIL_VERIFY_SALT, EMAIL_VERIFY_MAX_AGE)
    if not user_id:
        return redirect("{}/login?verified=0".format(front))

    user = db.session.get(User, user_id)
    if not user:
        return redirect("{}/login?verified=0".format(front))

    if not user.email_verified:
        user.email_verified = True
        db.session.commit()
    return redirect("{}/login?verified=1".format(front))


# =========================================================
# LOGIN
# =========================================================

@api.route('/login', methods=['GET', 'POST'])
def login():
    """Login with EITHER email or username.

    Accepts any of these field names for the identifier (frontend can use
    whichever is convenient): `identifier`, `email`, or `username`.
    """
    if request.method == "GET":
        return jsonify({
            "endpoint": "/api/login",
            "method": "POST",
            "body": {"identifier": "test@test.com or username", "password": "123456"}
        }), 200

    body = request.get_json() or {}
    identifier = (
        body.get("identifier")
        or body.get("email")
        or body.get("username")
        or ""
    ).strip()
    password = body.get("password")
    if not identifier or not password:
        return jsonify({"msg": "Email/username and password are required"}), 400

    # Email lookup is case-insensitive (we lowercase on register too).
    lowered = identifier.lower()
    user = User.query.filter(
        or_(User.email == lowered, User.username == identifier)
    ).first()
    if not user or not check_password_hash(user.password, password):
        return jsonify({"msg": "Invalid credentials"}), 401

    access_token = create_access_token(
        identity=str(user.id),
        expires_delta=JWT_LIFETIME,
    )

    # Tanda 7D — la sesión del navegador es la cookie httpOnly (el JS no
    # puede leerla → inmune a exfiltración por XSS). En el body viajan:
    #   - user        → datos de UI que el front persiste
    #   - csrf_token  → anti-CSRF double-submit (header X-CSRF-TOKEN);
    #                   va en el body porque en dev el front no puede
    #                   leer cookies del dominio de la API
    #   - token       → SOLO para Postman/clientes API (vía Bearer).
    #                   El frontend web lo ignora y no lo persiste.
    resp = jsonify({
        "msg":        "Login successful",
        "user":       user.serialize(),
        "csrf_token": get_csrf_token(access_token),
        "token":      access_token,
    })
    set_access_cookies(
        resp, access_token,
        max_age=int(JWT_LIFETIME.total_seconds()),
    )
    return resp, 200


# =========================================================
# LOGOUT — Tanda 7D
# =========================================================

@api.route('/logout', methods=['POST'])
def logout():
    """Borra las cookies de sesión (httpOnly + csrf).

    Sin @jwt_required a propósito: un logout debe funcionar aunque la
    cookie ya haya expirado — siempre responde 200 y deja el navegador
    limpio.
    """
    resp = jsonify({"msg": "Logged out"})
    unset_jwt_cookies(resp)
    return resp, 200


# =========================================================
# MEDIA UPLOAD — Tanda 7V (Cloudinary)
# =========================================================
# Hasta ahora las imágenes (perfil, evento, chat) se guardaban como
# base64 DENTRO de la base de datos y viajaban completas en cada
# respuesta (GET /events con 20 eventos con foto ≈ varios MB). Este
# endpoint las sube a Cloudinary y devuelve la URL hosteada: en la
# base solo se guarda la URL (~100 bytes) y el navegador descarga la
# imagen del CDN, cacheada. Los datos base64 ya existentes siguen
# funcionando (los campos son Text y el front pinta ambos formatos).

@api.route('/upload', methods=['POST'])
@jwt_required()
def upload_media():
    """Body: {"data_url": "data:image/...;base64,....", "kind": "profile"}

    kind ∈ profile | event | chat | audio → carpeta en Cloudinary.
    Devuelve {"url": "https://res.cloudinary.com/..."}.
    """
    if not os.getenv("CLOUDINARY_URL"):
        # Sin credenciales el front cae solo al modo legacy (base64
        # directo a la base) — la app no se rompe, solo no optimiza.
        return jsonify({"msg": "Media uploads not configured (missing CLOUDINARY_URL)"}), 503

    body = request.get_json() or {}
    data_url = body.get("data_url")
    kind = body.get("kind") if body.get("kind") in (
        "profile", "event", "chat", "audio", "proof") else "misc"

    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        return jsonify({"msg": "data_url (base64 data URL) is required"}), 400
    # ~12 MB de base64 ≈ 9 MB reales — tope generoso (el front ya
    # comprime imágenes a ~250-500 KB antes de llegar aquí).
    if len(data_url) > 12_000_000:
        return jsonify({"msg": "File too large"}), 413

    # Los PDF (documentos de prueba) se suben como "raw": Cloudinary bloquea
    # por defecto la ENTREGA de PDFs subidos como imagen, pero los "raw" se
    # sirven sin restricción → el revisor siempre puede abrir la prueba.
    # Imagen / audio / vídeo siguen con "auto".
    is_pdf = data_url[:64].lower().startswith("data:application/pdf")
    try:
        result = cloudinary.uploader.upload(
            data_url,
            folder="sidequest/{}".format(kind),
            # "auto": imagen y audio/vídeo (notas de voz del chat).
            resource_type="raw" if is_pdf else "auto",
        )
    except Exception:
        return jsonify({"msg": "Upload failed"}), 502

    return jsonify({"url": result.get("secure_url")}), 201


# =========================================================
# PASSWORD RECOVERY — Tanda 7E (email-link flow)
# =========================================================
# Sustituye al antiguo POST /reset-password "directo", que permitía a
# CUALQUIERA cambiar la contraseña de un usuario sabiendo su username
# (compromiso MVP documentado). Ahora son dos pasos:
#
#   1. POST /password-recovery {identifier}
#        → si la cuenta existe, envía un email con un link firmado
#          (caducidad 1 h). SIEMPRE responde 200 con el mismo mensaje
#          para no revelar qué emails/usernames existen (anti-enumeración).
#   2. POST /password-reset-confirm {token, password}
#        → valida el token y guarda la nueva contraseña.

@api.route('/password-recovery', methods=['POST'])
def password_recovery():
    if not mail_configured():
        return jsonify({
            "msg": "Password recovery by email is not configured on this server"
        }), 503

    body = request.get_json() or {}
    identifier = (
        body.get("identifier")
        or body.get("email")
        or body.get("username")
        or ""
    ).strip()
    if not identifier:
        return jsonify({"msg": "Email or username is required"}), 400

    lowered = identifier.lower()
    user = User.query.filter(
        or_(User.email == lowered, User.username == identifier)
    ).first()

    if user:
        # Tanda 7H — "un solo uso" sin tablas: el token lleva una huella
        # del hash ACTUAL de la contraseña. Al cambiarla, la huella deja
        # de coincidir → el mismo link ya no vale (ni reutilizado del
        # historial, ni si la contraseña cambió por otra vía).
        token = _make_email_token(
            user.id, PASSWORD_RESET_SALT,
            extra={"pw": (user.password or "")[-12:]},
        )
        # Tanda 7H — token por QUERY STRING, no por path: los tokens de
        # itsdangerous llevan puntos y el dev-server de Vite trata todo
        # path cuyo último segmento contiene "." como un fichero (no
        # aplica el fallback SPA) → 404 al abrir el link del email.
        # La query string no afecta al fallback en ningún servidor.
        reset_url = "{}/reset-password?token={}".format(
            frontend_base_url(), token)
        send_password_reset_email(user, reset_url)

    # Mismo 200 exista o no la cuenta — anti user-enumeration.
    return jsonify({
        "msg": "If that account exists, we've sent a reset link to its email."
    }), 200


@api.route('/password-reset-confirm', methods=['POST'])
def password_reset_confirm():
    body = request.get_json() or {}
    token = body.get("token") or ""
    password = body.get("password") or ""

    if not token or not password:
        return jsonify({"msg": "Token and new password are required"}), 400
    if not isinstance(password, str) or len(password) < 6:
        return jsonify({"msg": "Password must be at least 6 characters"}), 400

    data = _read_email_token_data(
        token, PASSWORD_RESET_SALT, PASSWORD_RESET_MAX_AGE)
    if not data or not data.get("uid"):
        return jsonify({
            "msg": "This reset link is invalid or has expired. Request a new one."
        }), 400

    user = db.session.get(User, data["uid"])
    if not user:
        return jsonify({"msg": "Account no longer exists"}), 404

    # Tanda 7H — un solo uso: si la contraseña ya cambió desde que se
    # emitió el link, la huella no coincide y el token queda inservible.
    if data.get("pw") != (user.password or "")[-12:]:
        return jsonify({
            "msg": "This reset link has already been used. Request a new one."
        }), 400

    user.password = generate_password_hash(password)
    # De paso: si llegó al email, el email es suyo — lo marcamos verificado.
    user.email_verified = True
    db.session.commit()
    return jsonify({"msg": "Password updated. You can now log in."}), 200


# =========================================================
# PRIVATE
# =========================================================

@api.route('/private', methods=['GET'])
@jwt_required()
def private():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"msg": "User not found"}), 404
    return jsonify({"msg": "Private route accessed", "user": user.serialize()}), 200


# =========================================================
# EVENTS
# =========================================================

def _coerce_event_price(creator, body, business=None):
    """Resolve an event's ticket price from the request body.

    Only a PRO creator (a business / influencer with an ACTIVE 'pro'
    subscription) may set a price; for anyone else the field is ignored and
    the event stays free. Returns (price_or_None, error_tuple_or_None) where
    error_tuple is a ready-to-return (response, status).

    NOTE: gating is on `is_pro()` (subscription required) on purpose — priced
    events are the pro monetization hook. To let ANY business/influencer set a
    price without paying, relax the check to
    `creator.account_type in ("business", "influencer")`.
    """
    if "price" not in body:
        return None, None
    raw = body.get("price")
    if raw in (None, ""):
        return None, None  # explicitly clearing the price → free event
    # Pro gate: the actor is pro, OR the event's business is pro (so a team
    # editor of a Pro company can price its events).
    if not ((creator and creator.is_pro()) or (business and business.is_pro())):
        return None, (jsonify({
            "msg": "Only Pro accounts (subscribed business / influencer) can set a ticket price.",
            "code": "pro_required",
        }), 403)
    try:
        price = float(raw)
    except (TypeError, ValueError):
        return None, (jsonify({"msg": "price must be a number"}), 400)
    if price < 0:
        return None, (jsonify({"msg": "price cannot be negative"}), 400)
    return price, None


def _coerce_duration_min(value):
    """Event duration in minutes: a positive int, or None (unknown).

    Not pro-gated — any creator may set it. Feeds the company hub's
    "events at your place" window (see _events_at_place)."""
    if value in (None, ""):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


@api.route('/events', methods=['POST'])
@jwt_required()
def create_event():
    current_user_id = int(get_jwt_identity())
    body = request.get_json() or {}

    required = ["date", "time", "location"]
    if not all(body.get(f) for f in required):
        return jsonify({"msg": "date, time and location are required"}), 400

    creator = db.session.get(User, current_user_id)

    # Pro-only ticket price (ignored / rejected for non-pro creators).
    biz = db.session.get(Business, body.get("business_id")) if body.get("business_id") else None
    # Phase 5b — solo owner/manager/editor del business pueden crear un event
    # atado a ese business (antes no se verificaba → cualquiera podía atarlo).
    if biz and _business_role(current_user_id, biz) not in ("owner", "manager", "editor"):
        return jsonify({
            "msg": "You can't create events for this business.",
            "code": "forbidden",
        }), 403
    price, price_err = _coerce_event_price(creator, body, biz)
    if price_err:
        return price_err

    is_public = bool(body.get("is_public", False))

    event = Event(
        title=body.get("title"),
        date=body["date"],
        time=body["time"],
        location=body["location"],
        latitude=body.get("latitude"),
        longitude=body.get("longitude"),
        details=body.get("details"),
        image=body.get("image"),
        price=price,
        # Optional event duration in minutes (not pro-gated).
        duration_min=_coerce_duration_min(body.get("duration_min")),
        is_public=is_public,
        creator_id=current_user_id,
        # Pro-only private team briefing (ignored for non-pro creators).
        team_note=(body.get("team_note") if (creator and creator.is_pro()) else None),
        # Optional: ties the event to a business so it shows in that
        # business's "events" carousel (set when created from a place page
        # by its owner).
        business_id=body.get("business_id"),
    )
    event.participants.append(creator)
    db.session.add(event)
    db.session.flush()

    # #1 — assign business workers (validated against the business team).
    _set_event_workers(event, body.get("worker_ids"))

    # Auto-mark creator as "going"
    db.session.execute(
        text("UPDATE event_participants SET rsvp = 'going' WHERE event_id = :eid AND user_id = :uid"),
        {"eid": event.id, "uid": current_user_id},
    )

    room = ChatRoom(type="event", event_id=event.id)
    db.session.add(room)

    # Build the list of user IDs to invite.
    #  - Private event: only the friends explicitly chosen in invitedFriends.
    #  - Public event:  every accepted friend of the creator (plus any explicit
    #    picks, deduplicated). This auto-invites the whole friend list so the
    #    event shows up for them as a pending invitation.
    invite_ids = list(body.get("invitedFriends", []))
    if is_public:
        invite_ids = invite_ids + _get_friend_ids(current_user_id)

    # Invitations on creation
    invitations = []
    seen = {current_user_id}
    for friend_id in invite_ids:
        if friend_id in seen:
            continue
        friend = db.session.get(User, friend_id)
        if not friend:
            continue
        if not _are_friends(current_user_id, friend.id):
            continue  # silently skip non-friends
        inv = EventInvitation(
            event_id=event.id, user_id=friend.id, inviter_id=current_user_id)
        db.session.add(inv)
        invitations.append((friend, inv))
        seen.add(friend_id)

    db.session.flush()

    # Notification type differs by visibility so the frontend can label it
    # ("X invited you" vs "X created a public event").
    notif_type = "event_public" if is_public else "event_invite"
    for friend, inv in invitations:
        _create_notification(
            user_id=friend.id,
            notif_type=notif_type,
            payload={
                "event_id": event.id,
                "invitation_id": inv.id,
                "from_user_id": current_user_id,
                "from_username": creator.username,
                "event_title": event.title,
                "event_date": event.date,
                "event_time": event.time,
            },
        )

    db.session.commit()
    _emit_event_ping(event, "created")
    return jsonify({"msg": "Event created", "event": event.serialize(current_user_id=current_user_id)}), 201


@api.route('/events', methods=['GET'])
@jwt_required()
def get_events():
    current_user_id = int(get_jwt_identity())
    # Tanda 7C — Los eventos que el creador marcó como NO realizados
    # (happened == False) desaparecen de la UI (mapa, listas, calendario)
    # pero permanecen en la base como "creado pero cancelado".
    all_events = Event.query.filter(
        or_(Event.happened.is_(None), Event.happened.is_(True))
    ).all()
    visible = []
    for e in all_events:
        if e.creator_id == current_user_id:
            visible.append(e)
            continue
        if current_user_id in [p.id for p in e.participants]:
            visible.append(e)
            continue
        if any(inv.user_id == current_user_id for inv in (e.invitations or [])):
            visible.append(e)

    # Batch-load rsvp values for every visible event in a SINGLE SQL query
    # instead of one query per event in Event.serialize. With N events
    # this turns N queries into 1.
    rsvp_by_event = {}
    if visible:
        event_ids = [e.id for e in visible]
        rows = db.session.execute(
            text(
                "SELECT event_id, user_id, rsvp FROM event_participants "
                "WHERE event_id IN :eids"
            ).bindparams(bindparam("eids", expanding=True)),
            {"eids": event_ids},
        ).fetchall()
        for eid, uid, rsvp in rows:
            rsvp_by_event.setdefault(eid, {})[uid] = rsvp

    return jsonify([
        e.serialize(
            current_user_id=current_user_id,
            rsvp_map=rsvp_by_event.get(e.id, {}),
        )
        for e in visible
    ]), 200


@api.route('/events/<int:event_id>', methods=['GET'])
@jwt_required()
def get_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    is_creator = (event.creator_id == current_user_id)
    is_participant = current_user_id in [p.id for p in event.participants]

    data = event.serialize(current_user_id=current_user_id)
    data["is_creator"] = is_creator
    data["is_participant"] = is_participant

    room = ChatRoom.query.filter_by(type="event", event_id=event_id).first()
    data["chat_room_id"] = room.id if room else None
    return jsonify(data), 200


@api.route('/events/<int:event_id>', methods=['PUT'])
@jwt_required()
def update_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    # Phase 5b — creator OR a team member with editor+ role on the event's
    # business may edit; viewers and outsiders cannot.
    editor_user = db.session.get(User, current_user_id)
    if not _can_edit_event(editor_user, event):
        return jsonify({
            "msg": "You don't have permission to edit this event.",
            "code": "forbidden",
        }), 403

    body = request.get_json() or {}

    # Detect meta changes BEFORE applying them. The participants get a
    # "this event changed" notification only when date / time / location
    # actually move — cosmetic edits (image, details, title) don't ping
    # them so the notif stream stays useful.
    meta_changed_fields = []
    for f in ("date", "time", "location"):
        if f in body and getattr(event, f) != body[f]:
            meta_changed_fields.append(f)

    editable = ["title", "date", "time", "location",
                "latitude", "longitude", "details", "image"]
    for field in editable:
        if field in body:
            setattr(event, field, body[field])

    # Pro-only ticket price (kept out of `editable` because it's gated: only
    # a subscribed business / influencer may set it). Passing price=null/""
    # clears it back to a free event.
    if "price" in body:
        editor = db.session.get(User, current_user_id)
        ev_biz = db.session.get(Business, event.business_id) if event.business_id else None
        price, price_err = _coerce_event_price(editor, body, ev_biz)
        if price_err:
            return price_err
        event.price = price

    # Pro-only private team note (briefing). Same gating as price.
    if "team_note" in body:
        editor = db.session.get(User, current_user_id)
        ev_biz = db.session.get(Business, event.business_id) if event.business_id else None
        if (editor and editor.is_pro()) or (ev_biz and ev_biz.is_pro()):
            event.team_note = (body.get("team_note") or None)

    # Event duration (minutes) — not pro-gated; any creator may set/clear it.
    if "duration_min" in body:
        event.duration_min = _coerce_duration_min(body.get("duration_min"))

    # Handle the public/private toggle. When an event is switched from private
    # to public we auto-invite any friends who aren't already participants or
    # invitees, mirroring the behaviour at creation time.
    if "is_public" in body:
        new_public = bool(body["is_public"])
        was_public = bool(event.is_public)
        event.is_public = new_public

        if new_public and not was_public:
            creator = db.session.get(User, current_user_id)
            existing_participant_ids = {p.id for p in event.participants}
            existing_invite_ids = {
                inv.user_id for inv in (event.invitations or [])}
            new_invites = []
            for friend_id in _get_friend_ids(current_user_id):
                if friend_id in existing_participant_ids or friend_id in existing_invite_ids:
                    continue
                friend = db.session.get(User, friend_id)
                if not friend:
                    continue
                inv = EventInvitation(
                    event_id=event.id, user_id=friend.id, inviter_id=current_user_id
                )
                db.session.add(inv)
                new_invites.append((friend, inv))
            db.session.flush()
            for friend, inv in new_invites:
                _create_notification(
                    user_id=friend.id,
                    notif_type="event_public",
                    payload={
                        "event_id": event.id,
                        "invitation_id": inv.id,
                        "from_user_id": current_user_id,
                        "from_username": creator.username if creator else None,
                        "event_title": event.title,
                        "event_date": event.date,
                        "event_time": event.time,
                    },
                )

    # Notify participants of meaningful changes. Runs AFTER setattr so the
    # payload carries the NEW values (date/time/location).
    if meta_changed_fields:
        creator = db.session.get(User, current_user_id)
        _notify_event_participants(
            event, "event_updated",
            payload_extra={
                "from_user_id":    current_user_id,
                "from_username":      creator.username if creator else None,
                "location":        event.location,
                "changed_fields":  meta_changed_fields,
            },
        )

    # #1 — allow re-assigning workers on edit (business events only).
    _json = request.get_json(silent=True) or {}
    if "worker_ids" in _json:
        _set_event_workers(event, _json.get("worker_ids"))

    db.session.commit()
    _emit_event_ping(event, "updated")
    return jsonify({"msg": "Event updated", "event": event.serialize(current_user_id=current_user_id)}), 200


# ---------- INVITE FRIENDS (creator only, single or batch) ----------
# Body forms accepted:
#   { "user_id":  <int> }                — single (back-compat)
#   { "user_ids": [<int>, <int>, ...] }  — batch
@api.route('/events/<int:event_id>/invite', methods=['POST'])
@jwt_required()
def invite_to_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can invite people"}), 403

    body = request.get_json() or {}
    user_ids = body.get("user_ids")
    if user_ids is None and body.get("user_id") is not None:
        user_ids = [body.get("user_id")]

    if not user_ids or not isinstance(user_ids, list):
        return jsonify({"msg": "user_id or user_ids is required"}), 400

    creator = db.session.get(User, current_user_id)
    participant_ids = {p.id for p in event.participants}
    existing_inv_ids = {inv.user_id for inv in (event.invitations or [])}

    created = []
    skipped = []
    for target_id in user_ids:
        if not isinstance(target_id, int):
            skipped.append({"user_id": target_id, "reason": "invalid user_id"})
            continue
        target = db.session.get(User, target_id)
        if not target:
            skipped.append({"user_id": target_id, "reason": "user not found"})
            continue
        if not _are_friends(current_user_id, target_id):
            skipped.append({"user_id": target_id, "reason": "not your friend"})
            continue
        if target_id in participant_ids:
            skipped.append(
                {"user_id": target_id, "reason": "already participant"})
            continue
        if target_id in existing_inv_ids:
            skipped.append({"user_id": target_id, "reason": "already invited"})
            continue

        inv = EventInvitation(
            event_id=event.id, user_id=target.id, inviter_id=current_user_id)
        db.session.add(inv)
        db.session.flush()
        _create_notification(
            user_id=target.id,
            notif_type="event_invite",
            payload={
                "event_id": event.id,
                "invitation_id": inv.id,
                "from_user_id": current_user_id,
                "from_username": creator.username,
                "event_title": event.title,
                "event_date": event.date,
                "event_time": event.time,
            },
        )
        created.append(inv.serialize())
        existing_inv_ids.add(target_id)

    db.session.commit()
    if created:
        _emit_event_ping(event, "invited")
    return jsonify({
        "msg": f"{len(created)} invitation(s) sent",
        "invitations": created,
        "skipped": skipped,
        "event": event.serialize(current_user_id=current_user_id),
    }), 201 if created else 200


# ---------- UNIFIED RESPONSE TO AN EVENT ----------
# Body: { "response": "going" | "maybe" | "not_going" }
#
# - If the user has a pending EventInvitation:
#     going/maybe  → join participants with that rsvp, drop invitation + notif
#     not_going    → drop invitation + notif (no join)
# - If the user is already a participant:
#     any value    → update their rsvp (stay in event/chat)
#
# Every branch pings the creator with a rsvp_changed notification so they
# always know who answered what (and when somebody flips their answer).
@api.route('/events/<int:event_id>/respond', methods=['PUT'])
@jwt_required()
def respond_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    body = request.get_json() or {}
    response = body.get("response")
    if response not in ("going", "maybe", "not_going"):
        return jsonify({"msg": "response must be one of: going, maybe, not_going"}), 400

    is_participant = current_user_id in [p.id for p in event.participants]
    inv = EventInvitation.query.filter_by(
        event_id=event_id, user_id=current_user_id).first()
    responder = db.session.get(User, current_user_id)

    if inv:
        if response == "not_going":
            # Decline the invitation
            db.session.delete(inv)
            _mark_event_invite_notifications_read(
                event_id, user_id=current_user_id)
            _notify_rsvp_changed(event, responder, "not_going")
            db.session.commit()
            _emit_event_ping(event, "rsvp")
            return jsonify({
                "msg": "Invitation declined",
                "event": event.serialize(current_user_id=current_user_id),
            }), 200
        # going / maybe → join + set rsvp
        if responder not in event.participants:
            event.participants.append(responder)
        db.session.delete(inv)
        _mark_event_invite_notifications_read(
            event_id, user_id=current_user_id)
        db.session.flush()
        db.session.execute(
            text(
                "UPDATE event_participants SET rsvp = :r WHERE event_id = :eid AND user_id = :uid"),
            {"r": response, "eid": event_id, "uid": current_user_id},
        )
        _notify_rsvp_changed(event, responder, response)
        db.session.commit()
        _emit_event_ping(event, "rsvp")
        return jsonify({
            "msg": "Invitation accepted",
            "event": event.serialize(current_user_id=current_user_id),
        }), 200

    if is_participant:
        # IDEMPOTENCIA: leer el rsvp ANTES de actualizar para detectar
        # si el usuario realmente está cambiando su respuesta o si solo
        # hizo click varias veces en la misma. Sin este check, cada
        # click — aunque sea sobre la opción ya activa — genera una
        # notificación nueva para el creador (spam).
        previous_row = db.session.execute(
            text(
                "SELECT rsvp FROM event_participants "
                "WHERE event_id = :eid AND user_id = :uid"),
            {"eid": event_id, "uid": current_user_id},
        ).first()
        previous_rsvp = previous_row[0] if previous_row else None

        db.session.execute(
            text(
                "UPDATE event_participants SET rsvp = :r WHERE event_id = :eid AND user_id = :uid"),
            {"r": response, "eid": event_id, "uid": current_user_id},
        )
        # Solo notificamos al creador si el valor cambió REALMENTE.
        # Mismo click → mismo valor → sin notif duplicada.
        if previous_rsvp != response:
            _notify_rsvp_changed(event, responder, response)
        db.session.commit()
        if previous_rsvp != response:
            _emit_event_ping(event, "rsvp")
        return jsonify({
            "msg": "RSVP updated" if previous_rsvp != response else "RSVP unchanged",
            "event": event.serialize(current_user_id=current_user_id),
        }), 200

    return jsonify({"msg": "No pending invitation and not a participant"}), 404


# ---------- RSVP (legacy, participants only) ----------
@api.route('/events/<int:event_id>/rsvp', methods=['PATCH'])
@jwt_required()
def rsvp_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    if current_user_id not in [p.id for p in event.participants]:
        return jsonify({"msg": "You are not a participant of this event"}), 403

    body = request.get_json() or {}
    rsvp = body.get("rsvp")
    if rsvp not in ("going", "maybe", "not_going"):
        return jsonify({"msg": "rsvp must be one of: going, maybe, not_going"}), 400

    # IDEMPOTENCIA: mismo patrón que respond_event — sin esto, click
    # repetido en el mismo botón crea N notifs duplicadas.
    previous_row = db.session.execute(
        text(
            "SELECT rsvp FROM event_participants "
            "WHERE event_id = :eid AND user_id = :uid"),
        {"eid": event_id, "uid": current_user_id},
    ).first()
    previous_rsvp = previous_row[0] if previous_row else None

    db.session.execute(
        text("UPDATE event_participants SET rsvp = :r WHERE event_id = :eid AND user_id = :uid"),
        {"r": rsvp, "eid": event_id, "uid": current_user_id},
    )
    responder = db.session.get(User, current_user_id)
    if previous_rsvp != rsvp:
        _notify_rsvp_changed(event, responder, rsvp)
    db.session.commit()
    if previous_rsvp != rsvp:
        _emit_event_ping(event, "rsvp")
    return jsonify({
        "msg": "RSVP updated" if previous_rsvp != rsvp else "RSVP unchanged",
        "event": event.serialize(current_user_id=current_user_id),
    }), 200


# ---------- ACCEPT / REFUSE (legacy aliases of /respond) ----------
@api.route('/events/<int:event_id>/accept', methods=['PUT'])
@jwt_required()
def accept_event_invitation(event_id):
    """Legacy: same as POSTing { response: 'going' } to /respond."""
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    inv = EventInvitation.query.filter_by(
        event_id=event_id, user_id=current_user_id).first()
    if not inv:
        return jsonify({"msg": "No pending invitation for this event"}), 404

    user = db.session.get(User, current_user_id)
    if user not in event.participants:
        event.participants.append(user)
    db.session.delete(inv)
    _mark_event_invite_notifications_read(event_id, user_id=current_user_id)
    db.session.flush()
    db.session.execute(
        text("UPDATE event_participants SET rsvp = 'going' WHERE event_id = :eid AND user_id = :uid"),
        {"eid": event_id, "uid": current_user_id},
    )
    _notify_rsvp_changed(event, user, "going")
    db.session.commit()
    _emit_event_ping(event, "rsvp")
    return jsonify({"msg": "Invitation accepted", "event": event.serialize(current_user_id=current_user_id)}), 200


@api.route('/events/<int:event_id>/refuse', methods=['PUT'])
@jwt_required()
def refuse_event_invitation(event_id):
    """Legacy: same as POSTing { response: 'not_going' } to /respond."""
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    inv = EventInvitation.query.filter_by(
        event_id=event_id, user_id=current_user_id).first()
    if not inv:
        return jsonify({"msg": "No pending invitation for this event"}), 404

    responder = db.session.get(User, current_user_id)
    db.session.delete(inv)
    _mark_event_invite_notifications_read(event_id, user_id=current_user_id)
    _notify_rsvp_changed(event, responder, "not_going")
    db.session.commit()
    _emit_event_ping(event, "rsvp")
    return jsonify({"msg": "Invitation refused"}), 200


# ---------- LEAVE EVENT ----------
# Caller leaves the event (drops out of participants + the event chat).
# Same effect as DELETE /events/<id>/participants/<self_id> but easier to call.
@api.route('/events/<int:event_id>/leave', methods=['DELETE'])
@jwt_required()
def leave_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if current_user_id == event.creator_id:
        return jsonify({"msg": "The creator cannot leave their own event"}), 400

    target = next(
        (p for p in event.participants if p.id == current_user_id), None)
    if not target:
        return jsonify({"msg": "You are not a participant of this event"}), 404

    event.participants.remove(target)
    # Drop any pending suggestion they made for this event
    InviteSuggestion.query.filter_by(
        event_id=event_id, suggested_by_id=current_user_id).delete()
    # Tell the creator someone left — semantically a "rsvp_changed → not_going".
    _notify_rsvp_changed(event, target, "not_going")
    db.session.commit()
    _emit_event_ping(event, "left")
    return jsonify({"msg": "Left event", "event_id": event_id}), 200


@api.route('/events/<int:event_id>', methods=['DELETE'])
@jwt_required()
def delete_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    user = db.session.get(User, current_user_id)
    biz = db.session.get(Business, event.business_id) if event.business_id else None
    role = _business_role(current_user_id, biz) if biz else None
    is_creator = event.creator_id == current_user_id

    # Who may TRIGGER a delete at all?
    if biz:
        if not (is_creator or role in ("owner", "manager", "editor")):
            return jsonify({"msg": "You don't have permission to delete this event.",
                            "code": "forbidden"}), 403
    else:
        # Non-business event → only the creator (unchanged behaviour).
        if not is_creator:
            return jsonify({"msg": "Only the creator can delete this event"}), 403

    # Tanda 7B/7C — Past events are history: they can NEVER be deleted.
    if _event_is_past(event):
        return jsonify({
            "msg": "Past events cannot be deleted. Please confirm whether "
                   "the event took place from your notifications instead."
        }), 409

    # Phase 5b — double confirmation for COMPANY events:
    #   owner / manager  → delete directly (their role IS the 2nd confirmation).
    #   editor / non-manager creator → create a pending deletion request that a
    #   manager/owner must approve (POST /events/<id>/deletion/approve).
    direct = (biz is None) or (role in ("owner", "manager"))
    if not direct:
        event.pending_delete_by = current_user_id
        event.pending_delete_at = datetime.utcnow()
        db.session.commit()
        _notify_business_managers(biz, "event_delete_requested", payload_extra={
            "event_id": event.id,
            "event_title": event.title,
            "from_user_id": current_user_id,
            "from_username": user.username if user else None,
        })
        return jsonify({
            "msg": "Deletion requested. A manager must approve it before the event is removed.",
            "code": "pending_approval",
            "event": event.serialize(current_user_id=current_user_id, include_team=True),
        }), 202

    return _perform_event_deletion(event, current_user_id)


def _perform_event_deletion(event, actor_id):
    """Tear an event down and notify everyone. Shared by the direct delete
    (owner/manager / non-business creator) and the approval path."""
    event_id = event.id
    # Tanda 7F2 — capture the audience BEFORE clearing participants / deleting.
    audience = _event_audience_ids(event)
    actor = db.session.get(User, actor_id)

    # Notify participants BEFORE deletion — once the row is gone the payload
    # would be empty.
    _notify_event_participants(
        event, "event_cancelled",
        payload_extra={
            "from_user_id": actor_id,
            "from_username": actor.username if actor else None,
        },
    )

    _delete_event_invite_notifications(event_id)
    _delete_invite_suggestion_notifications(event_id)
    _delete_event_payload_notifications(
        event_id,
        types=("event_updated", "event_removed",
               "rsvp_changed", "event_reminder",
               "event_confirmation"),
    )

    EventInvitation.query.filter_by(event_id=event_id).delete()
    InviteSuggestion.query.filter_by(event_id=event_id).delete()
    event.participants.clear()

    room = ChatRoom.query.filter_by(type="event", event_id=event_id).first()
    if room:
        db.session.delete(room)

    db.session.delete(event)
    db.session.commit()
    _emit_event_ping(audience, "deleted", event_id=event_id)
    return jsonify({"msg": "Event deleted"}), 200


# Tanda 7B — El creador responde a la pregunta "¿el evento pasó como
# previsto?" que le llega por la notificación event_confirmation.
@api.route('/events/<int:event_id>/confirm', methods=['PUT'])
@jwt_required()
def confirm_event(event_id):
    """Body: {"happened": true | false}.

    Only the creator can answer, and only once the event is past.
    The answer is stored on event.happened and the matching
    event_confirmation notification is stamped with payload.response
    ("yes"/"no") + marked read — same keep-the-row pattern as
    friend_request.status, so the bell can show the outcome instead
    of resurrecting the question on the next poll.
    """
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can confirm this event"}), 403
    if not _event_is_past(event):
        return jsonify({"msg": "You can only confirm an event after it has taken place"}), 409

    body = request.get_json() or {}
    happened = body.get("happened")
    if not isinstance(happened, bool):
        return jsonify({"msg": "`happened` must be true or false"}), 400

    event.happened = happened

    # Stamp + mark read the confirmation notif(s) for this event.
    notifs = Notification.query.filter_by(
        user_id=current_user_id, type="event_confirmation",
    ).all()
    for n in notifs:
        if (n.payload or {}).get("event_id") == event_id:
            payload = dict(n.payload or {})
            payload["response"] = "yes" if happened else "no"
            # Reasignar un dict NUEVO — mutar el JSON in-place no dispara
            # el change-tracking de SQLAlchemy y el stamp no se guardaría.
            n.payload = payload
            n.is_read = True

    db.session.commit()
    # Tanda 7F2 — clave cuando happened == False: el evento desaparece de
    # la UI de TODOS (get_events lo filtra) → sus mapas deben refrescar.
    _emit_event_ping(event, "confirmed")
    return jsonify({
        "msg": "Event confirmed" if happened else "Event marked as not happened",
        "event": event.serialize(current_user_id),
    }), 200


@api.route('/events/<int:event_id>/participants/<int:user_id>', methods=['DELETE'])
@jwt_required()
def remove_participant(event_id, user_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    if user_id == event.creator_id:
        return jsonify({"msg": "The creator cannot leave their own event"}), 400

    if current_user_id != event.creator_id and current_user_id != user_id:
        return jsonify({"msg": "Not allowed"}), 403

    # Only the creator kicking someone else counts as a "you were removed"
    # event. Self-leave is already covered by /leave above.
    kicked_by_creator = (
        current_user_id == event.creator_id and current_user_id != user_id
    )
    creator = db.session.get(User, event.creator_id)

    # Accepted participant?
    target = next((p for p in event.participants if p.id == user_id), None)
    if target:
        event.participants.remove(target)
        _delete_event_invite_notifications(event_id, user_id=user_id)
        # Also drop any suggestion the removed user made
        InviteSuggestion.query.filter_by(
            event_id=event_id, suggested_by_id=user_id).delete()
        if kicked_by_creator:
            _create_notification(
                user_id=user_id,
                notif_type="event_removed",
                payload={
                    "event_id":     event.id,
                    "event_title":  event.title,
                    "from_user_id": current_user_id,
                    "from_username":   creator.username if creator else None,
                },
            )
        db.session.commit()
        # El expulsado ya no está en la audiencia — ping aparte para él.
        _emit_event_ping(event, "removed")
        emit_to_user(user_id, "event:changed",
                     {"event_id": event.id, "action": "removed"})
        return jsonify({"msg": "Participant removed", "event": event.serialize(current_user_id=current_user_id)}), 200

    # Pending invitee?
    inv = EventInvitation.query.filter_by(
        event_id=event_id, user_id=user_id).first()
    if inv:
        db.session.delete(inv)
        _delete_event_invite_notifications(event_id, user_id=user_id)
        if kicked_by_creator:
            _create_notification(
                user_id=user_id,
                notif_type="event_removed",
                payload={
                    "event_id":     event.id,
                    "event_title":  event.title,
                    "from_user_id": current_user_id,
                    "from_username":   creator.username if creator else None,
                },
            )
        db.session.commit()
        _emit_event_ping(event, "removed")
        emit_to_user(user_id, "event:changed",
                     {"event_id": event.id, "action": "removed"})
        return jsonify({"msg": "Invitation cancelled", "event": event.serialize(current_user_id=current_user_id)}), 200

    return jsonify({"msg": "User is not a participant nor invited"}), 404


# =========================================================
# INVITE SUGGESTIONS
# =========================================================
# Flow:
#   - A participant (non-creator) suggests inviting one or more friends.
#     → POST /events/<id>/suggest-invite {user_ids: [...]}
#     → InviteSuggestion rows + a single "invite_suggestion" notif per
#       suggestion to the creator.
#   - The creator reviews and approves/refuses each, or approves all.
#     → Approve → convert to real EventInvitation + notif to the friend
#                 + "suggestion_approved" notif back to the suggester.
#     → Refuse  → drop the suggestion (and its notif)
#                 + "suggestion_refused" notif back to the suggester.

@api.route('/events/<int:event_id>/suggest-invite', methods=['POST'])
@jwt_required()
def suggest_invite_to_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if current_user_id == event.creator_id:
        return jsonify({"msg": "Use /invite instead — you are the creator"}), 400
    if current_user_id not in [p.id for p in event.participants]:
        return jsonify({"msg": "Only participants can suggest invites"}), 403

    body = request.get_json() or {}
    user_ids = body.get("user_ids")
    if user_ids is None and body.get("user_id") is not None:
        user_ids = [body.get("user_id")]
    if not user_ids or not isinstance(user_ids, list):
        return jsonify({"msg": "user_id or user_ids is required"}), 400

    me = db.session.get(User, current_user_id)
    participant_ids = {p.id for p in event.participants}
    existing_inv_ids = {inv.user_id for inv in (event.invitations or [])}
    existing_sug_ids = {s.suggested_user_id for s in (event.suggestions or [])}

    created = []
    skipped = []
    for target_id in user_ids:
        if not isinstance(target_id, int):
            skipped.append({"user_id": target_id, "reason": "invalid user_id"})
            continue
        if target_id == event.creator_id:
            skipped.append({"user_id": target_id, "reason": "creator"})
            continue
        target = db.session.get(User, target_id)
        if not target:
            skipped.append({"user_id": target_id, "reason": "user not found"})
            continue
        if not _are_friends(current_user_id, target_id):
            skipped.append({"user_id": target_id, "reason": "not your friend"})
            continue
        if target_id in participant_ids:
            skipped.append(
                {"user_id": target_id, "reason": "already participant"})
            continue
        if target_id in existing_inv_ids:
            skipped.append({"user_id": target_id, "reason": "already invited"})
            continue
        if target_id in existing_sug_ids:
            skipped.append(
                {"user_id": target_id, "reason": "already suggested"})
            continue

        sug = InviteSuggestion(
            event_id=event.id,
            suggested_user_id=target.id,
            suggested_by_id=current_user_id,
        )
        db.session.add(sug)
        db.session.flush()
        _create_notification(
            user_id=event.creator_id,
            notif_type="invite_suggestion",
            payload={
                "event_id":              event.id,
                "suggestion_id":         sug.id,
                "suggested_user_id":     target.id,
                "suggested_username":  target.username,
                "from_user_id":          current_user_id,
                "from_username":            me.username,
                "event_title":           event.title,
            },
        )
        created.append(sug.serialize())
        existing_sug_ids.add(target_id)

    db.session.commit()
    return jsonify({
        "msg": f"{len(created)} suggestion(s) sent",
        "suggestions": created,
        "skipped": skipped,
    }), 201 if created else 200


@api.route('/events/<int:event_id>/suggestions', methods=['GET'])
@jwt_required()
def list_event_suggestions(event_id):
    """Creator-only: list pending invite-suggestions for the event."""
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can view suggestions"}), 403

    out = []
    for s in (event.suggestions or []):
        out.append({
            "id":                  s.id,
            "event_id":            s.event_id,
            "suggested_user_id":   s.suggested_user_id,
            "suggested_user":      s.suggested_user.public_brief() if s.suggested_user else None,
            "suggested_by_id":     s.suggested_by_id,
            "suggested_by":        s.suggested_by.public_brief() if s.suggested_by else None,
            "created_at":          s.created_at.isoformat() + "Z" if s.created_at else None,
        })
    return jsonify(out), 200


def _approve_suggestion_internal(event, sug):
    """Convert a suggestion into a real EventInvitation + notif to the
    friend AND a suggestion_approved notif back to the suggester. Caller
    commits."""
    creator = event.creator
    target = sug.suggested_user
    suggester_id = sug.suggested_by_id
    suggester_user = sug.suggested_by
    target_id_snapshot = sug.suggested_user_id
    target_username_snapshot = target.username if target else None

    if not target:
        # Suggested user got deleted in the meantime — drop the suggestion
        # silently. No notifications.
        _delete_invite_suggestion_notifications(event.id, suggestion_id=sug.id)
        db.session.delete(sug)
        return None

    # If somehow the user is already participant or invited, just drop the
    # suggestion. Still notify the suggester so they know we processed it.
    if target.id in [p.id for p in event.participants]:
        _mark_invite_suggestion_notifications_read(
            event.id, suggestion_id=sug.id)
        db.session.delete(sug)
        if suggester_id and suggester_id != event.creator_id:
            _create_notification(
                user_id=suggester_id,
                notif_type="suggestion_approved",
                payload={
                    "event_id":              event.id,
                    "event_title":           event.title,
                    "suggested_user_id":     target_id_snapshot,
                    "suggested_username":  target_username_snapshot,
                    "from_user_id":          event.creator_id,
                    "from_username":            creator.username if creator else None,
                    "already_member":        True,
                },
            )
        return None

    existing_inv = EventInvitation.query.filter_by(
        event_id=event.id, user_id=target.id
    ).first()
    if existing_inv:
        _mark_invite_suggestion_notifications_read(
            event.id, suggestion_id=sug.id)
        db.session.delete(sug)
        if suggester_id and suggester_id != event.creator_id:
            _create_notification(
                user_id=suggester_id,
                notif_type="suggestion_approved",
                payload={
                    "event_id":              event.id,
                    "event_title":           event.title,
                    "suggested_user_id":     target_id_snapshot,
                    "suggested_username":  target_username_snapshot,
                    "from_user_id":          event.creator_id,
                    "from_username":            creator.username if creator else None,
                    "already_invited":       True,
                },
            )
        return existing_inv

    inv = EventInvitation(
        event_id=event.id, user_id=target.id, inviter_id=event.creator_id,
    )
    db.session.add(inv)
    db.session.flush()
    _create_notification(
        user_id=target.id,
        notif_type="event_invite",
        payload={
            "event_id":      event.id,
            "invitation_id": inv.id,
            "from_user_id":  event.creator_id,
            "from_username":    creator.username if creator else None,
            "event_title":   event.title,
            "event_date":    event.date,
            "event_time":    event.time,
        },
    )
    if suggester_id and suggester_id != event.creator_id:
        _create_notification(
            user_id=suggester_id,
            notif_type="suggestion_approved",
            payload={
                "event_id":              event.id,
                "event_title":           event.title,
                "suggested_user_id":     target_id_snapshot,
                "suggested_username":  target_username_snapshot,
                "from_user_id":          event.creator_id,
                "from_username":            creator.username if creator else None,
            },
        )
    _mark_invite_suggestion_notifications_read(event.id, suggestion_id=sug.id)
    db.session.delete(sug)
    return inv


@api.route('/events/<int:event_id>/suggestions/<int:suggestion_id>/approve', methods=['PUT'])
@jwt_required()
def approve_suggestion(event_id, suggestion_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can approve suggestions"}), 403

    sug = db.session.get(InviteSuggestion, suggestion_id)
    if not sug or sug.event_id != event_id:
        return jsonify({"msg": "Suggestion not found"}), 404

    inv = _approve_suggestion_internal(event, sug)
    db.session.commit()
    # Tanda 7F2 — el sugerido ahora tiene invitación pendiente: su mapa
    # (filtro "Invited") y el badge del creador deben refrescar.
    _emit_event_ping(event, "invited")
    return jsonify({
        "msg": "Suggestion approved",
        "invitation": inv.serialize() if inv else None,
        "event": event.serialize(current_user_id=current_user_id),
    }), 200


@api.route('/events/<int:event_id>/suggestions/<int:suggestion_id>/refuse', methods=['PUT'])
@jwt_required()
def refuse_suggestion(event_id, suggestion_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can refuse suggestions"}), 403

    sug = db.session.get(InviteSuggestion, suggestion_id)
    if not sug or sug.event_id != event_id:
        return jsonify({"msg": "Suggestion not found"}), 404

    # Snapshot fields the suggester wants to see in their notification
    # BEFORE we delete the row.
    creator = db.session.get(User, current_user_id)
    suggester_id = sug.suggested_by_id
    target_snapshot = sug.suggested_user
    target_id_snap = sug.suggested_user_id
    target_username_snap = target_snapshot.username if target_snapshot else None

    _mark_invite_suggestion_notifications_read(
        event_id, suggestion_id=suggestion_id)
    db.session.delete(sug)

    if suggester_id and suggester_id != event.creator_id:
        _create_notification(
            user_id=suggester_id,
            notif_type="suggestion_refused",
            payload={
                "event_id":              event_id,
                "event_title":           event.title,
                "suggested_user_id":     target_id_snap,
                "suggested_username":  target_username_snap,
                "from_user_id":          current_user_id,
                "from_username":            creator.username if creator else None,
            },
        )

    db.session.commit()
    return jsonify({
        "msg": "Suggestion refused",
        "event": event.serialize(current_user_id=current_user_id),
    }), 200


@api.route('/events/<int:event_id>/suggestions/approve-all', methods=['PUT'])
@jwt_required()
def approve_all_suggestions(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can approve suggestions"}), 403

    suggestions = list(event.suggestions or [])
    converted = []
    for sug in suggestions:
        inv = _approve_suggestion_internal(event, sug)
        if inv:
            converted.append(inv.serialize())

    db.session.commit()
    if converted:
        _emit_event_ping(event, "invited")
    return jsonify({
        "msg": f"{len(converted)} suggestion(s) approved",
        "invitations": converted,
        "event": event.serialize(current_user_id=current_user_id),
    }), 200


@api.route('/events/<int:event_id>/suggestions/refuse-all', methods=['PUT'])
@jwt_required()
def refuse_all_suggestions(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can refuse suggestions"}), 403

    creator = db.session.get(User, current_user_id)

    # Snapshot suggesters + targets before we delete so each suggester gets
    # a proper notification with payload (event_id alone wouldn't be enough
    # if the frontend later wants to render which friend was refused).
    pending = list(event.suggestions or [])
    snapshots = [
        {
            "suggester_id":     s.suggested_by_id,
            "target_id":        s.suggested_user_id,
            "target_username":     s.suggested_user.username if s.suggested_user else None,
        }
        for s in pending
    ]

    _mark_invite_suggestion_notifications_read(event_id)
    count = InviteSuggestion.query.filter_by(event_id=event_id).delete()

    for snap in snapshots:
        sid = snap["suggester_id"]
        if sid and sid != event.creator_id:
            _create_notification(
                user_id=sid,
                notif_type="suggestion_refused",
                payload={
                    "event_id":              event_id,
                    "event_title":           event.title,
                    "suggested_user_id":     snap["target_id"],
                    "suggested_username":  snap["target_username"],
                    "from_user_id":          current_user_id,
                    "from_username":            creator.username if creator else None,
                },
            )

    db.session.commit()
    return jsonify({
        "msg": f"{count} suggestion(s) refused",
        "event": event.serialize(current_user_id=current_user_id),
    }), 200


# =========================================================
# FRIENDS
# =========================================================

@api.route('/friends', methods=['GET'])
@jwt_required()
def list_friends():
    current_user_id = int(get_jwt_identity())
    friendships = Friendship.query.filter(
        Friendship.status == "accepted",
        (Friendship.requester_id == current_user_id) | (
            Friendship.addressee_id == current_user_id)
    ).all()
    data = [f.serialize(current_user_id=current_user_id) for f in friendships]

    # Tanda 7C — Reward visible entre amigos: añadimos el nivel de
    # actividad de cada amigo (aro de color del avatar en el frontend).
    # Una sola query agrupada para toda la lista — ver _activity_levels_for.
    friend_ids = [d["friend"]["id"] for d in data if d.get("friend")]
    levels = _activity_levels_for(friend_ids)
    for d in data:
        if d.get("friend"):
            d["friend"]["activity_level"] = levels.get(
                d["friend"]["id"], "Low activity")

    return jsonify(data), 200


@api.route('/friends/requests', methods=['GET'])
@jwt_required()
def list_friend_requests():
    current_user_id = int(get_jwt_identity())
    direction = request.args.get("direction", "incoming").lower()
    base = Friendship.query.filter(Friendship.status == "pending")

    if direction == "incoming":
        base = base.filter(Friendship.addressee_id == current_user_id)
    elif direction == "outgoing":
        base = base.filter(Friendship.requester_id == current_user_id)
    elif direction == "all":
        base = base.filter(
            (Friendship.requester_id == current_user_id) | (
                Friendship.addressee_id == current_user_id)
        )
    else:
        return jsonify({"msg": "direction must be incoming, outgoing or all"}), 400

    return jsonify([f.serialize(current_user_id=current_user_id) for f in base.all()]), 200


@api.route('/friends/requests', methods=['POST'])
@jwt_required()
def send_friend_request():
    current_user_id = int(get_jwt_identity())
    body = request.get_json() or {}

    target = None
    if body.get("user_id"):
        target = db.session.get(User, body["user_id"])
    elif body.get("email"):
        target = User.query.filter_by(email=body["email"]).first()

    if not target:
        return jsonify({"msg": "Target user not found"}), 404
    if target.id == current_user_id:
        return jsonify({"msg": "You cannot friend yourself"}), 400

    existing = Friendship.query.filter(
        ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == target.id)) |
        ((Friendship.requester_id == target.id) &
         (Friendship.addressee_id == current_user_id))
    ).first()

    me = db.session.get(User, current_user_id)

    # Friend cap: a user who is already full can't take on new friends.
    # Checked at send time so we never create a request that could never be
    # accepted. Premium persons (and business/influencer) have a higher cap.
    if _accepted_friend_count(current_user_id) >= me.friend_cap():
        return jsonify({
            "msg": "You've reached your friend limit of {}. Upgrade to premium to add more friends.".format(me.friend_cap()),
            "code": "friend_cap_reached",
            "cap": me.friend_cap(),
        }), 403

    if existing:
        if existing.status == "accepted":
            return jsonify({
                "msg": "You are already friends",
                "friendship": existing.serialize(current_user_id=current_user_id),
            }), 409
        if existing.status == "pending":
            return jsonify({
                "msg": "A request is already pending",
                "friendship": existing.serialize(current_user_id=current_user_id),
            }), 409
        existing.requester_id = current_user_id
        existing.addressee_id = target.id
        existing.status = "pending"
        _create_notification(
            user_id=target.id,
            notif_type="friend_request",
            payload={"friendship_id": existing.id,
                     "from_user_id": current_user_id, "from_username": me.username},
        )
        db.session.commit()
        return jsonify({
            "msg": "Friend request re-sent",
            "friendship": existing.serialize(current_user_id=current_user_id),
        }), 201

    new_friendship = Friendship(
        requester_id=current_user_id, addressee_id=target.id, status="pending")
    db.session.add(new_friendship)
    db.session.flush()

    _create_notification(
        user_id=target.id,
        notif_type="friend_request",
        payload={"friendship_id": new_friendship.id,
                 "from_user_id": current_user_id, "from_username": me.username},
    )

    db.session.commit()
    return jsonify({
        "msg": "Friend request sent",
        "friendship": new_friendship.serialize(current_user_id=current_user_id),
    }), 201


@api.route('/friends/requests/<int:request_id>/accept', methods=['PUT'])
@jwt_required()
def accept_friend_request(request_id):
    current_user_id = int(get_jwt_identity())
    friendship = db.session.get(Friendship, request_id)
    if not friendship:
        return jsonify({"msg": "Request not found"}), 404
    if friendship.addressee_id != current_user_id:
        return jsonify({"msg": "Only the addressee can accept this request"}), 403
    if friendship.status != "pending":
        return jsonify({"msg": f"Request is already {friendship.status}"}), 409

    # Friend cap on BOTH sides — accepting turns them into friends, so each
    # must have room. Either side may have filled up since the request was
    # sent. Premium persons (and business/influencer) get the higher cap.
    accepter = db.session.get(User, current_user_id)
    if _accepted_friend_count(current_user_id) >= accepter.friend_cap():
        return jsonify({
            "msg": "You've reached your friend limit of {}. Upgrade to premium to add more friends.".format(accepter.friend_cap()),
            "code": "friend_cap_reached",
            "cap": accepter.friend_cap(),
        }), 403
    requester = db.session.get(User, friendship.requester_id)
    if requester and _accepted_friend_count(requester.id) >= requester.friend_cap():
        return jsonify({
            "msg": "{} has reached their friend limit, so this request can't be accepted right now.".format(requester.username or "This user"),
            "code": "friend_cap_reached_other",
        }), 409

    friendship.status = "accepted"
    _mark_friend_request_notifications_read(friendship.id, status="accepted")

    # Tell the original requester their request was accepted. The notif
    # closes the loop UX-wise: until now they only saw "outgoing pending".
    me = db.session.get(User, current_user_id)
    _create_notification(
        user_id=friendship.requester_id,
        notif_type="friend_accepted",
        payload={
            "friendship_id": friendship.id,
            "from_user_id":  current_user_id,
            "from_username":    me.username if me else None,
        },
    )

    db.session.commit()
    return jsonify({
        "msg": "Friend request accepted",
        "friendship": friendship.serialize(current_user_id=current_user_id),
    }), 200


@api.route('/friends/requests/<int:request_id>/refuse', methods=['PUT'])
@jwt_required()
def refuse_friend_request(request_id):
    current_user_id = int(get_jwt_identity())
    friendship = db.session.get(Friendship, request_id)
    if not friendship:
        return jsonify({"msg": "Request not found"}), 404
    if friendship.addressee_id != current_user_id:
        return jsonify({"msg": "Only the addressee can refuse this request"}), 403
    if friendship.status != "pending":
        return jsonify({"msg": f"Request is already {friendship.status}"}), 409

    friendship.status = "refused"
    _mark_friend_request_notifications_read(friendship.id, status="refused")
    db.session.commit()
    return jsonify({
        "msg": "Friend request refused",
        "friendship": friendship.serialize(current_user_id=current_user_id),
    }), 200


@api.route('/friends/requests/<int:request_id>', methods=['DELETE'])
@jwt_required()
def cancel_friend_request(request_id):
    current_user_id = int(get_jwt_identity())
    friendship = db.session.get(Friendship, request_id)
    if not friendship:
        return jsonify({"msg": "Request not found"}), 404
    if friendship.requester_id != current_user_id:
        return jsonify({"msg": "Only the requester can cancel this request"}), 403
    if friendship.status != "pending":
        return jsonify({"msg": f"Request is already {friendship.status} and cannot be cancelled"}), 409

    _delete_friend_request_notifications(friendship.id)
    db.session.delete(friendship)
    db.session.commit()
    return jsonify({"msg": "Friend request cancelled"}), 200


@api.route('/friends/<int:user_id>', methods=['DELETE'])
@jwt_required()
def unfriend(user_id):
    current_user_id = int(get_jwt_identity())
    friendship = Friendship.query.filter(
        Friendship.status == "accepted",
        ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == user_id)) |
        ((Friendship.requester_id == user_id) &
         (Friendship.addressee_id == current_user_id))
    ).first()
    if not friendship:
        return jsonify({"msg": "Friendship not found"}), 404
    db.session.delete(friendship)
    db.session.commit()
    return jsonify({"msg": "Friend removed"}), 200


@api.route('/friends/search', methods=['GET'])
@jwt_required()
def search_users():
    current_user_id = int(get_jwt_identity())
    q = (request.args.get("q") or "").strip()
    if len(q) < 3:
        return jsonify({"msg": "q must be at least 3 characters"}), 400

    # Only personal accounts are friendable — business & influencer
    # accounts have followers, not friends, so they never appear here.
    users = (User.query
             .filter(
                 User.id != current_user_id,
                 User.username.ilike(f"%{q}%"),
                 or_(User.account_type == "person", User.account_type.is_(None)),
             )
             .limit(20)
             .all())

    results = []
    for u in users:
        pair = Friendship.query.filter(
            ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == u.id)) |
            ((Friendship.requester_id == u.id) &
             (Friendship.addressee_id == current_user_id))
        ).first()
        results.append({
            "id": u.id,
            "username": u.username,
            "status": pair.status if pair else "none",
            "direction": (
                "outgoing" if pair and pair.requester_id == current_user_id
                else "incoming" if pair and pair.addressee_id == current_user_id
                else None
            ),
            "friendship_id": pair.id if pair else None,
        })
    return jsonify(results), 200


# =========================================================
# PROFILE
# =========================================================

# Tanda 7C — Niveles de actividad = etapas de la reward. La paleta del
# frontend (aro del avatar) está mapeada 1:1 a estos strings:
#   "Low activity"  → aro gris      (< 2 eventos/semana en 4 semanas)
#   "Active"        → aro cian      (2 - 3 eventos/semana)
#   "Very active"   → aro verde     (≥ 3 eventos/semana)
def _level_from_avg(avg_per_week):
    if avg_per_week < 2:
        return "Low activity"
    if avg_per_week < 3:
        return "Active"
    return "Very active"


def _activity_levels_for(user_ids):
    """Activity level for MANY users in one grouped query.

    Used by list_friends so the reward ring shows on every friend card
    without computing a full per-friend profile (no N+1). Same window
    and rules as _compute_stats: last 4 weeks, past events only, and
    events marked as not-happened count for nothing.
    """
    user_ids = [uid for uid in user_ids if uid is not None]
    if not user_ids:
        return {}

    today = datetime.utcnow().date()
    window_start = today - timedelta(weeks=4)

    # Las fechas son strings ISO ("YYYY-MM-DD"): comparan correctamente
    # como texto plano, así el filtro corre entero en SQL.
    rows = db.session.execute(
        text(
            "SELECT ep.user_id, COUNT(*) "
            "FROM event_participants ep "
            "JOIN event e ON e.id = ep.event_id "
            "WHERE ep.user_id IN :uids "
            "  AND e.date >= :wstart AND e.date <= :today "
            "  AND (e.happened IS NULL OR e.happened = :t) "
            "GROUP BY ep.user_id"
        ).bindparams(bindparam("uids", expanding=True)),
        {
            "uids":   user_ids,
            "wstart": window_start.isoformat(),
            "today":  today.isoformat(),
            "t":      True,
        },
    ).fetchall()
    recent_counts = {row[0]: row[1] for row in rows}

    return {
        uid: _level_from_avg(round(recent_counts.get(uid, 0) / 4.0, 2))
        for uid in user_ids
    }


def _compute_stats(user_id):
    """Aggregate activity stats for one user.

    Tanda 7C — two changes vs the original:
      * Events the creator marked as NOT happened (happened == False)
        count for NOTHING: ni created, ni participated, ni nivel. Siguen
        en la base como "creado pero cancelado" (dato para más adelante).
      * The old version loaded EVERY event in the database to count one
        user's participations; rewritten as aggregate SQL so profiles and
        the friends list stay fast as the table grows.
    """
    today = datetime.utcnow().date()
    window_start = today - timedelta(weeks=4)

    events_created_count = Event.query.filter(
        Event.creator_id == user_id,
        or_(Event.happened.is_(None), Event.happened.is_(True)),
    ).count()

    # Participated = eventos pasados (date <= hoy, mismo criterio que la
    # versión anterior) donde el user figura en event_participants y el
    # evento no fue cancelado. Fechas ISO → comparación como string.
    row = db.session.execute(
        text(
            "SELECT COUNT(*), "
            "       SUM(CASE WHEN e.date >= :wstart THEN 1 ELSE 0 END) "
            "FROM event_participants ep "
            "JOIN event e ON e.id = ep.event_id "
            "WHERE ep.user_id = :uid "
            "  AND e.date <= :today "
            "  AND (e.happened IS NULL OR e.happened = :t)"
        ),
        {
            "uid":    user_id,
            "wstart": window_start.isoformat(),
            "today":  today.isoformat(),
            "t":      True,
        },
    ).fetchone()
    events_participated_count = int(row[0] or 0)
    recent_count = int(row[1] or 0)

    activity_avg_per_week = round(recent_count / 4.0, 2)
    activity_level = _level_from_avg(activity_avg_per_week)
    activity_percent = min(100, int((activity_avg_per_week / 5.0) * 100))

    return {
        "events_created_count":      events_created_count,
        "events_participated_count": events_participated_count,
        "activity_avg_per_week":     activity_avg_per_week,
        "activity_level":            activity_level,
        "activity_percent":          activity_percent,
    }


@api.route('/profile/me', methods=['GET'])
@jwt_required()
def get_my_profile():
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
    data = user.serialize()
    data["stats"] = _compute_stats(current_user_id)
    return jsonify(data), 200


@api.route('/profile/me', methods=['PUT'])
@jwt_required()
def update_my_profile():
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404

    body = request.get_json() or {}
    editable = ["username", "first_name", "last_name", "city", "bio",
                "profile_picture_url", "birthdate", "phone"]

    new_username = body.get("username")
    if new_username and new_username != user.username:
        clash = User.query.filter(
            User.username == new_username, User.id != current_user_id).first()
        if clash:
            return jsonify({"msg": "Username already taken"}), 409

    for field in editable:
        if field in body:
            value = body[field]
            setattr(user, field, value if value not in ("", None) else None)

    db.session.commit()
    return jsonify({"msg": "Profile updated", "user": user.serialize()}), 200


@api.route('/profile/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user_profile(user_id):
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404

    friendship = None
    if user_id != current_user_id:
        friendship = Friendship.query.filter(
            ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == user_id)) |
            ((Friendship.requester_id == user_id) &
             (Friendship.addressee_id == current_user_id))
        ).first()

    is_self = (user_id == current_user_id)
    is_friend = friendship is not None and friendship.status == "accepted"

    data = {
        "id":                  user.id,
        "username":            user.username,
        "first_name":          user.first_name,
        "last_name":           user.last_name,
        "city":                user.city,
        "bio":                 user.bio,
        "profile_picture_url": user.profile_picture_url,
        # Premium cosmetics are public (the point is friends see your coins).
        "account_type":        user.account_type or "person",
        "premium_coins":       user.premium_coins or 0,
        "is_premium":          user.is_premium(),
        "is_pro":              user.is_pro(),
        "created_at":          user.created_at.isoformat() + "Z" if user.created_at else None,
    }
    if is_self:
        data["email"] = user.email
    if is_self or is_friend:
        data["phone"] = user.phone
        data["birthdate"] = user.birthdate

    if is_self:
        data["friendship_status"] = "self"
        data["friendship_direction"] = None
        data["friendship_id"] = None
    elif friendship:
        data["friendship_status"] = friendship.status
        data["friendship_direction"] = "outgoing" if friendship.requester_id == current_user_id else "incoming"
        data["friendship_id"] = friendship.id
    else:
        data["friendship_status"] = "none"
        data["friendship_direction"] = None
        data["friendship_id"] = None

    data["stats"] = _compute_stats(user_id)
    return jsonify(data), 200


# =========================================================
# CHAT
# =========================================================

@api.route('/chat/rooms', methods=['GET'])
@jwt_required()
def list_chat_rooms():
    current_user_id = int(get_jwt_identity())
    all_rooms = ChatRoom.query.all()
    visible = [r for r in all_rooms if _can_access_room(r, current_user_id)]

    def _sort_key(r):
        last = next((m for m in reversed(r.messages) if not m.deleted), None)
        return last.created_at if last else r.created_at

    visible.sort(key=_sort_key, reverse=True)
    return jsonify([r.serialize(current_user_id=current_user_id) for r in visible]), 200


@api.route('/chat/unread-count', methods=['GET'])
@jwt_required()
def chat_unread_count():
    current_user_id = int(get_jwt_identity())
    all_rooms = ChatRoom.query.all()
    total = 0
    for r in all_rooms:
        if not _can_access_room(r, current_user_id):
            continue
        membership = next(
            (m for m in r.memberships if m.user_id == current_user_id), None)
        last_read_at = membership.last_read_at if membership else None
        for msg in r.messages:
            if msg.sender_id == current_user_id or msg.deleted:
                continue
            if last_read_at is None or msg.created_at > last_read_at:
                total += 1
    return jsonify({"unread_count": total}), 200


@api.route('/chat/rooms/<int:room_id>/read', methods=['PUT'])
@jwt_required()
def mark_chat_room_read(room_id):
    current_user_id = int(get_jwt_identity())
    room = db.session.get(ChatRoom, room_id)
    if not room:
        return jsonify({"msg": "Room not found"}), 404
    if not _can_access_room(room, current_user_id):
        return jsonify({"msg": "Not allowed in this room"}), 403

    membership = _get_or_create_membership(room_id, current_user_id)
    membership.last_read_at = datetime.utcnow()
    db.session.commit()
    # Tanda 7T — read-sync: aviso a MIS otras superficies/sesiones (modal
    # del Navbar, página Messages, EventModal, otra pestaña…) de que esta
    # sala quedó leída → todas refrescan badges y listas al instante.
    emit_to_user(current_user_id, "chat:read", {"room_id": room_id})
    return jsonify({
        "msg": "Room marked as read",
        "room_id": room_id,
        "last_read_at": membership.last_read_at.isoformat() + "Z",
    }), 200


@api.route('/chat/dm', methods=['POST'])
@jwt_required()
def create_or_get_dm():
    current_user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    target_id = body.get("user_id")

    if not target_id:
        return jsonify({"msg": "user_id is required"}), 400
    if target_id == current_user_id:
        return jsonify({"msg": "You cannot DM yourself"}), 400

    target = db.session.get(User, target_id)
    if not target:
        return jsonify({"msg": "User not found"}), 404
    if not _are_friends(current_user_id, target_id):
        return jsonify({"msg": "You can only DM accepted friends"}), 403

    user_a, user_b = sorted([current_user_id, target_id])
    room = ChatRoom.query.filter_by(
        type="dm", user_a_id=user_a, user_b_id=user_b).first()
    if room:
        return jsonify({"msg": "DM already exists", "room": room.serialize(current_user_id=current_user_id)}), 200

    room = ChatRoom(type="dm", user_a_id=user_a, user_b_id=user_b)
    db.session.add(room)
    db.session.commit()
    return jsonify({"msg": "DM created", "room": room.serialize(current_user_id=current_user_id)}), 201


@api.route('/chat/search', methods=['GET'])
@jwt_required()
def chat_search():
    current_user_id = int(get_jwt_identity())
    q = (request.args.get("q") or "").strip()
    if len(q) < 1:
        return jsonify({"event_rooms": [], "friends": []}), 200

    q_low = q.lower()

    event_rooms = []
    all_rooms = ChatRoom.query.filter_by(type="event").all()
    for r in all_rooms:
        if not r.event:
            continue
        if current_user_id not in [p.id for p in r.event.participants]:
            continue
        if q_low in (r.event.title or "").lower():
            event_rooms.append(r.serialize(current_user_id=current_user_id))

    friendships = Friendship.query.filter(
        Friendship.status == "accepted",
        (Friendship.requester_id == current_user_id) | (
            Friendship.addressee_id == current_user_id)
    ).all()

    friends = []
    for f in friendships:
        other = f.addressee if f.requester_id == current_user_id else f.requester
        if not other:
            continue
        if q_low not in (other.username or "").lower():
            continue
        ua, ub = sorted([current_user_id, other.id])
        dm = ChatRoom.query.filter_by(
            type="dm", user_a_id=ua, user_b_id=ub).first()
        friends.append({
            "user": {
                "id": other.id,
                "username": other.username,
                "profile_picture_url": other.profile_picture_url,
            },
            "room": dm.serialize(current_user_id=current_user_id) if dm else None,
        })

    return jsonify({"event_rooms": event_rooms, "friends": friends}), 200


@api.route('/chat/rooms/<int:room_id>/messages', methods=['GET'])
@jwt_required()
def list_room_messages(room_id):
    current_user_id = int(get_jwt_identity())
    room = db.session.get(ChatRoom, room_id)
    if not room:
        return jsonify({"msg": "Room not found"}), 404
    if not _can_access_room(room, current_user_id):
        return jsonify({"msg": "Not allowed in this room"}), 403

    messages = ChatMessage.query.filter_by(
        room_id=room.id).order_by(ChatMessage.created_at).all()
    return jsonify({
        "room_id": room.id,
        "type": room.type,
        "messages": [m.serialize() for m in messages],
    }), 200


@api.route('/chat/rooms/<int:room_id>/messages', methods=['POST'])
@jwt_required()
def post_room_message(room_id):
    current_user_id = int(get_jwt_identity())
    room = db.session.get(ChatRoom, room_id)
    if not room:
        return jsonify({"msg": "Room not found"}), 404
    if not _can_access_room(room, current_user_id):
        return jsonify({"msg": "Not allowed in this room"}), 403

    body = request.get_json() or {}
    text_v = (body.get("text") or "").strip() or None
    media_url = body.get("media_url") or None
    media_type = body.get("media_type") or None

    if not text_v and not media_url:
        return jsonify({"msg": "text or media_url is required"}), 400
    if media_url and media_type not in ("image", "audio"):
        return jsonify({"msg": "media_type must be 'image' or 'audio' when media_url is set"}), 400

    msg = ChatMessage(
        room_id=room.id, sender_id=current_user_id,
        text=text_v, media_url=media_url, media_type=media_type,
    )
    db.session.add(msg)
    membership = _get_or_create_membership(room.id, current_user_id)
    membership.last_read_at = datetime.utcnow()
    db.session.commit()
    _emit_chat_ping(room)
    return jsonify({"msg": "Message sent", "message": msg.serialize()}), 201


@api.route('/chat/rooms/<int:room_id>/messages/<int:msg_id>', methods=['PUT'])
@jwt_required()
def edit_room_message(room_id, msg_id):
    current_user_id = int(get_jwt_identity())
    room = db.session.get(ChatRoom, room_id)
    if not room:
        return jsonify({"msg": "Room not found"}), 404
    if not _can_access_room(room, current_user_id):
        return jsonify({"msg": "Not allowed in this room"}), 403

    msg = db.session.get(ChatMessage, msg_id)
    if not msg or msg.room_id != room_id:
        return jsonify({"msg": "Message not found"}), 404
    if msg.sender_id != current_user_id:
        return jsonify({"msg": "You can only edit your own messages"}), 403
    if msg.deleted:
        return jsonify({"msg": "Cannot edit a deleted message"}), 409

    age = datetime.utcnow() - msg.created_at
    if age > CHAT_EDIT_WINDOW:
        return jsonify({"msg": "Edit window expired (15 min)"}), 409

    body = request.get_json() or {}
    new_text = (body.get("text") or "").strip()
    if not new_text:
        return jsonify({"msg": "text is required"}), 400

    msg.text = new_text
    msg.edited_at = datetime.utcnow()
    db.session.commit()
    _emit_chat_ping(room)
    return jsonify({"msg": "Message updated", "message": msg.serialize()}), 200


@api.route('/chat/rooms/<int:room_id>/messages/<int:msg_id>', methods=['DELETE'])
@jwt_required()
def delete_room_message(room_id, msg_id):
    current_user_id = int(get_jwt_identity())
    room = db.session.get(ChatRoom, room_id)
    if not room:
        return jsonify({"msg": "Room not found"}), 404
    if not _can_access_room(room, current_user_id):
        return jsonify({"msg": "Not allowed in this room"}), 403

    msg = db.session.get(ChatMessage, msg_id)
    if not msg or msg.room_id != room_id:
        return jsonify({"msg": "Message not found"}), 404
    if msg.sender_id != current_user_id:
        return jsonify({"msg": "You can only delete your own messages"}), 403
    if msg.deleted:
        return jsonify({"msg": "Message already deleted"}), 409

    msg.deleted = True
    msg.text = None
    msg.media_url = None
    msg.media_type = None
    db.session.commit()
    _emit_chat_ping(room)
    return jsonify({"msg": "Message deleted", "message": msg.serialize()}), 200


# ---------- LEGACY: event chat shortcuts ----------

@api.route('/events/<int:event_id>/chat/messages', methods=['GET'])
@jwt_required()
def list_event_messages(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if current_user_id not in [p.id for p in event.participants]:
        return jsonify({"msg": "Not a participant of this event"}), 403

    room = ChatRoom.query.filter_by(type="event", event_id=event_id).first()
    if not room:
        room = ChatRoom(type="event", event_id=event_id)
        db.session.add(room)
        db.session.commit()

    messages = ChatMessage.query.filter_by(
        room_id=room.id).order_by(ChatMessage.created_at).all()
    return jsonify({"room_id": room.id, "messages": [m.serialize() for m in messages]}), 200


@api.route('/events/<int:event_id>/chat/messages', methods=['POST'])
@jwt_required()
def post_event_message(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if current_user_id not in [p.id for p in event.participants]:
        return jsonify({"msg": "Not a participant of this event"}), 403

    body = request.get_json() or {}
    text_v = (body.get("text") or "").strip() or None
    media_url = body.get("media_url") or None
    media_type = body.get("media_type") or None

    if not text_v and not media_url:
        return jsonify({"msg": "text or media_url is required"}), 400
    if media_url and media_type not in ("image", "audio"):
        return jsonify({"msg": "media_type must be 'image' or 'audio' when media_url is set"}), 400

    room = ChatRoom.query.filter_by(type="event", event_id=event_id).first()
    if not room:
        room = ChatRoom(type="event", event_id=event_id)
        db.session.add(room)
        db.session.flush()

    msg = ChatMessage(
        room_id=room.id, sender_id=current_user_id,
        text=text_v, media_url=media_url, media_type=media_type,
    )
    db.session.add(msg)
    membership = _get_or_create_membership(room.id, current_user_id)
    membership.last_read_at = datetime.utcnow()
    db.session.commit()
    _emit_chat_ping(room)
    return jsonify({"msg": "Message sent", "message": msg.serialize()}), 201


# =========================================================
# NOTIFICATIONS
# =========================================================

@api.route('/notifications', methods=['GET'])
@jwt_required()
def list_notifications():
    current_user_id = int(get_jwt_identity())
    # Opportunistic per-user reminder dispatch. Wrapped in try/except so
    # a dispatcher failure never breaks the bell — the user still sees
    # whatever notifications are already in the DB.
    try:
        _dispatch_my_reminders(current_user_id)
    except Exception:
        db.session.rollback()
    # Tanda 7B — same lazy pattern for the post-event "did it happen?"
    # question to the creator.
    try:
        _dispatch_my_event_confirmations(current_user_id)
    except Exception:
        db.session.rollback()
    q = Notification.query.filter_by(user_id=current_user_id)
    if request.args.get("only_unread") in ("1", "true", "True"):
        q = q.filter_by(is_read=False)
    notifs = q.order_by(Notification.created_at.desc()).all()
    return jsonify([n.serialize() for n in notifs]), 200


@api.route('/notifications/unread-count', methods=['GET'])
@jwt_required()
def notifications_unread_count():
    current_user_id = int(get_jwt_identity())
    # Same opportunistic dispatch as /notifications — the bell polls this
    # endpoint, so any new reminder pops up on the next tick.
    try:
        _dispatch_my_reminders(current_user_id)
    except Exception:
        db.session.rollback()
    # Tanda 7B — post-event confirmation question for creators.
    try:
        _dispatch_my_event_confirmations(current_user_id)
    except Exception:
        db.session.rollback()
    count = Notification.query.filter_by(
        user_id=current_user_id, is_read=False).count()
    return jsonify({"unread_count": count}), 200


@api.route('/notifications/<int:notif_id>/read', methods=['PUT'])
@jwt_required()
def mark_notification_read(notif_id):
    current_user_id = int(get_jwt_identity())
    n = db.session.get(Notification, notif_id)
    if not n:
        return jsonify({"msg": "Notification not found"}), 404
    if n.user_id != current_user_id:
        return jsonify({"msg": "Not your notification"}), 403

    n.is_read = True
    db.session.commit()
    return jsonify({"msg": "Notification marked as read", "notification": n.serialize()}), 200


@api.route('/notifications/read-all', methods=['PUT'])
@jwt_required()
def mark_all_notifications_read():
    current_user_id = int(get_jwt_identity())
    notifs = Notification.query.filter_by(
        user_id=current_user_id, is_read=False).all()
    for n in notifs:
        n.is_read = True
    db.session.commit()
    return jsonify({"msg": "All notifications marked as read", "count": len(notifs)}), 200


@api.route('/notifications/<int:notif_id>', methods=['DELETE'])
@jwt_required()
def delete_notification(notif_id):
    current_user_id = int(get_jwt_identity())
    n = db.session.get(Notification, notif_id)
    if not n:
        return jsonify({"msg": "Notification not found"}), 404
    if n.user_id != current_user_id:
        return jsonify({"msg": "Not your notification"}), 403

    db.session.delete(n)
    db.session.commit()
    return jsonify({"msg": "Notification deleted"}), 200


# =========================================================
# BUSINESS PROFILES  (Stage 2)
# =========================================================
# A Business is owned by a User (account_type == 'business'). One owner
# can manage several businesses. Viewing requires a session (same as
# /profile/<id>); editing / posting is restricted to the owner; reviews
# can be left by any logged-in user except the owner.

def _get_owned_business_or_403(business_id, current_user_id):
    """Return (business, None) if current user owns it, else (None, error_response)."""
    biz = db.session.get(Business, business_id)
    if not biz:
        return None, (jsonify({"msg": "Business not found"}), 404)
    if biz.owner_id != current_user_id:
        return None, (jsonify({"msg": "Not your business"}), 403)
    return biz, None


@api.route('/businesses/mine', methods=['GET'])
@jwt_required()
def list_my_businesses():
    """All businesses owned by the current user (powers the switcher)."""
    current_user_id = int(get_jwt_identity())
    rows = Business.query.filter_by(owner_id=current_user_id)\
        .order_by(Business.created_at.asc()).all()
    return jsonify([b.serialize() for b in rows]), 200


@api.route('/businesses', methods=['POST'])
@jwt_required()
def create_business():
    """Create an additional business. Promotes a 'person' account to
    'business' on first creation (an influencer keeps its type)."""
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404

    body = request.get_json() or {}
    name = (body.get("name") or "").strip() or None
    if not name:
        return jsonify({"msg": "Business name is required"}), 400

    biz = Business(
        owner_id=current_user_id,
        name=name,
        category=(body.get("category") or "").strip() or None,
        location=(body.get("location") or "").strip() or None,
        latitude=body.get("latitude"),
        longitude=body.get("longitude"),
        description=(body.get("description") or "").strip() or None,
        hours=body.get("hours") or {},
        profile_picture_url=(body.get("profile_picture_url") or "").strip() or None,
        # Proof document (registration cert, ID…). Owner pays per company, so
        # each one submits a proof and stays unverified until reviewed.
        proof_url=(body.get("proof_url") or "").strip() or None,
    )
    if user.account_type == "person":
        user.account_type = "business"
    db.session.add(biz)
    db.session.commit()
    return jsonify({"msg": "Business created", "business": biz.serialize()}), 201


@api.route('/business/<int:business_id>', methods=['GET'])
@jwt_required()
def get_business(business_id):
    """Full public business profile + feed (posts, events, reviews)."""
    current_user_id = int(get_jwt_identity())
    biz = db.session.get(Business, business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404

    data = biz.serialize(include_feed=True, current_user_id=current_user_id)
    data["is_owner"] = (biz.owner_id == current_user_id)
    # The current user's own review, if any (so the UI can prefill the form).
    my_review = next(
        (r for r in (biz.reviews or []) if r.author_id == current_user_id), None)
    data["my_review"] = my_review.serialize() if my_review else None
    # For the owner: the list of all businesses they manage, powering the
    # dropdown profile-switcher (wireframe: business name ▼ → business 1/2).
    if data["is_owner"]:
        owned = Business.query.filter_by(owner_id=current_user_id)\
            .order_by(Business.created_at.asc()).all()
        data["my_businesses"] = [{"id": b.id, "name": b.name} for b in owned]
    # Follow stats.
    data["followers_count"] = Follow.query.filter_by(business_id=biz.id).count()
    data["is_following"] = Follow.query.filter_by(
        follower_id=current_user_id, business_id=biz.id).first() is not None
    return jsonify(data), 200


@api.route('/business/<int:business_id>', methods=['PUT'])
@jwt_required()
def update_business(business_id):
    current_user_id = int(get_jwt_identity())
    biz, err = _get_owned_business_or_403(business_id, current_user_id)
    if err:
        return err

    body = request.get_json() or {}
    str_fields = ["name", "category", "location", "description", "profile_picture_url"]
    for field in str_fields:
        if field in body:
            value = body[field]
            # name can never be blanked out
            if field == "name" and not (value or "").strip():
                continue
            setattr(biz, field, (value or "").strip() or None)
    for field in ["latitude", "longitude"]:
        if field in body:
            setattr(biz, field, body[field])
    if "hours" in body and isinstance(body["hours"], dict):
        biz.hours = body["hours"]

    db.session.commit()
    return jsonify({"msg": "Business updated", "business": biz.serialize()}), 200


@api.route('/business/<int:business_id>', methods=['DELETE'])
@jwt_required()
def delete_business(business_id):
    current_user_id = int(get_jwt_identity())
    biz, err = _get_owned_business_or_403(business_id, current_user_id)
    if err:
        return err
    # Detach events so deleting a business never deletes shared events.
    for ev in list(biz.events):
        ev.business_id = None
    db.session.delete(biz)
    db.session.commit()
    return jsonify({"msg": "Business deleted"}), 200


# ── POSTS (feed) ──────────────────────────────────────────
@api.route('/business/<int:business_id>/posts', methods=['POST'])
@jwt_required()
def create_business_post(business_id):
    current_user_id = int(get_jwt_identity())
    biz, err = _get_owned_business_or_403(business_id, current_user_id)
    if err:
        return err

    body = request.get_json() or {}
    text = (body.get("text") or "").strip() or None
    image = (body.get("image") or "").strip() or None
    if not text and not image:
        return jsonify({"msg": "A post needs text or an image"}), 400

    post = BusinessPost(business_id=biz.id, text=text, image=image)
    db.session.add(post)
    db.session.commit()
    return jsonify({"msg": "Post created", "post": post.serialize()}), 201


@api.route('/business/<int:business_id>/posts/<int:post_id>', methods=['DELETE'])
@jwt_required()
def delete_business_post(business_id, post_id):
    current_user_id = int(get_jwt_identity())
    biz, err = _get_owned_business_or_403(business_id, current_user_id)
    if err:
        return err
    post = db.session.get(BusinessPost, post_id)
    if not post or post.business_id != biz.id:
        return jsonify({"msg": "Post not found"}), 404
    db.session.delete(post)
    db.session.commit()
    return jsonify({"msg": "Post deleted"}), 200


# ── REVIEWS (drive the rating) ────────────────────────────
@api.route('/business/<int:business_id>/reviews', methods=['POST'])
@jwt_required()
def upsert_business_review(business_id):
    """Create or update the current user's review (one per business)."""
    current_user_id = int(get_jwt_identity())
    biz = db.session.get(Business, business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404
    if biz.owner_id == current_user_id:
        return jsonify({"msg": "You can't review your own business"}), 403

    body = request.get_json() or {}
    rating = body.get("rating")
    try:
        rating = int(rating)
    except (TypeError, ValueError):
        return jsonify({"msg": "rating must be an integer 1-5"}), 400
    if rating < 1 or rating > 5:
        return jsonify({"msg": "rating must be between 1 and 5"}), 400
    text = (body.get("text") or "").strip() or None

    review = Review.query.filter_by(
        business_id=biz.id, author_id=current_user_id).first()
    if review:
        review.rating = rating
        review.text = text
        msg = "Review updated"
    else:
        review = Review(business_id=biz.id, author_id=current_user_id,
                        rating=rating, text=text)
        db.session.add(review)
        msg = "Review added"
    db.session.commit()
    return jsonify({
        "msg": msg,
        "review": review.serialize(),
        "rating": biz.rating(),
        "reviews_count": len(biz.reviews or []),
    }), 200


@api.route('/business/<int:business_id>/reviews/<int:review_id>', methods=['DELETE'])
@jwt_required()
def delete_business_review(business_id, review_id):
    current_user_id = int(get_jwt_identity())
    review = db.session.get(Review, review_id)
    if not review or review.business_id != business_id:
        return jsonify({"msg": "Review not found"}), 404
    # Author can delete their own review; owner can moderate reviews.
    biz = db.session.get(Business, business_id)
    is_owner = bool(biz and biz.owner_id == current_user_id)
    if review.author_id != current_user_id and not is_owner:
        return jsonify({"msg": "Not allowed"}), 403
    db.session.delete(review)
    db.session.commit()
    return jsonify({"msg": "Review deleted", "rating": biz.rating() if biz else None}), 200


# =========================================================
# INFLUENCER PROFILES  (Stage 3)
# =========================================================
# An influencer is a User with account_type == 'influencer'. The public
# page shows: picture, homebase, @username, name, professional email, and
# "Places went" — the events they attended, each with their own opinion
# (the card's "Details" becomes "@username's opinion").

@api.route('/influencer/<int:user_id>', methods=['GET'])
@jwt_required()
def get_influencer(user_id):
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
    if (user.account_type or "person") != "influencer":
        return jsonify({"msg": "This user is not an influencer"}), 404

    # Places went = events this influencer participates in.
    events = Event.query.filter(Event.participants.any(id=user_id))\
        .order_by(Event.date.desc()).all()

    # Their opinions, keyed by event_id (one per event).
    opinions = {
        o.event_id: o
        for o in EventOpinion.query.filter_by(author_id=user_id).all()
    }

    places_went = []
    for ev in events:
        ev_data = ev.serialize(current_user_id=current_user_id)
        op = opinions.get(ev.id)
        ev_data["opinion"] = op.serialize() if op else None
        places_went.append(ev_data)

    return jsonify({
        "id":                  user.id,
        "username":            user.username,
        "first_name":          user.first_name,
        "last_name":           user.last_name,
        "profile_picture_url": user.profile_picture_url,
        "homebase":            user.homebase,
        "professional_email":  user.professional_email,
        "bio":                 user.bio,
        "account_type":        user.account_type,
        "is_self":             (user_id == current_user_id),
        "followers_count":     Follow.query.filter_by(target_user_id=user_id).count(),
        "is_following":        Follow.query.filter_by(
            follower_id=current_user_id, target_user_id=user_id).first() is not None,
        "places_went":         places_went,
        "places_count":        len(places_went),
    }), 200


# ── OPINIONS (influencer's take on an event they attended) ──
@api.route('/events/<int:event_id>/opinion', methods=['POST'])
@jwt_required()
def upsert_event_opinion(event_id):
    """Create/update the current user's opinion on an event. Only allowed
    if they actually attended (are a participant)."""
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if not any(p.id == current_user_id for p in event.participants):
        return jsonify({"msg": "You can only give an opinion on an event you attended"}), 403

    body = request.get_json() or {}
    text = (body.get("text") or "").strip() or None
    rating = body.get("rating")
    if rating is not None:
        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return jsonify({"msg": "rating must be an integer 1-5"}), 400
        if rating < 1 or rating > 5:
            return jsonify({"msg": "rating must be between 1 and 5"}), 400
    if not text and rating is None:
        return jsonify({"msg": "An opinion needs text or a rating"}), 400

    op = EventOpinion.query.filter_by(
        author_id=current_user_id, event_id=event_id).first()
    if op:
        op.text = text
        op.rating = rating
        msg = "Opinion updated"
    else:
        op = EventOpinion(author_id=current_user_id, event_id=event_id,
                          text=text, rating=rating)
        db.session.add(op)
        msg = "Opinion added"
    db.session.commit()
    return jsonify({"msg": msg, "opinion": op.serialize()}), 200


@api.route('/events/<int:event_id>/opinion', methods=['DELETE'])
@jwt_required()
def delete_event_opinion(event_id):
    current_user_id = int(get_jwt_identity())
    op = EventOpinion.query.filter_by(
        author_id=current_user_id, event_id=event_id).first()
    if not op:
        return jsonify({"msg": "Opinion not found"}), 404
    db.session.delete(op)
    db.session.commit()
    return jsonify({"msg": "Opinion deleted"}), 200


# =========================================================
# DISCOVER — CREATORS  (internal search)
# =========================================================
# Unified search over the three creator kinds:
#   - place      → a Business         → link /business/<id>
#   - influencer → influencer User    → link /influencer/<user_id>
#   - owner      → business owner User → link to their first business
# Query params: q (text), type (all|place|influencer|owner).

@api.route('/discover/creators', methods=['GET'])
@jwt_required()
def discover_creators():
    q = (request.args.get("q") or "").strip()
    kind = request.args.get("type") or "all"
    if kind not in ("all", "place", "influencer", "owner"):
        kind = "all"
    like = "%{}%".format(q) if q else None

    results = []

    # ── places (businesses) ──
    if kind in ("all", "place"):
        bq = Business.query
        if like:
            bq = bq.filter(Business.name.ilike(like))
        for b in bq.order_by(Business.name.asc()).limit(20).all():
            results.append({
                "kind":     "place",
                "id":       b.id,
                "title":    b.name,
                "subtitle": b.category or "Business",
                "picture":  b.profile_picture_url,
                "rating":   b.rating(),
                "link":     "/business/{}".format(b.id),
            })

    # ── influencers ──
    if kind in ("all", "influencer"):
        iq = User.query.filter(User.account_type == "influencer")
        if like:
            iq = iq.filter(or_(
                User.username.ilike(like),
                User.first_name.ilike(like),
                User.last_name.ilike(like),
            ))
        for u in iq.order_by(User.username.asc()).limit(20).all():
            name = " ".join(filter(None, [u.first_name, u.last_name])).strip()
            results.append({
                "kind":     "influencer",
                "id":       u.id,
                "title":    "@{}".format(u.username) if u.username else (name or "Influencer"),
                "subtitle": name or (u.homebase or "Influencer"),
                "picture":  u.profile_picture_url,
                "link":     "/influencer/{}".format(u.id),
            })

    # ── owners (link to their first business) ──
    if kind in ("all", "owner"):
        oq = User.query.filter(User.account_type == "business")
        if like:
            oq = oq.filter(User.username.ilike(like))
        for u in oq.order_by(User.username.asc()).limit(20).all():
            owned = Business.query.filter_by(owner_id=u.id)\
                .order_by(Business.created_at.asc()).all()
            if not owned:
                continue  # an owner with no businesses isn't reachable
            results.append({
                "kind":      "owner",
                "id":        u.id,
                "title":     "@{}".format(u.username) if u.username else "Owner",
                "subtitle":  "{} business{}".format(
                    len(owned), "" if len(owned) == 1 else "es"),
                "picture":   u.profile_picture_url,  # owner's OWN avatar, not the business pic
                "businesses": [{"id": b.id, "name": b.name} for b in owned],
                "link":      "/business/{}".format(owned[0].id),
            })

    return jsonify({"results": results, "count": len(results)}), 200


# =========================================================
# FOLLOWS  (Stage 5)
# =========================================================
# Users (and owners) follow businesses and influencers. Follows are
# one-directional; businesses/influencers have followers, not friends.

@api.route('/business/<int:business_id>/follow', methods=['POST'])
@jwt_required()
def follow_business(business_id):
    current_user_id = int(get_jwt_identity())
    biz = db.session.get(Business, business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404
    existing = Follow.query.filter_by(
        follower_id=current_user_id, business_id=business_id).first()
    if not existing:
        db.session.add(Follow(follower_id=current_user_id, business_id=business_id))
        db.session.commit()
    return jsonify({
        "msg": "Following",
        "is_following": True,
        "followers_count": Follow.query.filter_by(business_id=business_id).count(),
    }), 200


@api.route('/business/<int:business_id>/follow', methods=['DELETE'])
@jwt_required()
def unfollow_business(business_id):
    current_user_id = int(get_jwt_identity())
    existing = Follow.query.filter_by(
        follower_id=current_user_id, business_id=business_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify({
        "msg": "Unfollowed",
        "is_following": False,
        "followers_count": Follow.query.filter_by(business_id=business_id).count(),
    }), 200


@api.route('/users/<int:user_id>/follow', methods=['POST'])
@jwt_required()
def follow_user(user_id):
    """Follow an influencer or owner (their account)."""
    current_user_id = int(get_jwt_identity())
    if user_id == current_user_id:
        return jsonify({"msg": "You can't follow yourself"}), 400
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"msg": "User not found"}), 404
    if (target.account_type or "person") not in ("influencer", "business"):
        return jsonify({"msg": "This account can't be followed"}), 400
    existing = Follow.query.filter_by(
        follower_id=current_user_id, target_user_id=user_id).first()
    if not existing:
        db.session.add(Follow(follower_id=current_user_id, target_user_id=user_id))
        db.session.commit()
    return jsonify({
        "msg": "Following",
        "is_following": True,
        "followers_count": Follow.query.filter_by(target_user_id=user_id).count(),
    }), 200


@api.route('/users/<int:user_id>/follow', methods=['DELETE'])
@jwt_required()
def unfollow_user(user_id):
    current_user_id = int(get_jwt_identity())
    existing = Follow.query.filter_by(
        follower_id=current_user_id, target_user_id=user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify({
        "msg": "Unfollowed",
        "is_following": False,
        "followers_count": Follow.query.filter_by(target_user_id=user_id).count(),
    }), 200


@api.route('/businesses/following', methods=['GET'])
@jwt_required()
def list_followed_businesses():
    """Businesses the current user follows — used to drop persistent pins
    on the map. Only those with coordinates are useful for pins, but all
    are returned so the client can decide."""
    current_user_id = int(get_jwt_identity())
    follows = Follow.query.filter(
        Follow.follower_id == current_user_id,
        Follow.business_id.isnot(None),
    ).all()
    out = []
    for f in follows:
        b = f.business
        if not b:
            continue
        out.append({
            "id":                  b.id,
            "name":                b.name,
            "category":            b.category,
            "latitude":            b.latitude,
            "longitude":           b.longitude,
            "profile_picture_url": b.profile_picture_url,
            "hours":               b.hours or {},
        })
    return jsonify(out), 200


# ════════════════════════════════════════════════════════════════
# SUBSCRIPTIONS (Phase 3) — provider-agnostic.
#
# Payment provider is intentionally NOT chosen yet. These endpoints model
# the lifecycle so the rest of the app (priced events, premium coins,
# friend-cap uplift) can be built and exercised now. When a provider is
# wired in:
#   • /subscriptions/activate becomes "create a checkout session" and is
#     no longer what flips the status — the provider WEBHOOK is the single
#     source of truth for status / current_period_end.
#   • /subscriptions/webhook verifies the signature and applies the event.
# Until then, the 'stub' provider activates locally without a real charge.
# ════════════════════════════════════════════════════════════════

# Which plan each account_type is allowed to buy.
#   person                → 'premium' (consumer perks)
#   business / influencer → 'pro'     (professional features)
def _allowed_plan_for(account_type):
    if account_type in ("business", "influencer"):
        return "pro"
    return "premium"


@api.route('/subscriptions/me', methods=['GET'])
@jwt_required()
def get_my_subscription():
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
    personal = user.personal_subscription()
    data = {
        "subscription": personal.serialize() if personal else None,
        "is_pro":       user.is_pro(),
        "is_premium":   user.is_premium(),
        "allowed_plan": _allowed_plan_for(user.account_type),
    }
    # Business owners pay Pro PER COMPANY — expose each company's pro status.
    if user.account_type == "business":
        data["businesses"] = [
            {"id": b.id, "name": b.name, "is_pro": b.is_pro(), "verified": bool(b.verified)}
            for b in (user.businesses or [])
        ]
    return jsonify(data), 200


@api.route('/subscriptions/activate', methods=['POST'])
@jwt_required()
def activate_subscription():
    """DEV / STUB checkout: marks a subscription active for 30 days with
    provider='stub' and NO real charge, so the whole premium flow is testable
    before a provider is chosen. In production this becomes "create checkout
    session" and the provider webhook flips the status.

    Body: {plan, business_id?}.
      • person      → plan 'premium', user-level sub.
      • influencer  → plan 'pro',     user-level sub.
      • business    → plan 'pro' PER COMPANY → business_id REQUIRED.
    """
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404

    body = request.get_json() or {}
    allowed = _allowed_plan_for(user.account_type)
    plan = (body.get("plan") or allowed).strip().lower()
    if plan != allowed:
        return jsonify({
            "msg": "Your account type ({}) can only subscribe to the '{}' plan.".format(
                user.account_type or "person", allowed),
            "code": "plan_not_allowed",
        }), 400

    if user.account_type == "business":
        # Pro is per-company: the owner must say WHICH company to activate.
        business_id = body.get("business_id")
        if not business_id:
            return jsonify({
                "msg": "Select which company to upgrade (business_id is required).",
                "code": "business_id_required",
            }), 400
        biz = db.session.get(Business, int(business_id))
        if not biz or biz.owner_id != user.id:
            return jsonify({"msg": "Business not found or not yours."}), 404
        sub = biz.subscription
        if sub is None:
            sub = Subscription(user_id=user.id, business_id=biz.id)
            db.session.add(sub)
    else:
        # person (premium) / influencer (pro): a single user-level sub.
        sub = user.personal_subscription()
        if sub is None:
            sub = Subscription(user_id=user.id)  # business_id stays NULL
            db.session.add(sub)

    sub.plan = plan
    sub.status = "active"
    sub.provider = "stub"
    sub.current_period_end = datetime.utcnow() + timedelta(days=30)
    db.session.commit()

    return jsonify({
        "msg":          "Subscription activated (stub — no charge).",
        "subscription": sub.serialize(),
        "user":         user.serialize(),
    }), 200


@api.route('/subscriptions/cancel', methods=['POST'])
@jwt_required()
def cancel_subscription():
    """Cancel a subscription. Body {business_id?}: with business_id cancels
    that company's Pro; without it cancels the user-level sub. Immediate with
    the stub; with a real provider you'd cancel at period end via webhook."""
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404

    body = request.get_json() or {}
    business_id = body.get("business_id")
    if business_id:
        biz = db.session.get(Business, int(business_id))
        if not biz or biz.owner_id != user.id:
            return jsonify({"msg": "Business not found or not yours."}), 404
        sub = biz.subscription
    else:
        sub = user.personal_subscription()

    if not sub:
        return jsonify({"msg": "No active subscription"}), 404

    sub.status = "canceled"
    db.session.commit()
    return jsonify({
        "msg":          "Subscription canceled.",
        "subscription": sub.serialize(),
        "user":         user.serialize(),
    }), 200


@api.route('/subscriptions/webhook', methods=['POST'])
def subscriptions_webhook():
    """Placeholder for the future payment-provider webhook (Stripe / Paddle /
    Lemon Squeezy). NOT authenticated with JWT — a real provider authenticates
    by signature instead, which MUST be verified here before trusting the body.

    No provider is wired yet, so this only acknowledges receipt. When one is:
      1. verify the signature,
      2. map the event to a Subscription (by provider_subscription_id),
      3. update status / current_period_end — this is the source of truth.
    """
    # TODO: verify provider signature before trusting any of this.
    return jsonify({"received": True, "handled": False}), 200


# ════════════════════════════════════════════════════════════════
# FRIEND SUGGESTIONS (Phase 3) — "closest people".
#
# Users have no stored lat/lng (only a free-text `city`), so proximity is
# approximated by SAME CITY for now. To make this true-geo later, add
# latitude/longitude to User and switch the filter to a haversine/radius
# query (same shape as discover's _internal_discover_events).
# ════════════════════════════════════════════════════════════════
@api.route('/friends/suggestions', methods=['GET'])
@jwt_required()
def friend_suggestions():
    current_user_id = int(get_jwt_identity())
    me = db.session.get(User, current_user_id)
    if not me:
        return jsonify({"msg": "User not found"}), 404

    try:
        limit = int(request.args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 50))

    # Exclude self + anyone already in a friendship/request (any status).
    related = Friendship.query.filter(
        (Friendship.requester_id == current_user_id) |
        (Friendship.addressee_id == current_user_id)
    ).all()
    exclude_ids = {current_user_id}
    for f in related:
        exclude_ids.add(f.addressee_id if f.requester_id == current_user_id else f.requester_id)

    # "Closest people" ≈ same city (persons only). Fall back to recent
    # persons when the user hasn't set a city, so the list is never empty.
    base = User.query.filter(
        User.account_type == "person",
        User.id.notin_(exclude_ids),
    )
    if me.city:
        base = base.filter(User.city == me.city)
    candidates = base.order_by(User.created_at.desc()).limit(limit).all()

    friend_count = _accepted_friend_count(current_user_id)
    cap = me.friend_cap()
    return jsonify({
        "suggestions":  [u.public_brief() for u in candidates],
        "basis":        "city" if me.city else "recent",
        "city":         me.city,
        "friend_count": friend_count,
        "friend_cap":   cap,
        "cap_reached":  friend_count >= cap,
    }), 200


# ════════════════════════════════════════════════════════════════
# COMPANY MANAGEMENT (Phase 5a) — the pro "hub" backend.
# Only business / influencer accounts. Business owners manage per company
# (Event.business_id); influencers manage their own events (creator_id).
# Team roles / invitations come in Phase 5b.
# ════════════════════════════════════════════════════════════════

# "A regular user could arrive from 30 min before until the event ends."
# Events have no END time, so we approximate the window with a default
# duration. Tune here (or add a real end-time/duration to Event later).
AT_PLACE_EARLY_MIN = 30
AT_PLACE_DEFAULT_DURATION_MIN = 240  # 4h


def _parse_hhmm(value):
    """'HH:MM' -> minutes since midnight, or None."""
    if not value or not isinstance(value, str) or ":" not in value:
        return None
    try:
        h, m = value.split(":")[:2]
        return int(h) * 60 + int(m)
    except (ValueError, TypeError):
        return None


def _events_at_place(company_event):
    """How many events PERSON users created 'at your place' around a company
    event: same normalised location, same date, starting within
    [event_time − 30min, event_time + 4h]. Excludes the company's own
    (business-linked) events and counts only person accounts."""
    if not company_event.location or not company_event.date:
        return 0
    loc = company_event.location.strip().lower()
    base = _parse_hhmm(company_event.time)
    # Use the event's real duration when set; otherwise the 4h fallback.
    dur = (company_event.duration_min
           if (company_event.duration_min and company_event.duration_min > 0)
           else AT_PLACE_DEFAULT_DURATION_MIN)
    lo = (base - AT_PLACE_EARLY_MIN) if base is not None else None
    hi = (base + dur) if base is not None else None

    rows = Event.query.filter(
        Event.date == company_event.date,
        Event.business_id.is_(None),      # user events only (not company events)
        Event.id != company_event.id,
    ).all()
    count = 0
    for e in rows:
        if (e.location or "").strip().lower() != loc:
            continue
        creator = e.creator
        if not creator or creator.account_type != "person":
            continue
        if lo is not None:
            m = _parse_hhmm(e.time)
            if m is None or not (lo <= m <= hi):
                continue
        count += 1
    return count


@api.route('/manage/scope', methods=['GET'])
@jwt_required()
def manage_scope():
    """What the current user can manage:
      - businesses they OWN, plus
      - businesses where they are a TEAM MEMBER (any role), plus
      - their own events if they're an influencer.
    Each business carries the user's role so the frontend can adapt."""
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({"msg": "User not found"}), 404

    # Owned + member businesses, deduped, with the user's role.
    biz_by_id = {}
    for b in (user.businesses or []):
        biz_by_id[b.id] = (b, "owner")
    for m in TeamMembership.query.filter_by(user_id=user.id).all():
        if m.business_id in biz_by_id:
            continue
        b = db.session.get(Business, m.business_id)
        if b:
            biz_by_id[b.id] = (b, m.role)

    businesses = [
        {"id": b.id, "name": b.name, "is_pro": b.is_pro(),
         "verified": bool(b.verified), "role": role}
        for (b, role) in biz_by_id.values()
    ]

    if businesses:
        return jsonify({"type": "business", "businesses": businesses}), 200
    if user.account_type == "influencer":
        return jsonify({"type": "influencer"}), 200
    return jsonify({
        "msg": "Management is only for business / influencer accounts.",
        "code": "not_pro_account",
    }), 403


@api.route('/manage/events', methods=['GET'])
@jwt_required()
def manage_events():
    """Events for the management hub, enriched per CompanyEventCard:
    price, team_note, at_place_count, reviews_count.
      - ?business_id= → that company's events; caller must be owner/member.
      - no business_id → influencer's own events.
    """
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({"msg": "User not found"}), 404

    business_id = request.args.get("business_id", type=int)
    q = Event.query
    if business_id:
        biz = db.session.get(Business, business_id)
        if not biz:
            return jsonify({"msg": "Business not found."}), 404
        if _business_role(user.id, biz) is None:
            return jsonify({"msg": "You are not part of this company's team.",
                            "code": "forbidden"}), 403
        q = q.filter(Event.business_id == business_id)
    elif user.account_type == "influencer":
        q = q.filter(Event.creator_id == user.id)
    else:
        return jsonify({"msg": "business_id is required.",
                        "code": "business_id_required"}), 400

    events = q.order_by(Event.date.desc(), Event.time.desc()).all()
    out = []
    for e in events:
        d = e.serialize(current_user_id=user.id, include_team=True)
        d["at_place_count"] = _events_at_place(e)
        d["reviews_count"] = EventOpinion.query.filter_by(event_id=e.id).count()
        out.append(d)
    return jsonify({"events": out}), 200


# =========================================================
# TEAM & ROLES (Phase 5b)
# =========================================================
# Roles: owner > manager > editor > viewer. The OWNER is derived from
# Business.owner_id (no TeamMembership row). `can_manage_managers` is the
# owner-granted authorization that lets a manager manage other managers too.

def _business_role(user_id, business):
    """User's role for a business: 'owner' | 'manager' | 'editor' | 'viewer'
    | None (not a member)."""
    if not business:
        return None
    if business.owner_id == user_id:
        return "owner"
    m = TeamMembership.query.filter_by(business_id=business.id, user_id=user_id).first()
    return m.role if m else None


def _set_event_workers(event, worker_ids):
    """#1 — assign workers to a business event. Only the event business's
    team members (owner + memberships) are accepted; anything else is
    silently dropped. A non-business event gets no workers."""
    if not event.business_id:
        event.workers = []
        return
    ids = set(worker_ids or [])
    if not ids:
        event.workers = []
        return
    biz = db.session.get(Business, event.business_id)
    if not biz:
        event.workers = []
        return
    valid_ids = {biz.owner_id}
    for m in TeamMembership.query.filter_by(business_id=biz.id).all():
        valid_ids.add(m.user_id)
    event.workers = [u for u in (db.session.get(User, uid) for uid in ids if uid in valid_ids) if u]


def _can_edit_event(user, event):
    """Creator OR a team member with editor+ role on the event's business."""
    if not user or not event:
        return False
    if event.creator_id == user.id:
        return True
    if event.business_id:
        role = _business_role(user.id, db.session.get(Business, event.business_id))
        return role in ("owner", "manager", "editor")
    return False


def _actor_can_manage_managers(actor_id, business, actor_role):
    """Owner always; a manager only if granted the co-management authorization."""
    if actor_role == "owner":
        return True
    m = TeamMembership.query.filter_by(business_id=business.id, user_id=actor_id).first()
    return bool(m and m.role == "manager" and m.can_manage_managers)


def _notify_business_managers(business, notif_type, payload_extra=None):
    """Notify the owner + every manager of a business."""
    if not business:
        return
    ids = {business.owner_id}
    for m in TeamMembership.query.filter_by(business_id=business.id, role="manager").all():
        ids.add(m.user_id)
    for uid in ids:
        _create_notification(user_id=uid, notif_type=notif_type, payload=payload_extra or {})


@api.route('/businesses/<int:business_id>/team', methods=['GET'])
@jwt_required()
def list_team(business_id):
    """List the team (owner synthesized + memberships). Members see the roster;
    owner/manager also see pending invites (with tokens)."""
    uid = int(get_jwt_identity())
    biz = db.session.get(Business, business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404
    role = _business_role(uid, biz)
    if role is None:
        return jsonify({"msg": "You are not part of this team.", "code": "forbidden"}), 403

    owner = db.session.get(User, biz.owner_id)
    members = [{
        "user_id": biz.owner_id,
        "username": owner.username if owner else None,
        "profile_picture_url": owner.profile_picture_url if owner else None,
        "role": "owner",
        "can_manage_managers": True,
    }]
    for m in TeamMembership.query.filter_by(business_id=business_id).all():
        members.append(m.serialize())

    out = {"business_id": business_id, "my_role": role, "members": members}
    if role in ("owner", "manager"):
        invites = TeamInvite.query.filter_by(business_id=business_id, status="pending").all()
        out["pending_invites"] = [i.serialize(include_token=True) for i in invites]
    return jsonify(out), 200


@api.route('/businesses/<int:business_id>/team/invites', methods=['POST'])
@jwt_required()
def create_team_invite(business_id):
    """Create a single-use invite. Body: {role, email?, username?}.
    email/username set → targeted (must match on accept); neither → open link.
    Owner/manager only. Returns the invite + accept URL (+ token)."""
    uid = int(get_jwt_identity())
    biz = db.session.get(Business, business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404
    if _business_role(uid, biz) not in ("owner", "manager"):
        return jsonify({"msg": "Only owner/manager can invite.", "code": "forbidden"}), 403

    body = request.get_json() or {}
    role = body.get("role")
    if role not in TEAM_ROLES:
        return jsonify({"msg": "role must be one of: manager, editor, viewer"}), 400

    # lstrip("@") por si el front manda "@usuario" (seguridad extra).
    email = (body.get("email") or "").strip().lower().lstrip("@") or None
    username = (body.get("username") or "").strip().lstrip("@") or None

    # Resolver el destinatario (si lo hay) ANTES de crear, para deduplicar.
    target = None
    if username:
        target = User.query.filter_by(username=username).first()
    elif email:
        target = User.query.filter(User.email == email).first()

    # Dedup de invitaciones DIRIGIDas (los enlaces abiertos sí pueden ser varios,
    # cada uno de un solo uso):
    if target:
        if target.id == biz.owner_id:
            return jsonify({"msg": "This user is the owner of the company.",
                            "code": "already_owner"}), 409
        if TeamMembership.query.filter_by(business_id=business_id, user_id=target.id).first():
            return jsonify({"msg": "This user is already in the team.",
                            "code": "already_member"}), 409
    if email or username:
        dup = TeamInvite.query.filter_by(business_id=business_id, status="pending")
        dup = dup.filter(TeamInvite.invited_username == username) if username \
            else dup.filter(TeamInvite.email == email)
        if dup.first():
            return jsonify({"msg": "An invite is already pending for this user.",
                            "code": "already_invited"}), 409

    inv = TeamInvite(
        business_id=business_id, role=role,
        token=secrets.token_urlsafe(24),
        email=email, invited_username=username,
        status="pending", created_by=uid,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.session.add(inv)
    db.session.commit()

    # If targeted to a known user, ping them in-app.
    if target:
        _create_notification(user_id=target.id, notif_type="team_invite", payload={
            "business_id": business_id, "business_name": biz.name,
            "role": role, "token": inv.token, "from_user_id": uid,
        })

    data = inv.serialize(include_token=True)
    data["accept_url"] = "{}/team/invite/{}".format(frontend_base_url(), inv.token)
    return jsonify({"invite": data}), 201


@api.route('/team/invites/<token>', methods=['GET'])
@jwt_required()
def preview_team_invite(token):
    """Preview an invite (company + role) before accepting."""
    inv = TeamInvite.query.filter_by(token=token).first()
    if not inv:
        return jsonify({"msg": "Invite not found"}), 404
    biz = db.session.get(Business, inv.business_id)
    valid = inv.status == "pending" and (
        inv.expires_at is None or inv.expires_at > datetime.utcnow())
    return jsonify({
        "business_id": inv.business_id,
        "business_name": biz.name if biz else None,
        "role": inv.role,
        "status": inv.status,
        "targeted": bool(inv.email or inv.invited_username),
        "valid": valid,
    }), 200


@api.route('/team/invites/<token>/accept', methods=['POST'])
@jwt_required()
def accept_team_invite(token):
    """Join the team with the invite's role (single-use)."""
    uid = int(get_jwt_identity())
    user = db.session.get(User, uid)
    inv = TeamInvite.query.filter_by(token=token).first()
    if not inv:
        return jsonify({"msg": "Invite not found"}), 404
    if inv.status != "pending":
        return jsonify({"msg": "This invite is no longer valid.", "code": "invalid_invite"}), 409
    if inv.expires_at and inv.expires_at < datetime.utcnow():
        inv.status = "expired"
        db.session.commit()
        return jsonify({"msg": "This invite has expired.", "code": "expired"}), 409

    biz = db.session.get(Business, inv.business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404
    if biz.owner_id == uid:
        return jsonify({"msg": "You own this company.", "code": "already_owner"}), 409

    # Targeted invites must match the accepting user.
    if inv.invited_username and inv.invited_username != user.username:
        return jsonify({"msg": "This invite is for another user.", "code": "wrong_user"}), 403
    if inv.email and inv.email != (user.email or "").lower():
        return jsonify({"msg": "This invite is for another email.", "code": "wrong_email"}), 403

    m = TeamMembership.query.filter_by(business_id=biz.id, user_id=uid).first()
    if m:
        m.role = inv.role
    else:
        m = TeamMembership(business_id=biz.id, user_id=uid, role=inv.role)
        db.session.add(m)
    inv.status = "accepted"
    inv.accepted_by = uid
    db.session.commit()

    _create_notification(user_id=biz.owner_id, notif_type="team_member_joined", payload={
        "business_id": biz.id, "business_name": biz.name,
        "user_id": uid, "username": user.username, "role": inv.role,
    })
    return jsonify({"msg": "You joined the team.", "membership": m.serialize()}), 200


@api.route('/businesses/<int:business_id>/team/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_team_member(business_id, user_id):
    """Change a member's role and/or (owner only) the co-management flag."""
    actor_id = int(get_jwt_identity())
    biz = db.session.get(Business, business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404
    if user_id == biz.owner_id:
        return jsonify({"msg": "The owner cannot be modified.", "code": "forbidden"}), 403
    actor_role = _business_role(actor_id, biz)
    if actor_role not in ("owner", "manager"):
        return jsonify({"msg": "Only owner/manager can manage the team.", "code": "forbidden"}), 403

    m = TeamMembership.query.filter_by(business_id=business_id, user_id=user_id).first()
    if not m:
        return jsonify({"msg": "Member not found"}), 404

    body = request.get_json() or {}

    # Touching a MANAGER requires owner or an authorized (co-manager) manager.
    if m.role == "manager" and not _actor_can_manage_managers(actor_id, biz, actor_role):
        return jsonify({
            "msg": "Only the owner (or an authorized manager) can manage managers.",
            "code": "forbidden",
        }), 403

    new_role = body.get("role")
    if new_role is not None:
        if new_role not in TEAM_ROLES:
            return jsonify({"msg": "role must be one of: manager, editor, viewer"}), 400
        m.role = new_role

    # Granting/revoking co-management is OWNER-only.
    if "can_manage_managers" in body:
        if actor_role != "owner":
            return jsonify({"msg": "Only the owner can grant co-management.", "code": "forbidden"}), 403
        m.can_manage_managers = bool(body["can_manage_managers"])

    db.session.commit()
    return jsonify({"membership": m.serialize()}), 200


@api.route('/businesses/<int:business_id>/team/<int:user_id>', methods=['DELETE'])
@jwt_required()
def remove_team_member(business_id, user_id):
    """Remove a member. Owner/manager; removing a manager needs owner/co-manager."""
    actor_id = int(get_jwt_identity())
    biz = db.session.get(Business, business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404
    if user_id == biz.owner_id:
        return jsonify({"msg": "The owner cannot be removed.", "code": "forbidden"}), 403
    actor_role = _business_role(actor_id, biz)
    if actor_role not in ("owner", "manager"):
        return jsonify({"msg": "Only owner/manager can manage the team.", "code": "forbidden"}), 403

    m = TeamMembership.query.filter_by(business_id=business_id, user_id=user_id).first()
    if not m:
        return jsonify({"msg": "Member not found"}), 404
    if m.role == "manager" and not _actor_can_manage_managers(actor_id, biz, actor_role):
        return jsonify({
            "msg": "Only the owner (or an authorized manager) can remove a manager.",
            "code": "forbidden",
        }), 403

    db.session.delete(m)
    db.session.commit()
    return jsonify({"msg": "Member removed"}), 200


@api.route('/businesses/<int:business_id>/team/invites/<int:invite_id>', methods=['DELETE'])
@jwt_required()
def revoke_team_invite(business_id, invite_id):
    """Revoke a pending invite. Owner/manager only."""
    actor_id = int(get_jwt_identity())
    biz = db.session.get(Business, business_id)
    if not biz:
        return jsonify({"msg": "Business not found"}), 404
    if _business_role(actor_id, biz) not in ("owner", "manager"):
        return jsonify({"msg": "Only owner/manager can revoke invites.", "code": "forbidden"}), 403
    inv = db.session.get(TeamInvite, invite_id)
    if not inv or inv.business_id != business_id:
        return jsonify({"msg": "Invite not found"}), 404
    inv.status = "revoked"
    db.session.commit()
    return jsonify({"msg": "Invite revoked"}), 200


# ── Event deletion approval (Phase 5b double-confirm) ──────
@api.route('/events/<int:event_id>/deletion/approve', methods=['POST'])
@jwt_required()
def approve_event_deletion(event_id):
    """A manager/owner approves a pending deletion → the event is removed."""
    uid = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if not event.pending_delete_by:
        return jsonify({"msg": "No pending deletion for this event.", "code": "no_request"}), 409
    biz = db.session.get(Business, event.business_id) if event.business_id else None
    if _business_role(uid, biz) not in ("owner", "manager"):
        return jsonify({"msg": "Only a manager/owner can approve a deletion.", "code": "forbidden"}), 403
    return _perform_event_deletion(event, uid)


@api.route('/events/<int:event_id>/deletion/cancel', methods=['POST'])
@jwt_required()
def cancel_event_deletion(event_id):
    """Cancel a pending deletion request (the requester or a manager/owner)."""
    uid = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if not event.pending_delete_by:
        return jsonify({"msg": "No pending deletion for this event.", "code": "no_request"}), 409
    biz = db.session.get(Business, event.business_id) if event.business_id else None
    role = _business_role(uid, biz) if biz else None
    if uid != event.pending_delete_by and role not in ("owner", "manager"):
        return jsonify({"msg": "You can't cancel this request.", "code": "forbidden"}), 403
    event.pending_delete_by = None
    event.pending_delete_at = None
    db.session.commit()
    return jsonify({"msg": "Deletion request cancelled."}), 200
