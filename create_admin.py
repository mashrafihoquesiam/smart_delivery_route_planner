from __future__ import annotations

import argparse
import getpass

from auth import connect, hash_password, initialize_database


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a SmartRoute BD administrator account.")
    parser.add_argument("--username", required=True)
    parser.add_argument("--email", required=True)
    arguments = parser.parse_args()
    username = arguments.username.strip()
    email = arguments.email.strip().lower()
    if len(username) < 3 or "@" not in email:
        parser.error("Provide a username of at least 3 characters and a valid email address.")
    password = getpass.getpass("Admin password (minimum 14 characters): ")
    confirmation = getpass.getpass("Confirm admin password: ")
    if len(password) < 14:
        parser.error("Admin passwords must be at least 14 characters.")
    if password != confirmation:
        parser.error("Passwords do not match.")
    initialize_database()
    try:
        with connect() as connection:
            connection.execute(
                "INSERT INTO admin_accounts (username, email, password_hash) VALUES (?, ?, ?)",
                (username, email, hash_password(password)),
            )
    except Exception as exc:
        parser.error(f"Could not create administrator account: {exc}")
    print(f"Created administrator {username} ({email}).")


if __name__ == "__main__":
    main()
