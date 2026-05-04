import argparse
import getpass
import sys

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models import User, UserRole


def create_manager(username: str, full_name: str, password: str | None = None) -> int:
    if not password:
        password = getpass.getpass("Password: ")
        confirmation = getpass.getpass("Confirm password: ")
        if password != confirmation:
            raise ValueError("Passwords do not match")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")

    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.username == username))
        if existing is not None:
            raise ValueError(f"User already exists: {username}")
        user = User(
            username=username,
            full_name=full_name,
            role=UserRole.manager,
            hashed_password=get_password_hash(password),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Flow-POS administration commands")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_manager_parser = subparsers.add_parser("create-manager")
    create_manager_parser.add_argument("--username", required=True)
    create_manager_parser.add_argument("--full-name", required=True)
    create_manager_parser.add_argument("--password", default=None)

    args = parser.parse_args(argv)
    try:
        if args.command == "create-manager":
            user_id = create_manager(args.username, args.full_name, args.password)
            print(f"Created manager user {args.username} with id {user_id}")
            return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
