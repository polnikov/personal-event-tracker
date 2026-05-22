"""One-shot CLI to obtain a Google OAuth refresh_token on the dev machine.

Run this on a machine with a browser (your Windows dev box) — NOT on the
Pi. It uses InstalledAppFlow's local-server loopback to capture the
callback, so no public URL / Funnel cookie magic is required.

Usage
-----
1.  In Google Cloud Console → APIs & Services → Credentials, create a
    second OAuth client of type **Desktop app** in the same project.
    Download the client secret JSON, or copy the client_id / client_secret.

2.  From the project root on your dev machine:

      .venv\\Scripts\\python.exe scripts\\google_oauth_local.py \\
          --client-id "123-abc.apps.googleusercontent.com" \\
          --client-secret "GOCSPX-..."

    (Or `--client-secrets path\\to\\client_secret.json` to skip the args.)

3.  A browser tab opens with Google consent → grant Calendar access.
    The script prints the resulting refresh_token + email.

4.  Open https://<your-funnel>/settings/google → expand
    "Подключить вручную" → paste the values → Save.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Allow Google to return a different scope set than what we asked for —
# we still warn the user explicitly if calendar is missing.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

import httpx
from google_auth_oauthlib.flow import InstalledAppFlow


DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--client-id", help="OAuth client ID (Desktop app type)")
    p.add_argument("--client-secret", help="OAuth client secret")
    p.add_argument(
        "--client-secrets",
        help="Path to client_secret.json downloaded from Google Cloud (alternative to --client-id/--client-secret)",
    )
    p.add_argument(
        "--scopes",
        nargs="*",
        default=DEFAULT_SCOPES,
        help="OAuth scopes to request (default: calendar + openid + userinfo.email)",
    )
    p.add_argument(
        "--port",
        type=int,
        default=0,
        help="Local port for the loopback callback (default: any free port)",
    )
    args = p.parse_args()

    if args.client_secrets:
        flow = InstalledAppFlow.from_client_secrets_file(args.client_secrets, scopes=args.scopes)
    elif args.client_id and args.client_secret:
        client_config = {
            "installed": {
                "client_id": args.client_id,
                "client_secret": args.client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }
        }
        flow = InstalledAppFlow.from_client_config(client_config, scopes=args.scopes)
    else:
        p.error("Provide --client-secrets or both --client-id and --client-secret")
        return 2

    print("\n→ Откроется окно браузера. Завершите вход и выдайте доступ.\n", flush=True)
    creds = flow.run_local_server(port=args.port, prompt="consent", access_type="offline")

    if not creds.refresh_token:
        print(
            "Google не вернул refresh_token. Это бывает, если consent уже был ранее.\n"
            "Решение: открой https://myaccount.google.com/permissions, удали приложение из списка\n"
            "и запусти скрипт снова.",
            file=sys.stderr,
        )
        return 1

    granted = set(creds.scopes or [])
    required_calendar = "https://www.googleapis.com/auth/calendar"
    if required_calendar not in granted:
        print(
            f"\n⚠️  Google НЕ ВЫДАЛ scope {required_calendar}.\n"
            "Скорее всего на странице consent ты не поставил галочку рядом с\n"
            '«See, edit, share, and permanently delete all the calendars you can access using Google Calendar».\n'
            "Удали доступ на https://myaccount.google.com/permissions и запусти скрипт снова.\n"
            f"Выданные scopes: {' '.join(sorted(granted))}\n",
            file=sys.stderr,
        )
        return 1

    # Best-effort email lookup
    email = None
    try:
        r = httpx.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=10,
        )
        if r.status_code == 200:
            email = r.json().get("email")
    except Exception:
        pass

    print("\n────────── REFRESH TOKEN ──────────")
    print(creds.refresh_token)
    print("────────────────────────────────────")
    print(f"email:  {email or '(не получен)'}")
    print(f"scopes: {' '.join(creds.scopes or [])}")

    # Optional machine-readable bundle
    bundle = {
        "refresh_token": creds.refresh_token,
        "email": email,
        "scopes": creds.scopes or DEFAULT_SCOPES,
    }
    out_path = Path("google_credentials.json")
    out_path.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    print(f"\nТакже сохранено в {out_path.resolve()} (можно удалить после ввода в UI).")

    print(
        "\nДальше: открой https://<твой-funnel>/settings/google → "
        "«Подключить вручную» → вставь refresh_token + email → Save.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
