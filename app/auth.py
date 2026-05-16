from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHash
from fastapi import Request, HTTPException, status
from .config import settings


_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHash):
        return False


def is_authenticated(request: Request) -> bool:
    return bool(request.session.get("user"))


def require_auth(request: Request):
    if not is_authenticated(request):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def login_user(request: Request, username: str) -> None:
    request.session["user"] = username


def logout_user(request: Request) -> None:
    request.session.clear()
