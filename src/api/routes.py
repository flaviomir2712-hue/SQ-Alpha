from flask import Blueprint, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from api.models import db, User, Event, Friendship
from datetime import datetime, timedelta
api = Blueprint('api', __name__)
CORS(api)


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

    new_user = User(
        email=email,
        password=generate_password_hash(password),
        is_active=True
    )
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

    event = Event(
        date=body["date"],
        time=body["time"],
        location=body["location"],
        latitude=body.get("latitude"),
        longitude=body.get("longitude"),
        details=body.get("details"),
        image=body.get("image"),
        creator_id=current_user_id
    )

    # add creator as participant automatically
    creator = db.session.get(User, current_user_id)
    event.participants.append(creator)

    # add invited friends
    for friend_id in body.get("invitedFriends", []):
        friend = db.session.get(User, friend_id)
        if friend:
            event.participants.append(friend)

    db.session.add(event)
    db.session.commit()

    return jsonify({"msg": "Event created", "event": event.serialize()}), 201


@api.route('/events', methods=['GET'])
@jwt_required()
def get_events():
    current_user_id = int(get_jwt_identity())

    # returns events where the user is creator OR was invited
    all_events = Event.query.all()
    visible = [
        e for e in all_events
        if e.creator_id == current_user_id
        or current_user_id in [p.id for p in e.participants]
    ]

    return jsonify([e.serialize() for e in visible]), 200


# =========================================================
# FRIENDS
# =========================================================
 
# ---------- LIST ACCEPTED FRIENDS ----------
@api.route('/friends', methods=['GET'])
@jwt_required()
def list_friends():
    current_user_id = int(get_jwt_identity())
 
    friendships = Friendship.query.filter(
        Friendship.status == "accepted",
        (Friendship.requester_id == current_user_id) |
        (Friendship.addressee_id == current_user_id)
    ).all()
 
    return jsonify([f.serialize(current_user_id=current_user_id) for f in friendships]), 200
 
 
# ---------- LIST PENDING REQUESTS ----------
# ?direction=incoming  -> requests sent TO me     (default)
# ?direction=outgoing  -> requests sent BY me
# ?direction=all       -> both
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
            (Friendship.requester_id == current_user_id) |
            (Friendship.addressee_id == current_user_id)
        )
    else:
        return jsonify({"msg": "direction must be incoming, outgoing or all"}), 400
 
    return jsonify([f.serialize(current_user_id=current_user_id) for f in base.all()]), 200
 
 
# ---------- SEND A FRIEND REQUEST ----------
# Body: { "user_id": <int> }  OR  { "email": "<str>" }
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
 
    # look for an existing row in either direction
    existing = Friendship.query.filter(
        ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == target.id)) |
        ((Friendship.requester_id == target.id) & (Friendship.addressee_id == current_user_id))
    ).first()
 
    if existing:
        if existing.status == "accepted":
            return jsonify({
                "msg": "You are already friends",
                "friendship": existing.serialize(current_user_id=current_user_id)
            }), 409
        if existing.status == "pending":
            return jsonify({
                "msg": "A request is already pending",
                "friendship": existing.serialize(current_user_id=current_user_id)
            }), 409
        # status == "refused"  ->  allow reopening by resetting to pending
        existing.requester_id = current_user_id
        existing.addressee_id = target.id
        existing.status = "pending"
        db.session.commit()
        return jsonify({
            "msg": "Friend request re-sent",
            "friendship": existing.serialize(current_user_id=current_user_id)
        }), 201
 
    new_friendship = Friendship(
        requester_id=current_user_id,
        addressee_id=target.id,
        status="pending"
    )
    db.session.add(new_friendship)
    db.session.commit()
 
    return jsonify({
        "msg": "Friend request sent",
        "friendship": new_friendship.serialize(current_user_id=current_user_id)
    }), 201
 
 
# ---------- ACCEPT ----------
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
    db.session.commit()
 
    return jsonify({
        "msg": "Friend request accepted",
        "friendship": friendship.serialize(current_user_id=current_user_id)
    }), 200
 
 
# ---------- REFUSE ----------
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
    db.session.commit()
 
    return jsonify({
        "msg": "Friend request refused",
        "friendship": friendship.serialize(current_user_id=current_user_id)
    }), 200
 
 
# ---------- CANCEL OUTGOING REQUEST ----------
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
 
    db.session.delete(friendship)
    db.session.commit()
    return jsonify({"msg": "Friend request cancelled"}), 200
 
 
# ---------- DELETE / UNFRIEND ----------
# Removes any accepted friendship between me and <user_id>.
@api.route('/friends/<int:user_id>', methods=['DELETE'])
@jwt_required()
def unfriend(user_id):
    current_user_id = int(get_jwt_identity())
 
    friendship = Friendship.query.filter(
        Friendship.status == "accepted"
    ).filter(
        ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == user_id)) |
        ((Friendship.requester_id == user_id) & (Friendship.addressee_id == current_user_id))
    ).first()
 
    if not friendship:
        return jsonify({"msg": "Friendship not found"}), 404
 
    db.session.delete(friendship)
    db.session.commit()
    return jsonify({"msg": "Friend removed"}), 200
 
 
