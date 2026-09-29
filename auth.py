from __future__ import annotations

import hashlib
import secrets
import sqlite3
from pathlib import Path

DATABASE_PATH = Path("data/smartroute.db")


def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS drivers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                phone TEXT,
                status TEXT NOT NULL DEFAULT 'Available',
                vehicle_type TEXT NOT NULL DEFAULT 'Motorcycle',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                order_code TEXT NOT NULL UNIQUE,
                customer_name TEXT NOT NULL,
                address TEXT NOT NULL,
                phone TEXT,
                priority TEXT NOT NULL DEFAULT 'Normal',
                status TEXT NOT NULL DEFAULT 'Pending',
                driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
                time_window TEXT,
                failed_reason TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS route_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                start_name TEXT NOT NULL,
                destination_name TEXT NOT NULL,
                stops_json TEXT NOT NULL DEFAULT '[]',
                distance_km REAL NOT NULL,
                duration_min REAL NOT NULL,
                overall_risk TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS admin_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                failed_login_count INTEGER NOT NULL DEFAULT 0,
                locked_until TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_login_at TEXT
            );
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token_hash TEXT PRIMARY KEY,
                admin_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS rider_document_reviews (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                document_type TEXT NOT NULL CHECK(document_type IN ('nid_card', 'driving_license', 'profile_photo')),
                status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'resubmission_required')),
                reason TEXT NOT NULL DEFAULT '',
                reviewed_by INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, document_type)
            );
            CREATE TABLE IF NOT EXISTS admin_account_controls (
                subject_type TEXT NOT NULL CHECK(subject_type IN ('user', 'driver')),
                subject_id INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('active', 'deactivated', 'suspended')),
                reason TEXT NOT NULL DEFAULT '',
                updated_by INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (subject_type, subject_id)
            );
            CREATE TABLE IF NOT EXISTS admin_activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                subject_type TEXT NOT NULL DEFAULT '',
                subject_id INTEGER,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
            CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity_log(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_document_reviews_status ON rider_document_reviews(status, updated_at DESC);
            """
        )
        columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
        if "role" not in columns:
            connection.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'")
        admin_columns = {row[1] for row in connection.execute("PRAGMA table_info(admin_accounts)")}
        if "failed_login_count" not in admin_columns:
            connection.execute("ALTER TABLE admin_accounts ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0")
        if "locked_until" not in admin_columns:
            connection.execute("ALTER TABLE admin_accounts ADD COLUMN locked_until TEXT")
        migrations = {
            "orders": {
                "owner_user_id": "INTEGER REFERENCES users(id) ON DELETE CASCADE",
                "failed_reason": "TEXT",
            },
            "drivers": {
                "owner_user_id": "INTEGER REFERENCES users(id) ON DELETE CASCADE",
            },
        }
        for table, table_columns in migrations.items():
            existing = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            for column, definition in table_columns.items():
                if column not in existing:
                    connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            first_user = connection.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
            if first_user:
                connection.execute("UPDATE orders SET owner_user_id = ? WHERE owner_user_id IS NULL", (first_user["id"],))
                connection.execute("UPDATE drivers SET owner_user_id = ? WHERE owner_user_id IS NULL", (first_user["id"],))


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    salt_hex, digest_hex = encoded.split("$", 1)
    expected = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 210_000)
    return secrets.compare_digest(expected.hex(), digest_hex)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with connect() as connection:
        connection.execute("INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)", (token_digest(token), user_id))
    return token


def get_user(token: str | None) -> dict[str, object] | None:
    if not token:
        return None
    with connect() as connection:
        row = connection.execute(
            "SELECT users.id, users.name, users.email, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?",
            (token_digest(token),),
        ).fetchone()
    return dict(row) if row else None


def delete_session(token: str | None) -> None:
    if token:
        with connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_digest(token),))


def create_admin_session(admin_id: int) -> str:
    token = secrets.token_urlsafe(40)
    with connect() as connection:
        connection.execute(
            "INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, datetime('now', '+12 hours'))",
            (token_digest(token), admin_id),
        )
        connection.execute("UPDATE admin_accounts SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", (admin_id,))
    return token


def get_admin(token: str | None) -> dict[str, object] | None:
    if not token:
        return None
    with connect() as connection:
        row = connection.execute(
            "SELECT admin_accounts.id, admin_accounts.username, admin_accounts.email, admin_accounts.is_active, admin_accounts.created_at FROM admin_sessions JOIN admin_accounts ON admin_accounts.id = admin_sessions.admin_id WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > CURRENT_TIMESTAMP AND admin_accounts.is_active = 1",
            (token_digest(token),),
        ).fetchone()
    return dict(row) if row else None


def delete_admin_session(token: str | None) -> None:
    if token:
        with connect() as connection:
            connection.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (token_digest(token),))