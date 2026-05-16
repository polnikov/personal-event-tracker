from fastapi import APIRouter, Request, HTTPException, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..auth import verify_password, login_user, logout_user, is_authenticated
from ..config import settings
from ..schemas import AuthMe, LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/login", response_model=AuthMe)
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginRequest):
    ok = (
        payload.username == settings.APP_USERNAME
        and verify_password(payload.password, settings.APP_PASSWORD_HASH)
    )
    if not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Неверные учётные данные")
    login_user(request, payload.username)
    return AuthMe(username=payload.username, authenticated=True)


@router.post("/logout")
async def logout(request: Request):
    logout_user(request)
    return {"ok": True}


@router.get("/me", response_model=AuthMe)
async def me(request: Request):
    if is_authenticated(request):
        return AuthMe(username=request.session.get("user"), authenticated=True)
    return AuthMe(username=None, authenticated=False)
