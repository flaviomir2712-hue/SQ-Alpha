import inspect
import os
from flask import redirect, request, url_for
from flask_admin import Admin, AdminIndexView
from flask_jwt_extended import decode_token
from . import models
from .models import db, User
from flask_admin.contrib.sqla import ModelView
from flask_admin.theme import Bootstrap4Theme


def _current_admin_user():
    """The logged-in User if their JWT (cookie or Bearer) says is_admin,
    else None. Mirrors the identity check sockets.py does for the
    Socket.IO handshake -- same cookie, no separate login system needed."""
    token = request.cookies.get("sq_access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[len("Bearer "):]
    if not token:
        return None
    try:
        user_id = decode_token(token).get("sub")
    except Exception:
        return None
    user = db.session.get(User, int(user_id)) if user_id else None
    return user if user and user.is_admin else None


class _StaffOnlyMixin:
    """Shared access check for every view registered on /admin/.

    Flask-Admin normally pairs with Flask-Login; this app authenticates
    with a JWT in an httpOnly cookie instead (Tanda 7D), so we check that
    cookie directly rather than pulling in a second auth stack.
    """

    def is_accessible(self):
        return _current_admin_user() is not None

    def inaccessible_callback(self, name, **kwargs):
        return redirect(url_for("api.login"))


class SecureAdminIndexView(_StaffOnlyMixin, AdminIndexView):
    pass


class SecureModelView(_StaffOnlyMixin, ModelView):
    pass


def setup_admin(app):
    # Needed for Flask-Admin's flash messages and WTForms CSRF tokens.
    app.secret_key = os.environ.get('FLASK_APP_KEY', 'sample key')
    admin = Admin(
        app,
        name="SideQuest Admin",
        theme=Bootstrap4Theme(swatch="cerulean"),
        index_view=SecureAdminIndexView(),
    )

    # Dynamically add all models to the admin interface -- every view
    # inherits the staff-only gate above.
    for name, obj in inspect.getmembers(models):
        # Verify that the object is a SQLAlchemy model before adding it to the admin.
        if inspect.isclass(obj) and issubclass(obj, db.Model):
            admin.add_view(SecureModelView(obj, db.session))
