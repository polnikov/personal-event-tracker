# Трекер событий

Персональный PWA для учёта событий (тренировок, занятий и т.п.), клиентов, истории цен и статистики. Один пользователь, своя БД, развёртывается на домашнем мини-сервере.

> Полная инструкция по локальному запуску и деплою — в `SETUP.md` (не в репозитории).

## Возможности

- Категории и подкатегории, история цен (snapshot стоимости в события)
- События: длительность, дата начала, авто-окончание, авто-стоимость, привязка клиента
- Клиенты: статистика, история событий (Будущие/Прошедшие)
- Календарь: Месяц / Неделя (time-grid) / Список с фильтром по клиенту
- Дашборд и Отчёт: круговые диаграммы по подкатегориям, доход по месяцам/дням, события с роялти
- PWA с офлайн-кешем (vite-plugin-pwa)
- Auth: один пользователь, argon2-хэш пароля, session cookie, rate-limiting

## Стек

- **Backend (`app/`)**: FastAPI · SQLAlchemy 2.0 · SQLite · Alembic · session-auth (argon2) + slowapi · Pydantic v2
- **Frontend (`web/`)**: Vite + React 18 + TypeScript · TanStack Query · React Router v6 · react-hook-form + Zod · ECharts · Phosphor icons · кастомный CSS-дизайн-система
- **Инфраструктура**: Docker (multi-stage build, образ linux/arm64) · GitHub Actions (build + deploy) · GHCR · Tailscale (HTTPS-доступ к Pi за NAT) · systemd timer для бэкапов

## Структура

```
app/                    # FastAPI JSON API
  main.py               # CORS + SessionMiddleware + routers + SPA-static
  schemas.py            # Pydantic схемы
  serializers.py        # ORM → schema
  models.py / database.py / pricing.py / auth.py / cli.py / config.py
  routers/
    auth_router.py      # /api/auth/{login,logout,me}
    categories.py       # /api/categories  (CRUD + subcategories + prices)
    clients.py          # /api/clients     (CRUD + детальная статистика)
    events.py           # /api/events      (CRUD + фильтры + upcoming)
    dashboard.py        # /api/dashboard
    calendar.py         # /api/calendar/feed
    reports.py          # /api/reports

web/
  src/
    main.tsx App.tsx index.css
    lib/api.ts          # fetch-клиент с credentials: include
    lib/format.ts       # money/duration/datetime
    types/api.ts        # TS-зеркало pydantic-схем
    hooks/               # useAuth, useIsMobile
    components/
      Layout.tsx ProtectedRoute.tsx design.tsx echart.tsx
      ColorPicker.tsx IconPicker.tsx ClientFormModal.tsx phosphor.tsx
    pages/
      Login.tsx Dashboard.tsx
      Events.tsx EventForm.tsx
      Clients.tsx ClientDetail.tsx
      Categories.tsx Calendar.tsx Report.tsx
  vite.config.ts        # PWA + dev-proxy /api → 8000

migrations/             # alembic
data/                   # SQLite (в .gitignore)

Dockerfile  entrypoint.sh  docker-compose.yml
.github/workflows/build.yml  deploy.yml
scripts/backup-db.sh  event-tracker-backup.{service,timer}
```

## API

Все endpoints под `/api/*`. Аутентификация через session cookie (`event_tracker_session`), `same_site=lax`, `https_only` управляется `COOKIE_SECURE`.

| Method | Path | Описание |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → `AuthMe` |
| POST | `/api/auth/logout` | сброс сессии |
| GET | `/api/auth/me` | текущий пользователь |
| GET | `/api/clients?q=` | список (поиск по имени/телефону/телеграму/заметкам) |
| POST | `/api/clients` | создание |
| GET | `/api/clients/{id}` | детальная карточка + статистика |
| GET | `/api/clients/{id}/monthly?year=` | помесячный доход по клиенту за год |
| PUT/DELETE | `/api/clients/{id}` | |
| GET | `/api/categories` | список с подкатегориями и ценами |
| POST/PUT/DELETE | `/api/categories[/{id}]` | |
| POST | `/api/categories/{id}/subcategories` | + initial_price |
| DELETE | `/api/categories/subcategories/{id}` | |
| POST | `/api/categories/subcategories/{id}/prices` | новая цена с `effective_from` |
| GET | `/api/events` | фильтры: `category_id, subcategory_id, client_id, date_from, date_to` → `{future, past}` |
| GET | `/api/events/upcoming?limit=10` | |
| POST | `/api/events` | создание |
| GET/PUT/DELETE | `/api/events/{id}` | |
| GET | `/api/dashboard?period=` | агрегаты + chart series |
| GET | `/api/calendar/feed?start=&end=&client_id=` | для календаря |
| GET | `/api/reports?year=&month=&category_id=` | подкатегории, monthly net+tax, события с роялти |
| GET | `/api/reports/years` | годы, в которых есть события |

## Безопасность

- Один пользователь, имя в `APP_USERNAME`, пароль — argon2-хэш в `APP_PASSWORD_HASH`. Plain-пароль в системе нигде не хранится.
- Session cookie с подписью (`itsdangerous`), `same_site=lax`, в продакшене `Secure` (через Tailscale-HTTPS).
- 5 попыток логина/мин/IP (slowapi).
- В проде фронт и API подаются с одного origin → CORS не нужен; в dev CORS разрешён только для `http://localhost:5173`.

## Лицензия

Личный проект, без публичной лицензии. Использовать по согласованию с автором.
