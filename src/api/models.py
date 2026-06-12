from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    String, Boolean, Float, ForeignKey, Table, Column, Text,
    DateTime, UniqueConstraint, CheckConstraint, JSON, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

db = SQLAlchemy()

# ── Association table for event participants ─────────────
# rsvp: NULL (no answer yet) | 'going' | 'maybe' | 'not_going'
event_participants = Table(
    "event_participants",
    db.metadata,
    Column("event_id", ForeignKey("event.id"), primary_key=True),
    Column("user_id",  ForeignKey("user.id"),  primary_key=True),
    Column("rsvp",     String(20), nullable=True, default=None),
)


# ── USER ─────────────────────────────────────────────────
class User(db.Model):
    __tablename__ = "user"

    id:        Mapped[int]  = mapped_column(primary_key=True)
    email:     Mapped[str]  = mapped_column(String(120), unique=True, nullable=False)
    password:  Mapped[str]  = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean(), nullable=False)

    username:            Mapped[str] = mapped_column(String(50),  unique=True, nullable=True)
    first_name:          Mapped[str] = mapped_column(String(50),  nullable=True)
    last_name:           Mapped[str] = mapped_column(String(50),  nullable=True)
    city:                Mapped[str] = mapped_column(String(100), nullable=True)
    bio:                 Mapped[str] = mapped_column(Text,        nullable=True)
    profile_picture_url: Mapped[str] = mapped_column(Text, nullable=True)
    birthdate:           Mapped[str] = mapped_column(String(20),  nullable=True)
    phone:               Mapped[str] = mapped_column(String(30),  nullable=True)
    created_at:          Mapped[datetime] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)
    # Tanda 7E — confirmación de email por link firmado (GET
    # /verify-email/<token>). Los usuarios anteriores a esta tanda
    # quedan en True via server_default en la migración; los nuevos
    # nacen en False hasta que clican el link del correo.
    email_verified:      Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="true")

    def serialize(self):
        return {
            "id":                  self.id,
            "email":               self.email,
            "username":            self.username,
            "first_name":          self.first_name,
            "last_name":           self.last_name,
            "city":                self.city,
            "bio":                 self.bio,
            "profile_picture_url": self.profile_picture_url,
            "birthdate":           self.birthdate,
            "phone":               self.phone,
            "email_verified":      bool(self.email_verified),
            "created_at":          self.created_at.isoformat() + "Z" if self.created_at else None,
        }

    def public_brief(self):
        """Versión reducida (sin info sensible)."""
        return {
            "id":                  self.id,
            "username":            self.username,
            "first_name":          self.first_name,
            "last_name":           self.last_name,
            "profile_picture_url": self.profile_picture_url,
        }


