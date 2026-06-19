from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    String, Boolean, Float, Integer, ForeignKey, Table, Column, Text,
    DateTime, UniqueConstraint, CheckConstraint, JSON, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

db = SQLAlchemy()

# ── friend caps ──────────────────────────────────────────
# A free person can hold up to 150 accepted friends (Dunbar-ish). The
# consumer 'premium' plan lifts that to PREMIUM_FRIEND_CAP. Enforced
# server-side in the friend-request send / accept routes.
FREE_FRIEND_CAP = 150
PREMIUM_FRIEND_CAP = 1000

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

    # ── account type ────────────────────────────────
    # Set at registration via the 3-button chooser (person / company /
    # influencer). Drives which profile UI the app renders.
    #   'person'      → regular user (the original flow; default)
    #   'business'    → owner account; owns one or more Business rows
    #   'influencer'  → user with public influencer profile (flag-only,
    #                   reuses username / first_name / profile_picture_url)
    account_type:       Mapped[str] = mapped_column(
        String(20), nullable=False, default="person", server_default="person")
    # Influencer-only fields (NULL for person / business accounts).
    homebase:           Mapped[str] = mapped_column(String(120), nullable=True)
    professional_email: Mapped[str] = mapped_column(String(120), nullable=True)

    # ── premium (consumer) cosmetics ────────────────
    # Reward coins shown on the profile. Purely cosmetic / gamification —
    # NOT real money and NOT spendable (keeping them spendable would drag
    # us into EU e-money / PSD2 territory). Visible to the user's friends.
    # Earned through rewards; a person on the 'premium' plan accrues them.
    premium_coins: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0")

    # An owner (account_type == 'business') can manage several businesses;
    # this powers the dropdown profile-switcher in the wireframe.
    businesses: Mapped[list["Business"]] = relationship(
        "Business",
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    # Paid subscriptions (provider-agnostic). A user may hold one user-level
    # sub (person→premium / influencer→pro, business_id NULL) plus one 'pro'
    # sub per business they own (business_id set).
    subscriptions: Mapped[list["Subscription"]] = relationship(
        "Subscription",
        back_populates="user",
        foreign_keys="Subscription.user_id",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    # ── billing-tier helpers ────────────────────────
    # Billing tier is decoupled from account_type: a paying person is
    # "premium"; a paying influencer is "pro" (user-level); a business owner
    # pays "pro" PER COMPANY (see Business.is_pro()).
    def personal_subscription(self):
        """The user-level sub (business_id is NULL), if any."""
        for s in (self.subscriptions or []):
            if s.business_id is None:
                return s
        return None

    def has_active_personal_sub(self, plan=None):
        sub = self.personal_subscription()
        if not sub or not sub.is_active():
            return False
        return plan is None or sub.plan == plan

    def is_premium(self):
        """Person with an active user-level 'premium' subscription."""
        return self.account_type == "person" and self.has_active_personal_sub("premium")

    def is_pro(self):
        """Pro status for gating pro features / showing the Pro badge:
        - influencer: an active user-level 'pro' sub;
        - business owner: owns at least one company with an active 'pro' sub.
        (Per-event gating uses the specific Business.is_pro().)"""
        if self.account_type == "influencer":
            return self.has_active_personal_sub("pro")
        if self.account_type == "business":
            return any(b.is_pro() for b in (self.businesses or []))
        return False

    def friend_cap(self):
        """Max accepted friends. Free persons: 150. Premium persons: 1000.
        Business / influencer accounts use follows, not friends, but if they
        do hold friendships the generous cap applies."""
        if self.account_type in ("business", "influencer"):
            return PREMIUM_FRIEND_CAP
        return PREMIUM_FRIEND_CAP if self.is_premium() else FREE_FRIEND_CAP

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
            "account_type":        self.account_type or "person",
            "homebase":            self.homebase,
            "professional_email":  self.professional_email,
            # ── billing / premium ──
            "is_pro":              self.is_pro(),
            "is_premium":          self.is_premium(),
            "premium_coins":       self.premium_coins or 0,
            "subscription":        (self.personal_subscription().serialize()
                                    if self.personal_subscription() else None),
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
            # Premium cosmetics are public to friends/viewers (that's the point).
            "premium_coins":       self.premium_coins or 0,
            "is_premium":          self.is_premium(),
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
    # Optional ticket / entry price in EUR. Only pro (subscribed business /
    # influencer) creators may set it; NULL = free event. Stored as Float
    # for simple display; no currency math is done server-side.
    price:      Mapped[float] = mapped_column(Float, nullable=True)
    # Pro-only private note for the company's TEAM (briefing before the
    # event). Never shown publicly — only surfaced through the management
    # endpoints to the creator / team. Team visibility is enforced per role
    # in the team layer (Phase 5b).
    team_note:  Mapped[str]   = mapped_column(Text, nullable=True)
    # Optional event duration in MINUTES (None = unknown). Lets the company
    # hub's "events at your place" count use the real end time instead of the
    # 4h fallback window. Any creator may set it; not pro-gated.
    duration_min: Mapped[int] = mapped_column(Integer, nullable=True)
    # Public events auto-invite all the creator's friends; private events are
    # only visible to people who were explicitly invited.
    is_public:  Mapped[bool]  = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    creator_id: Mapped[int]   = mapped_column(ForeignKey("user.id"), nullable=False)
    # Optional: the business this event belongs to. NULL for events created
    # by a regular person. When set, the event shows up in that business's
    # "events" carousel. creator_id still records WHO (the owner) created it.
    business_id: Mapped[int]  = mapped_column(ForeignKey("business.id"), nullable=True)
    # Phase 5b — pending deletion request (double-confirm). When an EDITOR or a
    # non-manager creator requests a delete, the event is NOT removed yet: a
    # manager/owner must approve it. NULL = no pending request.
    pending_delete_by: Mapped[int]      = mapped_column(ForeignKey("user.id"), nullable=True)
    pending_delete_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)
    # Tanda 7B — Validación post-evento del creador:
    #   None  → el evento aún no pasó, o pasó y el creador no respondió
    #   True  → el creador confirmó que el evento se realizó como previsto
    #   False → el creador indicó que NO se realizó (solo entonces se
    #           permite borrarlo; ver delete_event en routes.py)
    happened:   Mapped[bool]  = mapped_column(Boolean, nullable=True, default=None)

    creator:      Mapped["User"]       = relationship("User", foreign_keys=[creator_id])
    business:     Mapped["Business"]   = relationship("Business", foreign_keys=[business_id])
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

    def serialize(self, current_user_id=None, rsvp_map=None, include_team=False):
        """Serialise the event.

        `rsvp_map` (optional): a dict {user_id: rsvp_value} for THIS event's
        participants, pre-computed by the caller. When passed, we skip the
        per-event SQL query — used by `get_events` to avoid N+1 queries
        when serialising many events at once.

        `include_team` (management views only): adds the private `team_note`.
        Never set it for public/participant-facing responses.
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
            "price":              self.price,
            "duration_min":       self.duration_min,
            # Phase 5b — true if a deletion is awaiting manager approval.
            "pending_delete":     bool(self.pending_delete_by),
            "is_public":          bool(self.is_public),
            # Tanda 7B — None | true | false (ver comentario en la columna).
            "happened":           self.happened,
            "creator_id":         self.creator_id,
            "creator_username":   self.creator.username if self.creator else None,
            "creator_picture":    creator_picture,
            "business_id":        self.business_id,
            "business_name":      self.business.name if self.business else None,
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

        # Private team briefing — management views only.
        if include_team:
            data["team_note"] = self.team_note

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
                # Premium cosmetics are visible to friends.
                "premium_coins":       other.premium_coins or 0,
                "is_premium":          other.is_premium(),
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

# ── BUSINESS ──────────────────────────────────────────────
# A business is NOT a login. It is owned by a User whose
# account_type == 'business'. One owner can have many businesses
# (the dropdown profile-switcher in the wireframe).
#
# The public business profile renders, in order:
#   0. profile_picture_url   1. name        2. location
#   3. hours (JSON)          4. rating()    5. events carousel
#   6. posts feed
# `rating` is ALWAYS computed from reviews, never stored.
class Business(db.Model):
    __tablename__ = "business"

    id:                  Mapped[int] = mapped_column(primary_key=True)
    owner_id:            Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    name:                Mapped[str] = mapped_column(String(120), nullable=False)
    category:            Mapped[str] = mapped_column(String(60),  nullable=True)   # restaurant | bar | cafe | brand | ...
    location:            Mapped[str] = mapped_column(String(255), nullable=True)
    latitude:            Mapped[float] = mapped_column(Float, nullable=True)
    longitude:           Mapped[float] = mapped_column(Float, nullable=True)
    profile_picture_url: Mapped[str] = mapped_column(Text, nullable=True)
    description:         Mapped[str] = mapped_column(Text, nullable=True)
    # Opening hours as JSON, e.g.
    #   {"mon": {"open": "09:00", "close": "18:00"}, "tue": {...}, ...}
    # A missing day == closed. Kept as JSON to stay flexible without
    # extra tables.
    hours:               Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    created_at:          Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    # ── company verification & billing (per-company Pro) ──
    # The owner pays per company, so each one uploads a proof document
    # (registration certificate, ID, etc.) and is verified before going live.
    proof_url: Mapped[str]  = mapped_column(Text, nullable=True)
    verified:  Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false")

    owner: Mapped["User"] = relationship("User", back_populates="businesses", foreign_keys=[owner_id])
    posts: Mapped[list["BusinessPost"]] = relationship(
        "BusinessPost",
        back_populates="business",
        cascade="all, delete-orphan",
        order_by="BusinessPost.created_at.desc()",
        lazy="selectin",
    )
    reviews: Mapped[list["Review"]] = relationship(
        "Review",
        back_populates="business",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    # Events created under this business (the carousel). FK lives on Event;
    # this side is read-only (events are assigned a business at creation
    # via Event.business_id, never through this collection).
    events: Mapped[list["Event"]] = relationship(
        "Event",
        foreign_keys="Event.business_id",
        viewonly=True,
        lazy="selectin",
    )
    # One 'pro' subscription per company (provider-agnostic). NULL = not pro.
    subscription: Mapped["Subscription"] = relationship(
        "Subscription",
        back_populates="business",
        foreign_keys="Subscription.business_id",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def is_pro(self):
        """This company has an active 'pro' subscription."""
        return self.subscription is not None and self.subscription.is_active()

    def rating(self):
        """Average review score (1-5) rounded to 1 decimal, or None."""
        vals = [r.rating for r in (self.reviews or []) if r.rating is not None]
        if not vals:
            return None
        return round(sum(vals) / len(vals), 1)

    def serialize(self, include_feed=False, current_user_id=None):
        data = {
            "id":                  self.id,
            "owner_id":            self.owner_id,
            "owner_username":      self.owner.username if self.owner else None,
            "name":                self.name,
            "category":            self.category,
            "location":            self.location,
            "latitude":            self.latitude,
            "longitude":           self.longitude,
            "profile_picture_url": self.profile_picture_url,
            "description":         self.description,
            "hours":               self.hours or {},
            "rating":              self.rating(),
            "reviews_count":       len(self.reviews or []),
            "events_count":        len(self.events or []),
            "posts_count":         len(self.posts or []),
            # ── verification & billing ──
            "verified":            bool(self.verified),
            "has_proof":           bool(self.proof_url),
            "is_pro":              self.is_pro(),
            "created_at":          self.created_at.isoformat() + "Z" if self.created_at else None,
        }
        if include_feed:
            data["posts"]   = [p.serialize() for p in (self.posts or [])]
            data["events"]  = [e.serialize(current_user_id=current_user_id) for e in (self.events or [])]
            data["reviews"] = [r.serialize() for r in (self.reviews or [])]
        return data


# ── BUSINESS POST ─────────────────────────────────────────
# An entry in the business's feed (item 6 of the business profile).
class BusinessPost(db.Model):
    __tablename__ = "business_post"

    id:          Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False, index=True)
    image:       Mapped[str] = mapped_column(Text, nullable=True)
    text:        Mapped[str] = mapped_column(Text, nullable=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    business: Mapped["Business"] = relationship("Business", back_populates="posts")

    def serialize(self):
        return {
            "id":          self.id,
            "business_id": self.business_id,
            "image":       self.image,
            "text":        self.text,
            "created_at":  self.created_at.isoformat() + "Z" if self.created_at else None,
        }


# ── REVIEW ────────────────────────────────────────────────
# A 1-5 star review left by a User on a Business (item 4 — drives the
# computed rating). One review per (business, author); re-posting updates
# the existing row at the route level.
class Review(db.Model):
    __tablename__ = "review"

    id:          Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False, index=True)
    author_id:   Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    rating:      Mapped[int] = mapped_column(Integer, nullable=False)
    text:        Mapped[str] = mapped_column(Text, nullable=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    business: Mapped["Business"] = relationship("Business", back_populates="reviews")
    author:   Mapped["User"]     = relationship("User", foreign_keys=[author_id])

    __table_args__ = (
        UniqueConstraint("business_id", "author_id", name="uq_review_author"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating_range"),
    )

    def serialize(self):
        return {
            "id":              self.id,
            "business_id":     self.business_id,
            "author_id":       self.author_id,
            "author_username": self.author.username if self.author else None,
            "author_picture":  self.author.profile_picture_url if self.author else None,
            "rating":          self.rating,
            "text":            self.text,
            "created_at":      self.created_at.isoformat() + "Z" if self.created_at else None,
        }


# ── EVENT OPINION ─────────────────────────────────────────
# A short opinion a user (typically an influencer) leaves about an event
# they attended. Surfaced on the influencer profile: each "place went"
# event card swaps the usual "Details" button for "@username's opinion".
# One opinion per (author, event).
class EventOpinion(db.Model):
    __tablename__ = "event_opinion"

    id:         Mapped[int] = mapped_column(primary_key=True)
    author_id:  Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    event_id:   Mapped[int] = mapped_column(ForeignKey("event.id"), nullable=False, index=True)
    text:       Mapped[str] = mapped_column(Text, nullable=True)
    rating:     Mapped[int] = mapped_column(Integer, nullable=True)   # optional 1-5
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    author: Mapped["User"]  = relationship("User", foreign_keys=[author_id])
    event:  Mapped["Event"] = relationship("Event", foreign_keys=[event_id])

    __table_args__ = (
        UniqueConstraint("author_id", "event_id", name="uq_opinion_author_event"),
        CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)",
                        name="ck_opinion_rating_range"),
    )

    def serialize(self):
        return {
            "id":              self.id,
            "author_id":       self.author_id,
            "author_username": self.author.username if self.author else None,
            "event_id":        self.event_id,
            "text":            self.text,
            "rating":          self.rating,
            "created_at":      self.created_at.isoformat() + "Z" if self.created_at else None,
        }


# ── FOLLOW ────────────────────────────────────────────────
# A one-directional follow. Targets are EITHER a Business (place) OR a
# User that is an influencer/owner — never both (XOR enforced). Unlike
# Friendship, follows are not mutual and need no acceptance: businesses
# and influencers "have only followers, not friends".
class Follow(db.Model):
    __tablename__ = "follow"

    id:             Mapped[int] = mapped_column(primary_key=True)
    follower_id:    Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    business_id:    Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=True, index=True)
    target_user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=True, index=True)
    created_at:     Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    follower:    Mapped["User"]     = relationship("User", foreign_keys=[follower_id])
    target_user: Mapped["User"]     = relationship("User", foreign_keys=[target_user_id])
    business:    Mapped["Business"] = relationship("Business", foreign_keys=[business_id])

    __table_args__ = (
        UniqueConstraint("follower_id", "business_id", name="uq_follow_business"),
        UniqueConstraint("follower_id", "target_user_id", name="uq_follow_user"),
        # Exactly one of business_id / target_user_id must be set (XOR).
        CheckConstraint(
            "(business_id IS NOT NULL) <> (target_user_id IS NOT NULL)",
            name="ck_follow_one_target"),
    )


# ── SUBSCRIPTION ──────────────────────────────────────────
# One paid subscription per user. Provider-agnostic on purpose: the column
# set carries whatever a real provider (Stripe, Paddle, Lemon Squeezy…)
# would give us, but nothing here imports or assumes any specific provider.
# In production the `status` / `current_period_end` are driven by the
# provider's webhook; in dev a 'stub' provider lets us activate locally
# without a real charge so the rest of the app can be exercised end-to-end.
#
# plan:
#   'pro'      → business / influencer professional features (priced events…)
#   'premium'  → person consumer perks (bigger friend cap, rewards, coins)
class Subscription(db.Model):
    __tablename__ = "subscription"

    id:      Mapped[int] = mapped_column(primary_key=True)
    # Owner of the subscription. NO LONGER unique: a user can hold one
    # user-level sub (person→premium / influencer→pro, business_id NULL) AND
    # one 'pro' sub per business they own (business_id set).
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id"), nullable=False, index=True)
    # Set => this is a per-company 'pro' sub (one per business). NULL => the
    # user-level sub. Unique so a business can't have two subs (multiple NULLs
    # are allowed, so user-level subs are deduped in code, not by the DB).
    business_id: Mapped[int] = mapped_column(
        ForeignKey("business.id"), nullable=True, unique=True, index=True)

    plan:    Mapped[str] = mapped_column(String(20), nullable=False)  # 'pro' | 'premium'
    # Lifecycle (mirrors typical provider states):
    #   'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'
    status:  Mapped[str] = mapped_column(
        String(20), nullable=False, default="incomplete", server_default="incomplete")

    # Provider linkage — all NULLable until a real provider is wired in.
    # provider: 'stub' (dev, no charge) | 'stripe' | 'paddle' | 'lemonsqueezy'
    provider:                 Mapped[str] = mapped_column(String(20),  nullable=True)
    provider_customer_id:     Mapped[str] = mapped_column(String(120), nullable=True)
    provider_subscription_id: Mapped[str] = mapped_column(String(120), nullable=True)

    current_period_end: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at:         Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at:         Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="subscriptions")
    business: Mapped["Business"] = relationship(
        "Business", foreign_keys=[business_id], back_populates="subscription")

    def is_active(self):
        """Active if status is active/trialing AND the period hasn't lapsed."""
        if self.status not in ("active", "trialing"):
            return False
        if self.current_period_end and self.current_period_end < datetime.utcnow():
            return False
        return True

    def serialize(self):
        return {
            "id":                 self.id,
            "plan":               self.plan,
            "status":             self.status,
            "active":             self.is_active(),
            "provider":           self.provider,
            "business_id":        self.business_id,
            "current_period_end": self.current_period_end.isoformat() + "Z" if self.current_period_end else None,
        }


# ── TEAM MEMBERSHIP & INVITES (Phase 5b) ──────────────────
# Per-company teams with roles. The OWNER is derived from Business.owner_id
# (no row here); this table holds manager / editor / viewer.
# `can_manage_managers` is the owner-granted "co-management" authorization
# that lets a manager manage OTHER managers too.
TEAM_ROLES = ("manager", "editor", "viewer")


class TeamMembership(db.Model):
    __tablename__ = "team_membership"

    id:          Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False, index=True)
    user_id:     Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    role:        Mapped[str] = mapped_column(String(20), nullable=False, default="viewer", server_default="viewer")
    # Owner-granted authorization to manage OTHER managers (co-management).
    can_manage_managers: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false")
    created_at:  Mapped[datetime] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)

    business: Mapped["Business"] = relationship("Business", foreign_keys=[business_id])
    user:     Mapped["User"]     = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("business_id", "user_id", name="uq_team_membership_biz_user"),
    )

    def serialize(self):
        return {
            "user_id":             self.user_id,
            "username":            self.user.username if self.user else None,
            "profile_picture_url": self.user.profile_picture_url if self.user else None,
            "role":                self.role,
            "can_manage_managers": bool(self.can_manage_managers),
            "business_id":         self.business_id,
        }


