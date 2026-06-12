"""
Tanda 7F — Socket.IO (lado servidor).

Inicialización SIN tocar app.py: este módulo crea la instancia global
`socketio` y routes.py la conecta a la app vía api.record_once
(socketio.init_app). flask_socketio envuelve app.wsgi_app al iniciarse,
así que el `gunicorn wsgi` existente sigue funcionando — solo cambia el
worker en el Procfile (gthread) para soportar varias conexiones
long-polling/WebSocket concurrentes.

async_mode="threading": evita eventlet/gevent (frágiles en Python 3.13)
y se comporta igual bajo `flask run` (dev) que bajo gunicorn gthread
(Render). El WebSocket real lo aporta el paquete simple-websocket; si
el upgrade falla, el cliente Socket.IO cae solo a long-polling.

Autenticación del handshake: llega con la cookie httpOnly
sq_access_token (Tanda 7D) — el navegador la adjunta gracias a
withCredentials en el cliente. La validamos con decode_token y se
rechaza la conexión si falta o no es válida. Cada cliente queda unido a
su sala personal user_<id>, a la que el backend emite:

    "notification:new"  {type}      → el cliente refetchea /notifications
    "chat:message"      {room_id}   → el cliente refetchea rooms/mensajes

Patrón "ping → refetch": el payload es mínimo y el cliente vuelve a
pedir los datos por la API REST normal — una sola fuente de verdad,
cero estado duplicado entre socket y REST.
"""
import os

from flask import request
from flask_jwt_extended import decode_token
from flask_socketio import SocketIO, join_room

socketio = SocketIO(async_mode="threading")


def allowed_origins():
    """Orígenes permitidos para el handshake (espejo del CORS REST).

    python-engineio no acepta regex en cors_allowed_origins, así que el
    dominio del Codespace se construye con las env vars que inyecta el
    propio GitHub (CODESPACE_NAME + dominio de forwarding). En Render
    el front es same-origin y Render inyecta RENDER_EXTERNAL_URL.
    """
    allowed = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://localhost:3000",
    ]
    codespace = os.getenv("CODESPACE_NAME")
    fwd_domain = os.getenv(
        "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev")
    if codespace:
        allowed.append("https://{}-3000.{}".format(codespace, fwd_domain))
    render_url = os.getenv("RENDER_EXTERNAL_URL")
    if render_url:
        allowed.append(render_url.rstrip("/"))
    return allowed


def _identity_from_handshake():
    """user_id (str) sacado del JWT de la cookie httpOnly, o None.

    Vía alternativa para clientes API sin cookie (p. ej. probar el
    socket desde un script): query string ?token=<jwt del body del
    login>.
    """
    token = request.cookies.get("sq_access_token") or request.args.get("token")
    if not token:
        return None
    try:
        return decode_token(token).get("sub")
    except Exception:
        return None


@socketio.on("connect")
def handle_connect(auth=None):
    identity = _identity_from_handshake()
    if not identity:
        # False rechaza el handshake — el cliente no queda suscrito a nada.
        return False
    join_room("user_{}".format(identity))


def emit_to_user(user_id, event, payload=None):
    """Emisión best-effort: un fallo del socket JAMÁS rompe la request HTTP."""
    try:
        socketio.emit(event, payload or {}, to="user_{}".format(user_id))
    except Exception:
        pass
