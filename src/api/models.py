from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    String, Boolean, Float, ForeignKey, Table, Column, Text,
    DateTime, UniqueConstraint, CheckConstraint, JSON, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

db = SQLAlchemy()

# ── Association table for event participants (accepted only) ─────────
# Pending invitations live in `event_invitation` instead. Once an invitee
# accepts, their row is moved here and the invitation is deleted.
event_participants = Table(
    "event_participants",
    db.metadata,
    Column("event_id", ForeignKey("event.id"), primary_key=True),
    Column("user_id",  ForeignKey("user.id"),  primary_key=True),
)

# ── USER ─────────────────────────────────────────────────
class User(db.Model):
    __tablename__ = "user"

    id:        Mapped[int]  = mapped_column(primary_key=True)
    email:     Mapped[str]  = mapped_column(String(120), unique=True, nullable=False)
    password:  Mapped[str]  = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean(), nullable=False)

    # ── profile fields ──────────────────────────────
    username:            Mapped[str] = mapped_column(String(50),  unique=True, nullable=True)
    first_name:          Mapped[str] = mapped_column(String(50),  nullable=True)
    last_name:           Mapped[str] = mapped_column(String(50),  nullable=True)
    city:                Mapped[str] = mapped_column(String(100), nullable=True)
    bio:                 Mapped[str] = mapped_column(Text,        nullable=True)
    profile_picture_url: Mapped[str] = mapped_column(String(500), nullable=True)
    birthdate:           Mapped[str] = mapped_column(String(20),  nullable=True)
    phone:               Mapped[str] = mapped_column(String(30),  nullable=True)
    created_at:          Mapped[datetime] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)

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
            "created_at":          self.created_at.isoformat() if self.created_at else None,
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
    image: Mapped[str] = mapped_column(Text, nullable=True)
    creator_id: Mapped[int]   = mapped_column(ForeignKey("user.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)

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

    def serialize(self, current_user_id=None):
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
            "creator_id":         self.creator_id,
            "creator_email":      self.creator.email,
            "participants":       [{"id": p.id, "email": p.email} for p in self.participants],
            "participants_count": len(self.participants),
            "pending_invitations": [
                {"id": inv.id, "user_id": inv.user_id,
                 "user_email": inv.user.email if inv.user else None}
                for inv in (self.invitations or [])
            ],
            "pending_invitations_count": len(self.invitations or []),
            "created_at":         self.created_at.isoformat() if self.created_at else None,
        }
        if current_user_id is not None:
            if current_user_id == self.creator_id:
                data["my_status"] = "creator"
            elif current_user_id in [p.id for p in self.participants]:
                data["my_status"] = "accepted"
            elif any(inv.user_id == current_user_id for inv in (self.invitations or [])):
                data["my_status"] = "pending"
            else:
                data["my_status"] = "none"
            # invitation_id is handy for client-side accept/refuse routing
            my_inv = next((inv for inv in (self.invitations or []) if inv.user_id == current_user_id), None)
            data["my_invitation_id"] = my_inv.id if my_inv else None
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
            "created_at":   self.created_at.isoformat() if self.created_at else None,
            "updated_at":   self.updated_at.isoformat() if self.updated_at else None,
            "requester":    {"id": self.requester.id, "email": self.requester.email} if self.requester else None,
            "addressee":    {"id": self.addressee.id, "email": self.addressee.email} if self.addressee else None,
        }
        if current_user_id is not None:
            other = self.addressee if self.requester_id == current_user_id else self.requester
            data["friend"]    = {"id": other.id, "email": other.email} if other else None
            data["direction"] = "outgoing" if self.requester_id == current_user_id else "incoming"
        return data


# ── EVENT INVITATION ─────────────────────────────────────────
# Pending only. When the invitee accepts, the row is deleted and the user
# is added to event_participants. When the invitee refuses, the row is
# deleted with no further effect (no historical "refused" rows kept).
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
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ── CHAT ROOM ─────────────────────────────────────────────
# Two flavours of rooms share the same table:
#   - "event" : tied to an event via event_id. Membership = event.participants.
#   - "dm"    : 1-on-1 chat between user_a_id and user_b_id, stored in
#               canonical order (user_a_id < user_b_id).
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
        last = self.messages[-1] if self.messages else None
        last_message = None
        if last:
            last_message = {
                "id":           last.id,
                "text":         last.text,
                "media_url":    last.media_url,
                "media_type":   last.media_type,
                "sender_id":    last.sender_id,
                "sender_email": last.sender.email if last.sender else None,
                "created_at":   last.created_at.isoformat() if last.created_at else None,
                "edited_at":    last.edited_at.isoformat() if last.edited_at else None,
            }

        # unread count for the current user — messages newer than their
        # last_read_at on this room and not authored by themselves.
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
                if last_read_at is None or msg.created_at > last_read_at:
                    unread_count += 1

        base = {
            "id":             self.id,
            "type":           self.type,
            "event_id":       self.event_id,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "messages_count": len(self.messages),
            "unread_count":   unread_count,
            "last_message":   last_message,
        }

        if self.type == "event":
            base.update({
                "participants":   [{"id": p.id, "email": p.email} for p in self.event.participants] if self.event else [],
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
                "participants": [{"id": u.id, "email": u.email} for u in users],
                "event_title":  None,
                "event_image":  None,
                "dm_partner":   {
                    "id":                  partner.id,
                    "email":               partner.email,
                    "username":            partner.username,
                    "profile_picture_url": partner.profile_picture_url,
                } if partner else None,
            })

        return base


# ── CHAT ROOM MEMBERSHIP ──────────────────────────────────
# Tracks per-user "last read" timestamp for a room. Created on demand
# the first time a user opens the room. Used to compute the unread
# message count shown in the navbar badge.
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
            "last_read_at": self.last_read_at.isoformat() if self.last_read_at else None,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }


# ── CHAT MESSAGE ──────────────────────────────────────────
# A message has either text, media_url, or both. media_type qualifies
# the attachment ("image" | "audio"). The media payload itself lives in
# media_url as a base64 dataURL (same approach used by event.image).
# edited_at is set when the sender edits the text within the allowed
# window (15 min) — see PUT /chat/rooms/<rid>/messages/<mid>.
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

    room:   Mapped["ChatRoom"] = relationship("ChatRoom", back_populates="messages")
    sender: Mapped["User"]     = relationship("User", foreign_keys=[sender_id])

    __table_args__ = (
        CheckConstraint(
            "(text IS NOT NULL) OR (media_url IS NOT NULL)",
            name="ck_chat_message_payload",
        ),
        CheckConstraint(
            "media_type IS NULL OR media_type IN ('image', 'audio')",
            name="ck_chat_message_media_type",
        ),
    )

    def serialize(self):
        return {
            "id":           self.id,
            "room_id":      self.room_id,
            "sender_id":    self.sender_id,
            "sender_email": self.sender.email if self.sender else None,
            "text":         self.text,
            "media_url":    self.media_url,
            "media_type":   self.media_type,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
            "edited_at":    self.edited_at.isoformat() if self.edited_at else None,
        }


# ── NOTIFICATION ──────────────────────────────────────────
# Types currently emitted:
#   - "friend_request"  payload: {"friendship_id": int, "from_user_id": int, "from_email": str}
#   - "event_invite"    payload: {"event_id": int, "invitation_id": int,
#                                 "from_user_id": int, "from_email": str,
#                                 "event_title": str|None, "event_date": str|None,
#                                 "event_time": str|None}
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
            "type IN ('friend_request', 'event_invite')",
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
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
