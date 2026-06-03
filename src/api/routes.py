from flask import Blueprint, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import text
from api.models import (
    db, User, Event, Friendship, ChatRoom, ChatMessage,
    Notification, EventInvitation, ChatRoomMembership,
    event_participants,
)
from datetime import datetime, timedelta

api = Blueprint('api', __name__)
CORS(api)


# How long a sender can edit their own chat message after posting it.
CHAT_EDIT_WINDOW = timedelta(minutes=15)


# =========================================================
# NOTIFICATION HELPERS (internal)
# =========================================================

def _create_notification(user_id, notif_type, payload):
    notif = Notification(
        user_id=user_id, type=notif_type,
        payload=payload or {}, is_read=False,
    )
    db.session.add(notif)
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
            "body": {"email": "test@test.com", "password": "123456"}
        }), 200

    body = request.get_json() or {}
    email = body.get("email")
    password = body.get("password")
    if not email or not password:
        return jsonify({"msg": "Email and password are required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "User already exists"}), 400

    new_user = User(email=email, password=generate_password_hash(password), is_active=True)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"msg": "User registered successfully", "user": new_user.serialize()}), 201


# =========================================================
# LOGIN
# =========================================================

@api.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == "GET":
        return jsonify({
            "endpoint": "/api/login",
            "method": "POST",
            "body": {"email": "test@test.com", "password": "123456"}
        }), 200

    body = request.get_json() or {}
    email = body.get("email")
    password = body.get("password")
    if not email or not password:
        return jsonify({"msg": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password, password):
        return jsonify({"msg": "Invalid email or password"}), 401

    access_token = create_access_token(identity=str(user.id))
    return jsonify({"token": access_token, "user": user.serialize()}), 200


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

    event = Event(
        title=body.get("title"),
        date=body["date"],
        time=body["time"],
        location=body["location"],
        latitude=body.get("latitude"),
        longitude=body.get("longitude"),
        details=body.get("details"),
        image=body.get("image"),
        creator_id=current_user_id,
    )
    event.participants.append(creator)
    db.session.add(event)
    db.session.flush()

    room = ChatRoom(type="event", event_id=event.id)
    db.session.add(room)

    invitations = []
    seen = {current_user_id}
    for friend_id in body.get("invitedFriends", []):
        if friend_id in seen:
            continue
        friend = db.session.get(User, friend_id)
        if not friend:
            continue
        inv = EventInvitation(event_id=event.id, user_id=friend.id, inviter_id=current_user_id)
        db.session.add(inv)
        invitations.append((friend, inv))
        seen.add(friend_id)

    db.session.flush()

    for friend, inv in invitations:
        _create_notification(
            user_id=friend.id,
            notif_type="event_invite",
            payload={
                "event_id": event.id,
                "invitation_id": inv.id,
                "from_user_id": current_user_id,
                "from_email": creator.email,
                "event_title": event.title,
                "event_date": event.date,
                "event_time": event.time,
            },
        )

    db.session.commit()
    return jsonify({"msg": "Event created", "event": event.serialize(current_user_id=current_user_id)}), 201


@api.route('/events', methods=['GET'])
@jwt_required()
def get_events():
    current_user_id = int(get_jwt_identity())
    all_events = Event.query.all()
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
    return jsonify([e.serialize(current_user_id=current_user_id) for e in visible]), 200


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
    editable = ["title", "date", "time", "location", "latitude", "longitude", "details", "image"]
    for field in editable:
        if field in body:
            setattr(event, field, body[field])

    db.session.commit()
    return jsonify({"msg": "Event updated", "event": event.serialize(current_user_id=current_user_id)}), 200


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
    target_id = body.get("user_id")
    if not target_id:
        return jsonify({"msg": "user_id is required"}), 400

    target = db.session.get(User, target_id)
    if not target:
        return jsonify({"msg": "User not found"}), 404

    is_friend = Friendship.query.filter(
        Friendship.status == "accepted",
        ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == target_id)) |
        ((Friendship.requester_id == target_id) & (Friendship.addressee_id == current_user_id))
    ).first()
    if not is_friend:
        return jsonify({"msg": "You can only invite accepted friends"}), 403

    if target_id in [p.id for p in event.participants]:
        return jsonify({"msg": "User is already a participant"}), 409

    existing_inv = EventInvitation.query.filter_by(event_id=event_id, user_id=target_id).first()
    if existing_inv:
        return jsonify({"msg": "User has already been invited"}), 409

    inv = EventInvitation(event_id=event.id, user_id=target.id, inviter_id=current_user_id)
    db.session.add(inv)
    db.session.flush()

    creator = db.session.get(User, current_user_id)
    _create_notification(
        user_id=target.id,
        notif_type="event_invite",
        payload={
            "event_id": event.id,
            "invitation_id": inv.id,
            "from_user_id": current_user_id,
            "from_email": creator.email,
            "event_title": event.title,
            "event_date": event.date,
            "event_time": event.time,
        },
    )

    db.session.commit()
    return jsonify({
        "msg": "Friend invited",
        "event": event.serialize(current_user_id=current_user_id),
        "invitation": inv.serialize(),
    }), 201


