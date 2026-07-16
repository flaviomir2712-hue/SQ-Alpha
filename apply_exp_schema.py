"""One-off: apply the EXP schema to whatever database your app is configured
to use (Postgres via DATABASE_URL, or the SQLite dev fallback).

Run it from the repo root, in the same environment your app runs in:

    python apply_exp_schema.py
    # or, if you use pipenv:   pipenv run python apply_exp_schema.py

Safe to run more than once — it only creates what's missing.
"""
import os
import sys

sys.path.insert(0, "src")  # so "api.models" imports like the app does

from flask import Flask
from sqlalchemy import text, inspect
from api.models import db  # registers every model (incl. ExpLedger) on db.metadata

url = os.getenv("DATABASE_URL")
if url:
    url = url.replace("postgres://", "postgresql://")
else:
    url = "sqlite:////tmp/test.db"
    print("DATABASE_URL not set — using the SQLite dev fallback:", url)

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

with app.app_context():
    # 1) Creates any missing tables from the models — i.e. exp_ledger — in the
    #    correct dialect. Existing tables are left untouched.
    db.create_all()

    # 2) Add the "I went" confirmation column to the existing participants table.
    insp = inspect(db.engine)
    cols = [c["name"] for c in insp.get_columns("event_participants")]
    if "confirmed_at" not in cols:
        db.session.execute(text("ALTER TABLE event_participants ADD COLUMN confirmed_at TIMESTAMP"))
        db.session.commit()
        print("Added event_participants.confirmed_at")
    else:
        print("event_participants.confirmed_at already present")

    print("exp_ledger present:", inspect(db.engine).has_table("exp_ledger"))
    print("Done — EXP schema applied to:", url.split("@")[-1] if "@" in url else url)