# ---------- SEARCH USERS (helper for adding friends) ----------
# ?q=<string> matches against email, returns up to 20 users, excludes me.
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
 
    # Augment with current friendship status so the UI can show the right button.
    results = []
    for u in users:
        pair = Friendship.query.filter(
            ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == u.id)) |
            ((Friendship.requester_id == u.id) & (Friendship.addressee_id == current_user_id))
        ).first()
 
        results.append({
            "id":     u.id,
            "email":  u.email,
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
 
# ---------- GET MY PROFILE ----------
# Returns user fields + stats:
#   events_created_count        — events where I am the creator
#   events_participated_count   — events where I appear as participant
#   activity_avg_per_week       — avg # of events I participated in over the last 4 weeks
#   activity_level              — "Peu actif" | "Actif" | "Très actif"
#   activity_percent            — 0..100, capped, for the UI bar
@api.route('/profile/me', methods=['GET'])
@jwt_required()
def get_my_profile():
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
 
    # ----- count events created and participated -----
    events_created_count = Event.query.filter(Event.creator_id == current_user_id).count()
 
    all_events = Event.query.all()
    participated = [e for e in all_events if current_user_id in [p.id for p in e.participants]]
    events_participated_count = len(participated)
 
    # ----- compute activity over the last 4 weeks -----
    # event.date is a "YYYY-MM-DD" string; we parse it and ignore unparseable rows.
    today = datetime.utcnow().date()
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
 
    # bar fills up linearly between 0 and 5 events/week
    activity_percent = min(100, int((activity_avg_per_week / 5.0) * 100))
 
    data = user.serialize()
    data["stats"] = {
        "events_created_count":      events_created_count,
        "events_participated_count": events_participated_count,
        "activity_avg_per_week":     activity_avg_per_week,
        "activity_level":            activity_level,
        "activity_percent":          activity_percent,
    }
    return jsonify(data), 200
 
 
# ---------- UPDATE MY PROFILE ----------
# Body: any subset of editable fields. Email and password are NOT editable here.
@api.route('/profile/me', methods=['PUT'])
@jwt_required()
def update_my_profile():
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
 
    body = request.get_json() or {}
 
    editable = [
        "username",
        "first_name",
        "last_name",
        "city",
        "bio",
        "profile_picture_url",
        "birthdate",
        "phone",
    ]
 
    # username must stay unique if provided
    new_username = body.get("username")
    if new_username and new_username != user.username:
        clash = User.query.filter(
            User.username == new_username,
            User.id != current_user_id
        ).first()
        if clash:
            return jsonify({"msg": "Username already taken"}), 409
 
    for field in editable:
        if field in body:
            value = body[field]
            # treat empty strings as None so the DB keeps clean nulls
            setattr(user, field, value if value not in ("", None) else None)
 
    db.session.commit()
 
    return jsonify({"msg": "Profile updated", "user": user.serialize()}), 200
 
 
# ---------- GET ANOTHER USER'S PROFILE ----------
# Visibility rules:
#   - self        -> full profile (use /profile/me)
#   - friend      -> full profile minus password
#   - other user  -> only public-safe fields (no email/phone/birthdate)
# Always exposes the friendship_status with the current user.
@api.route('/profile/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user_profile(user_id):
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
 
    # friendship state with current user
    friendship = None
    if user_id != current_user_id:
        friendship = Friendship.query.filter(
            ((Friendship.requester_id == current_user_id) & (Friendship.addressee_id == user_id)) |
            ((Friendship.requester_id == user_id) & (Friendship.addressee_id == current_user_id))
        ).first()
 
    is_self = (user_id == current_user_id)
    is_friend = friendship is not None and friendship.status == "accepted"
 
    # public payload
    data = {
        "id":                  user.id,
        "username":            user.username,
        "first_name":          user.first_name,
        "last_name":           user.last_name,
        "city":                user.city,
        "bio":                 user.bio,
        "profile_picture_url": user.profile_picture_url,
        "created_at":          user.created_at.isoformat() if user.created_at else None,
    }
 
    # private fields revealed to self or accepted friends
    if is_self or is_friend:
        data["email"]     = user.email
        data["phone"]     = user.phone
        data["birthdate"] = user.birthdate
 
    # friendship metadata
    if is_self:
        data["friendship_status"] = "self"
        data["friendship_direction"] = None
        data["friendship_id"] = None
    elif friendship:
        data["friendship_status"] = friendship.status
        data["friendship_direction"] = (
            "outgoing" if friendship.requester_id == current_user_id else "incoming"
        )
        data["friendship_id"] = friendship.id
    else:
        data["friendship_status"] = "none"
        data["friendship_direction"] = None
        data["friendship_id"] = None
 
    # ----- same stats block as /profile/me -----
    events_created_count = Event.query.filter(Event.creator_id == user_id).count()
    all_events = Event.query.all()
    participated = [e for e in all_events if user_id in [p.id for p in e.participants]]
    events_participated_count = len(participated)
 
    today = datetime.utcnow().date()
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
 
    data["stats"] = {
        "events_created_count":      events_created_count,
        "events_participated_count": events_participated_count,
        "activity_avg_per_week":     activity_avg_per_week,
        "activity_level":            activity_level,
        "activity_percent":          activity_percent,
    }
 
    return jsonify(data), 200