# ---------- RSVP TO EVENT ----------
# Body: { "rsvp": "going" | "maybe" | "not_going" | null }
# Any participant can update their RSVP at any time.
# Sending the same value again clears it (toggle behaviour).
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
    rsvp_value = body.get("rsvp")  # None clears the rsvp

    allowed = {None, "going", "maybe", "not_going"}
    if rsvp_value not in allowed:
        return jsonify({"msg": "rsvp must be one of: going, maybe, not_going, or null"}), 400

    # Update the rsvp column on the association table row directly
    db.session.execute(
        text("UPDATE event_participants SET rsvp = :rsvp WHERE event_id = :eid AND user_id = :uid"),
        {"rsvp": rsvp_value, "eid": event_id, "uid": current_user_id},
    )
    db.session.commit()

    return jsonify({
        "msg": "RSVP updated",
        "rsvp": rsvp_value,
        "event": event.serialize(current_user_id=current_user_id),
    }), 200


@api.route('/events/<int:event_id>/accept', methods=['PUT'])
@jwt_required()
def accept_event_invitation(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    inv = EventInvitation.query.filter_by(event_id=event_id, user_id=current_user_id).first()
    if not inv:
        return jsonify({"msg": "No pending invitation for this event"}), 404

    user = db.session.get(User, current_user_id)
    if user not in event.participants:
        event.participants.append(user)

    db.session.delete(inv)
    _delete_event_invite_notifications(event_id, user_id=current_user_id)

    db.session.commit()
    return jsonify({"msg": "Invitation accepted", "event": event.serialize(current_user_id=current_user_id)}), 200


@api.route('/events/<int:event_id>/refuse', methods=['PUT'])
@jwt_required()
def refuse_event_invitation(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404

    inv = EventInvitation.query.filter_by(event_id=event_id, user_id=current_user_id).first()
    if not inv:
        return jsonify({"msg": "No pending invitation for this event"}), 404

    db.session.delete(inv)
    _delete_event_invite_notifications(event_id, user_id=current_user_id)

    db.session.commit()
    return jsonify({"msg": "Invitation refused"}), 200


@api.route('/events/<int:event_id>', methods=['DELETE'])
@jwt_required()
def delete_event(event_id):
    current_user_id = int(get_jwt_identity())
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if event.creator_id != current_user_id:
        return jsonify({"msg": "Only the creator can delete this event"}), 403

    _delete_event_invite_notifications(event_id)
    EventInvitation.query.filter_by(event_id=event_id).delete()
    event.participants.clear()

    room = ChatRoom.query.filter_by(type="event", event_id=event_id).first()
    if room:
        db.session.delete(room)

    db.session.delete(event)
    db.session.commit()
    return jsonify({"msg": "Event deleted"}), 200


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

    target = next((p for p in event.participants if p.id == user_id), None)
    if target:
        event.participants.remove(target)
        _delete_event_invite_notifications(event_id, user_id=user_id)
        db.session.commit()
        return jsonify({"msg": "Participant removed", "event": event.serialize(current_user_id=current_user_id)}), 200

    inv = EventInvitation.query.filter_by(event_id=event_id, user_id=user_id).first()
    if inv:
        db.session.delete(inv)
        _delete_event_invite_notifications(event_id, user_id=user_id)
        db.session.commit()
        return jsonify({"msg": "Invitation cancelled", "event": event.serialize(current_user_id=current_user_id)}), 200

    return jsonify({"msg": "User is not a participant nor invited"}), 404


# =========================================================
# FRIENDS
# =========================================================

@api.route('/friends', methods=['GET'])
@jwt_required()
def list_friends():
    current_user_id = int(get_jwt_identity())
    friendships = Friendship.query.filter(
        Friendship.status == "accepted",
        (Friendship.requester_id == current_user_id) | (Friendship.addressee_id == current_user_id)
    ).all()
    return jsonify([f.serialize(current_user_id=current_user_id) for f in friendships]), 200


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
            (Friendship.requester_id == current_user_id) | (Friendship.addressee_id == current_user_id)
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
        ((Friendship.requester_id == target.id) & (Friendship.addressee_id == current_user_id))
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
        # status is "refused" — allow re-sending
        existing.requester_id = current_user_id
        existing.addressee_id = target.id
        existing.status = "pending"
        _create_notification(
            user_id=target.id,
            notif_type="friend_request",
            payload={"friendship_id": existing.id, "from_user_id": current_user_id, "from_email": me.email},
        )
        db.session.commit()
        return jsonify({
            "msg": "Friend request re-sent",
            "friendship": existing.serialize(current_user_id=current_user_id),
        }), 201

    new_friendship = Friendship(requester_id=current_user_id, addressee_id=target.id, status="pending")
    db.session.add(new_friendship)
    db.session.flush()

    _create_notification(
        user_id=target.id,
        notif_type="friend_request",
        payload={"friendship_id": new_friendship.id, "from_user_id": current_user_id, "from_email": me.email},
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
    _delete_friend_request_notifications(friendship.id)

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
    _delete_friend_request_notifications(friendship.id)

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
        ((Friendship.requester_id == user_id) & (Friendship.addressee_id == current_user_id))
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
             .filter(User.id != current_user_id, User.email.ilike(f"%{q}%"))
             .limit(20)
             .all())

    results = []
    for u in users:
        pair = Friendship.query.filter(
            ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == u.id)) |
            ((Friendship.requester_id == u.id) & (Friendship.addressee_id == current_user_id))
        ).first()
        results.append({
            "id": u.id,
            "email": u.email,
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

def _compute_stats(user_id):
    """Shared helper — computes activity stats for any user_id."""
    events_created_count = Event.query.filter(Event.creator_id == user_id).count()
    today = datetime.utcnow().date()

    all_events = Event.query.all()
    participated_all = [e for e in all_events if user_id in [p.id for p in e.participants]]

    def _is_past(e):
        try:
            return datetime.strptime(e.date, "%Y-%m-%d").date() <= today
        except (ValueError, TypeError):
            return False

    participated = [e for e in participated_all if _is_past(e)]
    events_participated_count = len(participated)

    window_start = today - timedelta(weeks=4)
    recent_count = 0
    for e in participated:
        try:
            event_date = datetime.strptime(e.date, "%Y-%m-%d").date()
            if window_start <= event_date <= today:
                recent_count += 1
        except (ValueError, TypeError):
            continue

    activity_avg_per_week = round(recent_count / 4.0, 2)
    if activity_avg_per_week < 2:
        activity_level = "Peu actif"
    elif activity_avg_per_week < 3:
        activity_level = "Actif"
    else:
        activity_level = "Très actif"
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
        clash = User.query.filter(User.username == new_username, User.id != current_user_id).first()
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
            ((Friendship.requester_id == user_id) & (Friendship.addressee_id == current_user_id))
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

    # private fields — only visible to self or accepted friends
    if is_self or is_friend:
        data["email"] = user.email
        data["phone"] = user.phone
        data["birthdate"] = user.birthdate

    # friendship metadata
    if is_self:
        data["friendship_status"]    = "self"
        data["friendship_direction"] = None
        data["friendship_id"]        = None
    elif friendship:
        data["friendship_status"]    = friendship.status
        data["friendship_direction"] = "outgoing" if friendship.requester_id == current_user_id else "incoming"
        data["friendship_id"]        = friendship.id
    else:
        data["friendship_status"]    = "none"
        data["friendship_direction"] = None
        data["friendship_id"]        = None

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
        membership = next((m for m in r.memberships if m.user_id == current_user_id), None)
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

    is_friend = Friendship.query.filter(
        Friendship.status == "accepted",
        ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == target_id)) |
        ((Friendship.requester_id == target_id) & (Friendship.addressee_id == current_user_id))
    ).first()
    if not is_friend:
        return jsonify({"msg": "You can only DM accepted friends"}), 403

    user_a, user_b = sorted([current_user_id, target_id])
    room = ChatRoom.query.filter_by(type="dm", user_a_id=user_a, user_b_id=user_b).first()
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
        (Friendship.requester_id == current_user_id) | (Friendship.addressee_id == current_user_id)
    ).all()

    friends = []
    for f in friendships:
        other = f.addressee if f.requester_id == current_user_id else f.requester
        if not other:
            continue
        if q_low not in (other.email or "").lower() and q_low not in (other.username or "").lower():
            continue
        ua, ub = sorted([current_user_id, other.id])
        dm = ChatRoom.query.filter_by(type="dm", user_a_id=ua, user_b_id=ub).first()
        friends.append({
            "user": {
                "id": other.id,
                "email": other.email,
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

    messages = ChatMessage.query.filter_by(room_id=room.id).order_by(ChatMessage.created_at).all()
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
    text = (body.get("text") or "").strip() or None
    media_url = body.get("media_url") or None
    media_type = body.get("media_type") or None

    if not text and not media_url:
        return jsonify({"msg": "text or media_url is required"}), 400
    if media_url and media_type not in ("image", "audio"):
        return jsonify({"msg": "media_type must be 'image' or 'audio' when media_url is set"}), 400

    msg = ChatMessage(
        room_id=room.id, sender_id=current_user_id,
        text=text, media_url=media_url, media_type=media_type,
    )
    db.session.add(msg)

    membership = _get_or_create_membership(room.id, current_user_id)
    membership.last_read_at = datetime.utcnow()

    db.session.commit()
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

    messages = ChatMessage.query.filter_by(room_id=room.id).order_by(ChatMessage.created_at).all()
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
    text = (body.get("text") or "").strip() or None
    media_url = body.get("media_url") or None
    media_type = body.get("media_type") or None

    if not text and not media_url:
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
        text=text, media_url=media_url, media_type=media_type,
    )
    db.session.add(msg)

    membership = _get_or_create_membership(room.id, current_user_id)
    membership.last_read_at = datetime.utcnow()

    db.session.commit()
    return jsonify({"msg": "Message sent", "message": msg.serialize()}), 201


# =========================================================
# NOTIFICATIONS
# =========================================================

@api.route('/notifications', methods=['GET'])
@jwt_required()
def list_notifications():
    current_user_id = int(get_jwt_identity())
    q = Notification.query.filter_by(user_id=current_user_id)
    if request.args.get("only_unread") in ("1", "true", "True"):
        q = q.filter_by(is_read=False)
    notifs = q.order_by(Notification.created_at.desc()).all()
    return jsonify([n.serialize() for n in notifs]), 200


@api.route('/notifications/unread-count', methods=['GET'])
@jwt_required()
def notifications_unread_count():
    current_user_id = int(get_jwt_identity())
    count = Notification.query.filter_by(user_id=current_user_id, is_read=False).count()
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
    notifs = Notification.query.filter_by(user_id=current_user_id, is_read=False).all()
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