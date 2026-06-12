"""add event.happened + event_confirmation notification type

Tanda 7B — Past-event validation:

  1. New nullable column `event.happened`:
       None  → event not past yet, or past but unanswered
       True  → creator confirmed it took place as planned
       False → creator said it did NOT take place
     Nullable + no default → purely additive, existing rows are untouched
     and the deploy on Render is safe.

  2. Adds 'event_confirmation' to the `ck_notification_type`
     CheckConstraint so the backend can ask the creator "did the event
     happen as planned?" once the event date/time is in the past.

The 12 existing types stay valid.

Revision ID: c4e8a1f6d203
Revises: 36c19108d735
Create Date: 2026-06-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e8a1f6d203'
down_revision = '36c19108d735'
branch_labels = None
depends_on = None


# Single source of truth for the type whitelist — keep in sync with the
# matching CheckConstraint in src/api/models.py (Notification class).
NEW_TYPES = (
    "friend_request", "event_invite", "invite_suggestion", "event_public",
    "friend_accepted", "event_updated", "event_cancelled", "event_removed",
    "rsvp_changed", "suggestion_approved", "suggestion_refused", "event_reminder",
    "event_confirmation",
)

OLD_TYPES = (
    "friend_request", "event_invite", "invite_suggestion", "event_public",
    "friend_accepted", "event_updated", "event_cancelled", "event_removed",
    "rsvp_changed", "suggestion_approved", "suggestion_refused", "event_reminder",
)


def _in_clause(types_tuple):
    """Build the `type IN (...)` SQL fragment from a Python tuple."""
    quoted = ", ".join("'{}'".format(t) for t in types_tuple)
    return "type IN ({})".format(quoted)


def upgrade():
    # Additive nullable column — no backfill needed, no default required.
    op.add_column(
        "event",
        sa.Column("happened", sa.Boolean(), nullable=True),
    )

    # batch_alter_table works for both SQLite and PostgreSQL — the project
    # uses PG in Codespaces/Render but keeping it portable is cheap.
    with op.batch_alter_table("notification") as batch_op:
        batch_op.drop_constraint("ck_notification_type", type_="check")
        batch_op.create_check_constraint(
            "ck_notification_type",
            _in_clause(NEW_TYPES),
        )


def downgrade():
    # Existing rows with the new type would block the recreated constraint —
    # purge them first so the downgrade always succeeds.
    op.execute(
        "DELETE FROM notification WHERE type NOT IN ({})".format(
            ", ".join("'{}'".format(t) for t in OLD_TYPES)
        )
    )
    with op.batch_alter_table("notification") as batch_op:
        batch_op.drop_constraint("ck_notification_type", type_="check")
        batch_op.create_check_constraint(
            "ck_notification_type",
            _in_clause(OLD_TYPES),
        )

    op.drop_column("event", "happened")