# ── EVENT ─────────────────────────────────────────────────
class Event(db.Model):
    __tablename__ = "event"

    id:         Mapped[int]   = mapped_column(primary_key=True)
    title:      Mapped[str]   = mapped_column(String(120), nullable=True)
    date:       Mapped[str]   = mapped_column(String(50),  nullable=False)
    time:       Mapped[str]   = mapped_column(String(50),  nullable=False)
    location:   Mapped[str]   = mapped_column(String(255), nullable=False)
    latitude:   Mapped[float] = mapped_column(Float,       nullable=True)
    longitude:  Mapped[float] = mapped_column(Float,       nullable=True)
    details:    Mapped[str]   = mapped_column(Text,        nullable=True)
    image:      Mapped[str]   = mapped_column(Text, nullable=True)
    # Public events auto-invite all the creator's friends; private events are
    # only visible to people who were explicitly invited.
    is_public:  Mapped[bool]  = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    creator_id: Mapped[int]   = mapped_column(ForeignKey("user.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)
    # Tanda 7B — Validación post-evento del creador:
    #   None  → el evento aún no pasó, o pasó y el creador no respondió
    #   True  → el creador confirmó que el evento se realizó como previsto
    #   False → el creador indicó que NO se realizó (solo entonces se
    #           permite borrarlo; ver delete_event en routes.py)
    happened:   Mapped[bool]  = mapped_column(Boolean, nullable=True, default=None)

    creator:      Mapped["User"]       = relationship("User", foreign_keys=[creator_id])
    participants: Mapped[list["User"]] = relationship(
        "User", secondary=event_participants, lazy="selectin"
    )
    invitations:  Mapped[list["EventInvitation"]] = relationship(
        "EventInvitation",
        foreign_keys="EventInvitation.event_id",
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    suggestions:  Mapped[list["InviteSuggestion"]] = relationship(
        "InviteSuggestion",
        foreign_keys="InviteSuggestion.event_id",
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def serialize(self, current_user_id=None, rsvp_map=None):
        """Serialise the event.

        `rsvp_map` (optional): a dict {user_id: rsvp_value} for THIS event's
        participants, pre-computed by the caller. When passed, we skip the
        per-event SQL query — used by `get_events` to avoid N+1 queries
        when serialising many events at once.
        """
        from sqlalchemy import text
        if rsvp_map is None:
            rsvp_map = {}
            rows = db.session.execute(
                text("SELECT user_id, rsvp FROM event_participants WHERE event_id = :eid"),
                {"eid": self.id}
            ).fetchall()
            for row in rows:
                rsvp_map[row[0]] = row[1]

        participants_data = [
            {
                "id":                  p.id,
                "username":            p.username,
                "profile_picture_url": p.profile_picture_url,
                "rsvp":                rsvp_map.get(p.id),
            }
            for p in self.participants
        ]

        # Count "going" responses — used by the map marker badge.
        going_count = sum(1 for v in rsvp_map.values() if v == "going")

        creator_picture = self.creator.profile_picture_url if self.creator else None

        data = {
            "id":                 self.id,
            "title":              self.title,
            "date":               self.date,
            "time":               self.time,
            "location":           self.location,
            "latitude":           self.latitude,
            "longitude":          self.longitude,
            "details":            self.details,
            "image":              self.image,
            "is_public":          bool(self.is_public),
            # Tanda 7B — None | true | false (ver comentario en la columna).
            "happened":           self.happened,
            "creator_id":         self.creator_id,
            "creator_username":   self.creator.username if self.creator else None,
            "creator_picture":    creator_picture,
            "participants":       participants_data,
            "participants_count": len(self.participants),
            "going_count":        going_count,
            "pending_invitations": [
                {
                    "id":         inv.id,
                    "user_id":    inv.user_id,
                    "user_username": inv.user.username if inv.user else None,
                    "inviter_id": inv.inviter_id,
                }
                for inv in (self.invitations or [])
            ],
            "pending_invitations_count": len(self.invitations or []),
            "created_at":         self.created_at.isoformat() + "Z" if self.created_at else None,
        }

        if current_user_id is not None:
            data["my_rsvp"] = rsvp_map.get(current_user_id)

            if current_user_id == self.creator_id:
                data["my_status"] = "creator"
            elif current_user_id in [p.id for p in self.participants]:
                data["my_status"] = "accepted"
            elif any(inv.user_id == current_user_id for inv in (self.invitations or [])):
                data["my_status"] = "pending"
            else:
                data["my_status"] = "none"

            my_inv = next(
                (inv for inv in (self.invitations or []) if inv.user_id == current_user_id),
                None,
            )
            data["my_invitation_id"] = my_inv.id if my_inv else None

            # The creator also sees pending invite-suggestions from participants.
            if current_user_id == self.creator_id:
                data["pending_suggestions"] = [
                    {
                        "id":                  s.id,
                        "suggested_user_id":   s.suggested_user_id,
                        "suggested_user_username":
                            s.suggested_user.username if s.suggested_user else None,
                        "suggested_user_picture":
                            s.suggested_user.profile_picture_url if s.suggested_user else None,
                        "suggested_by_id":     s.suggested_by_id,
                        "suggested_by_username":
                            s.suggested_by.username if s.suggested_by else None,
                        "created_at":
                            s.created_at.isoformat() + "Z" if s.created_at else None,
                    }
                    for s in (self.suggestions or [])
                ]
                data["pending_suggestions_count"] = len(self.suggestions or [])

        return data


# ── FRIENDSHIP ────────────────────────────────────────────
class Friendship(db.Model):
    __tablename__ = "friendship"

    id:           Mapped[int] = mapped_column(primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    addressee_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    status:       Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at:   Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at:   Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    requester: Mapped["User"] = relationship("User", foreign_keys=[requester_id])
    addressee: Mapped["User"] = relationship("User", foreign_keys=[addressee_id])

    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friendship_pair"),
        CheckConstraint("requester_id <> addressee_id", name="ck_friendship_not_self"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'refused')",
            name="ck_friendship_status",
        ),
    )

    def serialize(self, current_user_id=None):
        data = {
            "id":           self.id,
            "requester_id": self.requester_id,
            "addressee_id": self.addressee_id,
            "status":       self.status,
            "created_at":   self.created_at.isoformat() + "Z" if self.created_at else None,
            "updated_at":   self.updated_at.isoformat() + "Z" if self.updated_at else None,
            "requester":    {"id": self.requester.id, "username": self.requester.username} if self.requester else None,
            "addressee":    {"id": self.addressee.id, "username": self.addressee.username} if self.addressee else None,
        }
        if current_user_id is not None:
            other = self.addressee if self.requester_id == current_user_id else self.requester
            # Tanda 7A — bio + foto del amigo para que las cartas de la
            # página Friends muestren la primera frase de su descripción
            # y su avatar real sin pedir el perfil completo uno a uno.
            # Solo campos NO sensibles (nunca email/phone/birthdate).
            data["friend"] = {
                "id":                  other.id,
                "username":            other.username,
                "bio":                 other.bio,
                "profile_picture_url": other.profile_picture_url,
            } if other else None
            data["direction"] = "outgoing" if self.requester_id == current_user_id else "incoming"
        return data


# ── EVENT INVITATION ─────────────────────────────────────────
# Pending invitations sent by the event creator (or auto-converted from a
# participant's accepted suggestion). When the invitee accepts/maybe →
# they join participants and this row is deleted. When refused → deleted.
class EventInvitation(db.Model):
    __tablename__ = "event_invitation"

    id:           Mapped[int] = mapped_column(primary_key=True)
    event_id:     Mapped[int] = mapped_column(ForeignKey("event.id"), nullable=False, index=True)
    user_id:      Mapped[int] = mapped_column(ForeignKey("user.id"),  nullable=False, index=True)
    inviter_id:   Mapped[int] = mapped_column(ForeignKey("user.id"),  nullable=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    event:   Mapped["Event"] = relationship("Event", foreign_keys=[event_id], back_populates="invitations")
    user:    Mapped["User"]  = relationship("User",  foreign_keys=[user_id])
    inviter: Mapped["User"]  = relationship("User",  foreign_keys=[inviter_id])

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_invitation_pair"),
    )

    def serialize(self):
        return {
            "id":         self.id,
            "event_id":   self.event_id,
            "user_id":    self.user_id,
            "inviter_id": self.inviter_id,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }


# ── INVITE SUGGESTION ──────────────────────────────────────
# A participant (non-creator) can suggest inviting one of their friends to
# the event. The creator then approves or refuses each suggestion. Once
# approved, the suggestion is converted into a real EventInvitation and
# this row is deleted.
class InviteSuggestion(db.Model):
    __tablename__ = "invite_suggestion"

    id:                Mapped[int] = mapped_column(primary_key=True)
    event_id:          Mapped[int] = mapped_column(ForeignKey("event.id"), nullable=False, index=True)
    suggested_user_id: Mapped[int] = mapped_column(ForeignKey("user.id"),  nullable=False, index=True)
    suggested_by_id:   Mapped[int] = mapped_column(ForeignKey("user.id"),  nullable=False, index=True)
    created_at:        Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    event:          Mapped["Event"] = relationship("Event", foreign_keys=[event_id], back_populates="suggestions")
    suggested_user: Mapped["User"]  = relationship("User",  foreign_keys=[suggested_user_id])
    suggested_by:   Mapped["User"]  = relationship("User",  foreign_keys=[suggested_by_id])

    __table_args__ = (
        UniqueConstraint("event_id", "suggested_user_id", name="uq_invite_suggestion_pair"),
    )

    def serialize(self):
        return {
            "id":                self.id,
            "event_id":          self.event_id,
            "suggested_user_id": self.suggested_user_id,
            "suggested_by_id":   self.suggested_by_id,
            "created_at":        self.created_at.isoformat() + "Z" if self.created_at else None,
        }


# ── CHAT ROOM ─────────────────────────────────────────────
class ChatRoom(db.Model):
    __tablename__ = "chat_room"

    id:         Mapped[int] = mapped_column(primary_key=True)
    type:       Mapped[str] = mapped_column(String(10), nullable=False, default="event")
    event_id:   Mapped[int] = mapped_column(ForeignKey("event.id"), nullable=True, unique=True, index=True)
    user_a_id:  Mapped[int] = mapped_column(ForeignKey("user.id"),  nullable=True, index=True)
    user_b_id:  Mapped[int] = mapped_column(ForeignKey("user.id"),  nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    event:    Mapped["Event"] = relationship("Event")
    user_a:   Mapped["User"]  = relationship("User", foreign_keys=[user_a_id])
    user_b:   Mapped["User"]  = relationship("User", foreign_keys=[user_b_id])
    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="room", cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )
    memberships: Mapped[list["ChatRoomMembership"]] = relationship(
        "ChatRoomMembership", back_populates="room", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id", name="uq_chat_room_dm_pair"),
        CheckConstraint("type IN ('event', 'dm')", name="ck_chat_room_type"),
    )

    def serialize(self, current_user_id=None):
        last = next(
            (m for m in reversed(self.messages) if not m.deleted),
            None,
        )
        last_message = None
        if last:
            last_message = {
                "id":           last.id,
                "text":         last.text,
                "media_url":    last.media_url,
                "media_type":   last.media_type,
                "sender_id":    last.sender_id,
                "sender_username": last.sender.username if last.sender else None,
                "created_at":   last.created_at.isoformat() + "Z" if last.created_at else None,
                "edited_at":    last.edited_at.isoformat() + "Z" if last.edited_at else None,
                "deleted":      last.deleted,
            }

        unread_count = 0
        if current_user_id is not None:
            membership = next(
                (m for m in self.memberships if m.user_id == current_user_id),
                None,
            )
            last_read_at = membership.last_read_at if membership else None
            for msg in self.messages:
                if msg.sender_id == current_user_id:
                    continue
                if msg.deleted:
                    continue
                if last_read_at is None or msg.created_at > last_read_at:
                    unread_count += 1

        base = {
            "id":             self.id,
            "type":           self.type,
            "event_id":       self.event_id,
            "created_at":     self.created_at.isoformat() + "Z" if self.created_at else None,
            "messages_count": len([m for m in self.messages if not m.deleted]),
            "unread_count":   unread_count,
            "last_message":   last_message,
        }

        if self.type == "event":
            base.update({
                "participants":   [{"id": p.id, "username": p.username} for p in self.event.participants] if self.event else [],
                "event_title":    self.event.title if self.event else None,
                "event_image":    self.event.image if self.event else None,
                "dm_partner":     None,
            })
        else:  # dm
            users = []
            if self.user_a: users.append(self.user_a)
            if self.user_b: users.append(self.user_b)
            partner = None
            if current_user_id is not None:
                partner = next((u for u in users if u.id != current_user_id), None)
            base.update({
                "participants": [{"id": u.id, "username": u.username} for u in users],
                "event_title":  None,
                "event_image":  None,
                "dm_partner":   {
                    "id":                  partner.id,
                    "username":            partner.username,
                    "profile_picture_url": partner.profile_picture_url,
                } if partner else None,
            })

        return base


# ── CHAT ROOM MEMBERSHIP ──────────────────────────────────
class ChatRoomMembership(db.Model):
    __tablename__ = "chat_room_membership"

    id:           Mapped[int] = mapped_column(primary_key=True)
    room_id:      Mapped[int] = mapped_column(ForeignKey("chat_room.id"), nullable=False, index=True)
    user_id:      Mapped[int] = mapped_column(ForeignKey("user.id"),      nullable=False, index=True)
    last_read_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    room: Mapped["ChatRoom"] = relationship("ChatRoom", back_populates="memberships")
    user: Mapped["User"]     = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_chat_room_membership_pair"),
    )

    def serialize(self):
        return {
            "id":           self.id,
            "room_id":      self.room_id,
            "user_id":      self.user_id,
            "last_read_at": self.last_read_at.isoformat() + "Z" if self.last_read_at else None,
            "created_at":   self.created_at.isoformat() + "Z" if self.created_at else None,
        }


# ── CHAT MESSAGE ──────────────────────────────────────────
class ChatMessage(db.Model):
    __tablename__ = "chat_message"

    id:         Mapped[int] = mapped_column(primary_key=True)
    room_id:    Mapped[int] = mapped_column(ForeignKey("chat_room.id"), nullable=False, index=True)
    sender_id:  Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    text:       Mapped[str] = mapped_column(Text, nullable=True)
    media_url:  Mapped[str] = mapped_column(Text, nullable=True)
    media_type: Mapped[str] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    edited_at:  Mapped[datetime] = mapped_column(DateTime, nullable=True)
    deleted:    Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    room:   Mapped["ChatRoom"] = relationship("ChatRoom", back_populates="messages")
    sender: Mapped["User"]     = relationship("User", foreign_keys=[sender_id])

    __table_args__ = (
        CheckConstraint(
            "deleted = TRUE OR (text IS NOT NULL) OR (media_url IS NOT NULL)",
            name="ck_chat_message_payload",
        ),
        CheckConstraint(
            "media_type IS NULL OR media_type IN ('image', 'audio')",
            name="ck_chat_message_media_type",
        ),
    )

    def serialize(self):
        if self.deleted:
            return {
                "id":           self.id,
                "room_id":      self.room_id,
                "sender_id":    self.sender_id,
                "sender_username": self.sender.username if self.sender else None,
                "text":         None,
                "media_url":    None,
                "media_type":   None,
                "deleted":      True,
                "created_at":   self.created_at.isoformat() + "Z" if self.created_at else None,
                "edited_at":    self.edited_at.isoformat() + "Z" if self.edited_at else None,
            }
        return {
            "id":           self.id,
            "room_id":      self.room_id,
            "sender_id":    self.sender_id,
            "sender_username": self.sender.username if self.sender else None,
            "text":         self.text,
            "media_url":    self.media_url,
            "media_type":   self.media_type,
            "deleted":      False,
            "created_at":   self.created_at.isoformat() + "Z" if self.created_at else None,
            "edited_at":    self.edited_at.isoformat() + "Z" if self.edited_at else None,
        }


# ── NOTIFICATION ──────────────────────────────────────────
# Types currently emitted (all enforced by the ck_notification_type
# CheckConstraint below — keep both lists in sync when adding a new one):
#
#   FRIENDSHIP
#     - "friend_request"       payload: {friendship_id, from_user_id, from_username}
#     - "friend_accepted"      payload: {friendship_id, from_user_id, from_username}
#
#   EVENT INVITATIONS / VISIBILITY
#     - "event_invite"         payload: {event_id, invitation_id, from_user_id,
#                                        from_username, event_title, event_date, event_time}
#     - "event_public"         payload: same as event_invite — sent to every
#                                        friend when a public event is created/turned public
#
#   INVITE SUGGESTIONS
#     - "invite_suggestion"    payload: {event_id, suggestion_id, suggested_user_id,
#                                        suggested_username, from_user_id, from_username,
#                                        event_title}                  (sent to creator)
#     - "suggestion_approved"  payload: {event_id, event_title, suggested_user_id,
#                                        suggested_username, from_user_id, from_username}
#                                                                      (sent to suggester)
#     - "suggestion_refused"   payload: same as suggestion_approved    (sent to suggester)
#
#   EVENT LIFECYCLE
#     - "event_updated"        payload: {event_id, event_title, event_date, event_time,
#                                        location, from_user_id, from_username}
#                                        (sent to participants ≠ creator when meta changes)
#     - "event_cancelled"      payload: {event_id, event_title, event_date, event_time,
#                                        from_user_id, from_username}
#                                        (sent to participants ≠ creator BEFORE delete)
#     - "event_removed"        payload: {event_id, event_title, from_user_id, from_username}
#                                        (sent to the user the creator just kicked out)
#     - "rsvp_changed"         payload: {event_id, event_title, responder_id,
#                                        responder_username, response}
#                                        (sent to creator when a participant changes rsvp)
#     - "event_reminder"       payload: {event_id, event_title, event_date, event_time,
#                                        hours_until}
#                                        (sent by the dispatch-reminders cron endpoint)
#     - "event_confirmation"   payload: {event_id, event_title, event_date, event_time,
#                                        response?}
#                                        (sent to the creator once the event is past,
#                                         asking "did it happen as planned?". When the
#                                         creator answers via PUT /events/<id>/confirm,
#                                         the backend stamps payload.response = "yes"|"no"
#                                         and marks the notif read — same keep-the-row
#                                         pattern as friend_request.status)
class Notification(db.Model):
    __tablename__ = "notification"

    id:         Mapped[int]  = mapped_column(primary_key=True)
    user_id:    Mapped[int]  = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    type:       Mapped[str]  = mapped_column(String(40), nullable=False)
    payload:    Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_read:    Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        CheckConstraint(
            "type IN ("
            "'friend_request', 'event_invite', 'invite_suggestion', 'event_public', "
            "'friend_accepted', 'event_updated', 'event_cancelled', 'event_removed', "
            "'rsvp_changed', 'suggestion_approved', 'suggestion_refused', 'event_reminder', "
            "'event_confirmation'"
            ")",
            name="ck_notification_type",
        ),
        Index("ix_notification_user_read", "user_id", "is_read"),
    )

    def serialize(self):
        return {
            "id":         self.id,
            "user_id":    self.user_id,
            "type":       self.type,
            "payload":    self.payload or {},
            "is_read":    self.is_read,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }