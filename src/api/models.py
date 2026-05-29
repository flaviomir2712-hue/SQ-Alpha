from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import String, Boolean, Float, ForeignKey, Table, Column, Text, DateTime, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
 
db = SQLAlchemy()

# ── Association table for event participants ─────────────
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
    date:       Mapped[str]   = mapped_column(String(50),  nullable=False)
    time:       Mapped[str]   = mapped_column(String(50),  nullable=False)
    location:   Mapped[str]   = mapped_column(String(255), nullable=False)
    latitude:   Mapped[float] = mapped_column(Float,       nullable=True)
    longitude:  Mapped[float] = mapped_column(Float,       nullable=True)
    details:    Mapped[str]   = mapped_column(Text,        nullable=True)
    image:      Mapped[str]   = mapped_column(String(500), nullable=True)
    creator_id: Mapped[int]   = mapped_column(ForeignKey("user.id"), nullable=False)

    creator:      Mapped["User"]       = relationship("User", foreign_keys=[creator_id])
    participants: Mapped[list["User"]] = relationship(
        "User", secondary=event_participants, lazy="selectin"
    )

    def serialize(self):
        return {
            "id":                 self.id,
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
        }



# ── FRIENDSHIP ────────────────────────────────────────────
# A single row represents a directed request from `requester_id`
# to `addressee_id`. Status transitions:
#   pending  -> accepted   (addressee accepts)
#   pending  -> refused    (addressee refuses; row stays for history)
#   accepted -> (deleted)  (either side removes the friendship)
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
        # When current_user_id is supplied, also expose the "other" user
        # so the client can render the friend without extra lookups.
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