class TeamInvite(db.Model):
    __tablename__ = "team_invite"

    id:          Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("business.id"), nullable=False, index=True)
    role:        Mapped[str] = mapped_column(String(20), nullable=False, default="viewer", server_default="viewer")
    # Single-use token: the accept endpoint consumes it (status → accepted).
    token:       Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # Targeted invite: email OR username set → must match the accepting user.
    # Both NULL → open single-use link (first account that opens it joins).
    email:            Mapped[str] = mapped_column(String(255), nullable=True)
    invited_username: Mapped[str] = mapped_column(String(80), nullable=True)
    status:      Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    created_by:  Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    created_at:  Mapped[datetime] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)
    expires_at:  Mapped[datetime] = mapped_column(DateTime, nullable=True)
    accepted_by: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=True)

    business: Mapped["Business"] = relationship("Business", foreign_keys=[business_id])

    def serialize(self, include_token=False):
        d = {
            "id":               self.id,
            "business_id":      self.business_id,
            "role":             self.role,
            "email":            self.email,
            "invited_username": self.invited_username,
            "status":           self.status,
            "targeted":         bool(self.email or self.invited_username),
            "expires_at":       self.expires_at.isoformat() + "Z" if self.expires_at else None,
            "created_at":       self.created_at.isoformat() + "Z" if self.created_at else None,
        }
        if include_token:
            d["token"] = self.token
        return d
