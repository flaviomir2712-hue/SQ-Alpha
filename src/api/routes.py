import os

# Tanda 7V — subida de media a Cloudinary (la lib ya estaba en el
# Pipfile sin usar). Se configura sola desde la env var CLOUDINARY_URL.
import cloudinary
import cloudinary.uploader

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
    ChatRoomMembership, event_participants,
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


# ── Tanda 7E — tokens de email (firmados + caducidad) ──────
# Firmados con la misma secret del JWT; el "salt" separa los usos para
# que un token de verificación jamás sirva para resetear contraseña.
EMAIL_VERIFY_SALT = "sq-email-verify"
EMAIL_VERIFY_MAX_AGE = 3 * 24 * 3600   # 3 días
PASSWORD_RESET_SALT = "sq-password-reset"
PASSWORD_RESET_MAX_AGE = 3600          # 1 hora


def _email_serializer():
    return URLSafeTimedSerializer(current_app.config["JWT_SECRET_KEY"])


def _make_email_token(user_id, salt):
    return _email_serializer().dumps({"uid": user_id}, salt=salt)


def _read_email_token(token, salt, max_age):
    """user_id o None (firma inválida / caducado / malformado)."""
    try:
        data = _email_serializer().loads(token, salt=salt, max_age=max_age)
        return data.get("uid")
    except (BadSignature, SignatureExpired, Exception):
        return None


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
    )
    db.session.add(new_user)
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
        "profile", "event", "chat", "audio") else "misc"

    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        return jsonify({"msg": "data_url (base64 data URL) is required"}), 400
    # ~12 MB de base64 ≈ 9 MB reales — tope generoso (el front ya
    # comprime imágenes a ~250-500 KB antes de llegar aquí).
    if len(data_url) > 12_000_000:
        return jsonify({"msg": "File too large"}), 413

    try:
        result = cloudinary.uploader.upload(
            data_url,
            folder="sidequest/{}".format(kind),
            # "auto": acepta imagen y audio/video (notas de voz del chat).
            resource_type="auto",
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
        token = _make_email_token(user.id, PASSWORD_RESET_SALT)
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

    user_id = _read_email_token(
        token, PASSWORD_RESET_SALT, PASSWORD_RESET_MAX_AGE)
    if not user_id:
        return jsonify({
            "msg": "This reset link is invalid or has expired. Request a new one."
        }), 400

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"msg": "Account no longer exists"}), 404

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

@api.route('/events', methods=['POST'])
@jwt_required()
def create_event():
    current_user_id = int(get_jwt_identity())
    body = request.get_json() or {}

    required = ["date", "time", "location"]
    if not all(body.get(f) for f in required):
        return jsonify({"msg": "date, time and location are required"}), 400

    creator = db.session.get(User, current_user_id)

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
        is_public=is_public,
        creator_id=current_user_id,
    )
    event.participants.append(creator)
    db.session.add(event)
    db.session.flush()

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
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can edit this event"}), 403

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
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can delete this event"}), 403

    # Tanda 7B/7C — Past events are history: they can NEVER be deleted.
    # The creator answers the event_confirmation notification instead
    # (PUT /events/<id>/confirm). Events marked as NOT happened
    # (happened == False) disappear from the UI (get_events filters
    # them out) but stay in the database as a "created but cancelled"
    # record — useful data for later.
    if _event_is_past(event):
        return jsonify({
            "msg": "Past events cannot be deleted. Please confirm whether "
                   "the event took place from your notifications instead."
        }), 409

    # Tanda 7F2 — capturar la audiencia ANTES de vaciar participantes y
    # borrar la fila: después ya no se puede calcular.
    audience = _event_audience_ids(event)

    creator = db.session.get(User, current_user_id)

    # Notify participants BEFORE deletion — once the event row is gone we
    # lose access to event.title/.participants and the notif payload would
    # be empty.
    _notify_event_participants(
        event, "event_cancelled",
        payload_extra={
            "from_user_id": current_user_id,
            "from_username":   creator.username if creator else None,
        },
    )

    _delete_event_invite_notifications(event_id)
    _delete_invite_suggestion_notifications(event_id)
    # Drop dangling lifecycle notifs for this event so the bell doesn't
    # keep linking to a now-404 event. event_cancelled created above stays
    # (it doesn't reference the event row in the payload beyond id+title).
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
    if len(q) < 2:
        return jsonify({"msg": "q must be at least 2 characters"}), 400

    users = (User.query
             .filter(User.id != current_user_id, User.username.ilike(f"%{q}%"))
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
