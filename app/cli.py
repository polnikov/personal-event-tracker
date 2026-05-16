"""Tiny CLI helpers. Run: python -m app.cli hash-password"""
import sys
import getpass
from .auth import hash_password


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m app.cli hash-password")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "hash-password":
        pw1 = getpass.getpass("Password: ")
        pw2 = getpass.getpass("Repeat:   ")
        if pw1 != pw2:
            print("Passwords don't match", file=sys.stderr)
            sys.exit(1)
        if len(pw1) < 8:
            print("Min 8 characters", file=sys.stderr)
            sys.exit(1)
        print("\nAdd to .env as APP_PASSWORD_HASH (single-quote it):\n")
        print(hash_password(pw1))
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
