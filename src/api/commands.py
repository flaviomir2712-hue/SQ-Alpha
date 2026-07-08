
import click
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash
from api.models import db, User, Event, Friendship

"""
In this file, you can add as many commands as you want using the @app.cli.command decorator
Flask commands are useful to run cronjobs or tasks outside of the API but still in integration
with your database, for example: Import the price of bitcoin every night at 12am.
"""
def setup_commands(app):

    """
    Dev seeding command: creates N usable accounts (hashed password,
    unique username, pre-verified email so they can log in immediately).
    Usage: $ flask insert-test-users 5
    """
    @app.cli.command("insert-test-users")
    @click.argument("count")
    def insert_test_users(count):
        print("Creating test users")
        for x in range(1, int(count) + 1):
            email = "test_user{}@test.com".format(x)
            if User.query.filter_by(email=email).first():
                print("User: ", email, " already exists, skipping.")
                continue
            user = User(
                email=email,
                username="test_user{}".format(x),
                password=generate_password_hash("123456"),
                is_active=True,
                email_verified=True,
            )
            db.session.add(user)
            db.session.commit()
            print("User: ", user.email, " created (password: 123456).")

        print("All test users created")

    """
    Fills a couple of test users' worth of friendships and events so the
    map/friends/events screens aren't empty on a fresh database. Safe to
    re-run: it skips anything that already exists.
    Usage: $ flask insert-test-data
    """
    @app.cli.command("insert-test-data")
    def insert_test_data():
        users = User.query.filter(User.email.like("test_user%@test.com")).order_by(User.id).all()
        if len(users) < 2:
            print("Run 'flask insert-test-users 3' first -- need at least 2 test users.")
            return

        for a, b in zip(users, users[1:]):
            if Friendship.query.filter(
                ((Friendship.requester_id == a.id) & (Friendship.addressee_id == b.id)) |
                ((Friendship.requester_id == b.id) & (Friendship.addressee_id == a.id))
            ).first():
                continue
            db.session.add(Friendship(requester_id=a.id, addressee_id=b.id, status="accepted"))
            print("Friendship: ", a.username, " <-> ", b.username)

        creator = users[0]
        if not Event.query.filter_by(creator_id=creator.id).first():
            tomorrow = datetime.utcnow() + timedelta(days=1)
            event = Event(
                title="SideQuest test meetup",
                date=tomorrow.strftime("%Y-%m-%d"),
                time="19:00",
                location="Test City",
                is_public=True,
                creator_id=creator.id,
            )
            event.participants.append(creator)
            db.session.add(event)
            print("Event: ", event.title, " created by ", creator.username)

        db.session.commit()
        print("Test data ready")

    """
    Grants the /admin/ panel to an existing user. There is no UI for this
    on purpose -- staff access is a deploy-time/ops decision, not something
    a user can flip on themselves.
    Usage: $ flask promote-admin someone@example.com
    """
    @app.cli.command("promote-admin")
    @click.argument("email")
    def promote_admin(email):
        user = User.query.filter_by(email=email.strip().lower()).first()
        if not user:
            print("No user with email: ", email)
            return
        user.is_admin = True
        db.session.commit()
        print(user.email, " can now access /admin/.")
