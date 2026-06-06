# Трекер событий

Персональный PWA для учёта событий (тренировок, занятий и т.п.), клиентов, истории цен и статистики. Один пользователь, своя БД, развёртывается на домашнем мини-сервере. Работает офлайн: чтение из кеша, запись — через локальную очередь с автодоставкой при возврате сети.

> Полная инструкция по локальному запуску и деплою — в `SETUP.md` (не в репозитории).

## Возможности

- Категории и подкатегории, история цен (snapshot стоимости в события)
- События: длительность, дата начала, авто-окончание (`end_at = start + duration`), авто-стоимость, привязка клиента, налог и роялти. Деление Будущие/Прошедшие — по времени **окончания**
- Клиенты: детальная статистика, история событий (Будущие/Прошедшие), помесячная аналитика
- Календарь: **Месяц / Неделя / 3 дня** (time-grid), глобальный поиск + фильтры по клиенту, категории и подкатегориям
- Дашборд и Отчёт: круговые диаграммы по подкатегориям, доход по дням/месяцам, часы по подкатегориям, события с роялти; на карточках — **%-разница с предыдущим периодом** (зелёный/красный/нейтральный)
- **Синхронизация с Google Calendar**: OAuth или ручное подключение, маппинг категория → календарь, серверный outbox с ретраями и статусом подключения
- **Офлайн-first PWA**: персистентный кеш TanStack Query (Dexie/IndexedDB), клиентский outbox мутаций с серверной идемпотентностью, страница «Очередь синхронизации», индикатор онлайн/офлайн, самохостинг шрифтов
- **Мобильный UI**: нижний навбар + bottom-sheet «Ещё», адаптивные фильтры/поиск
- Auth: один пользователь, argon2-хэш пароля, session cookie, rate-limiting; сессия переживает офлайн-перезагрузку

## Стек

- **Backend (`app/`)**: FastAPI · SQLAlchemy 2.0 · SQLite · Alembic · session-auth (argon2) + slowapi · Pydantic v2 · идемпотентность мутаций (middleware + лог) · фоновый воркер синка Google Calendar
- **Frontend (`web/`)**: Vite + React 18 + TypeScript · TanStack Query (+ persist-client) · React Router v6 · react-hook-form + Zod · ECharts · Phosphor icons · Dexie (IndexedDB) · @fontsource (self-hosted Inter / JetBrains Mono) · кастомная CSS-дизайн-система
- **Инфраструктура**: Docker (multi-stage build, образ linux/arm64) · GitHub Actions (build + deploy) · GHCR · Tailscale (HTTPS-доступ к Pi за NAT) · systemd timer для бэкапов

## Офлайн и синхронизация

- **Чтение**: ответы GET кешируются Service Worker'ом (NetworkFirst, 3 c таймаут) + персистятся в Dexie через `PersistQueryClientProvider`, поэтому страницы рендерятся из кеша без сети. Buster кеша — git SHA сборки, так что деплой инвалидирует устаревшее.
- **Запись**: при офлайне/сбое сети мутация кладётся в Dexie-outbox (`lib/outbox.ts`) и резолвится как «отложено» (`OfflineQueuedError`). Демон (`lib/syncDaemon.ts`) сливает очередь по FIFO при событии `online` или вручную со страницы «Очередь».
- **Без дублей**: каждая мутация несёт `Idempotency-Key`; сервер (`app/idempotency.py`) кеширует ответ по ключу и при повторе возвращает тот же результат.
- **Сессия**: флаг `auth_ok` в localStorage держит пользователя залогиненным при офлайн-перезагрузке, независимо от инвалидируемого кеша запросов.

## Структура

```
app/                    # FastAPI JSON API
  main.py               # middleware (idempotency/CORS/session) + routers + SPA-static
  schemas.py            # Pydantic схемы
  serializers.py        # ORM → schema
  models.py / database.py / pricing.py / auth.py / cli.py / config.py
  clock.py              # «now» в локальной TЗ (naive local wall-clock)
  idempotency.py        # Idempotency-Key: middleware + лог повторов
  google_sync.py        # Google Calendar: креды, маппинг событий, enqueue в outbox
  google_sync_worker.py # фоновый воркер доставки outbox-строк
  google_health.py      # проверка валидности токена/подключения
  routers/
    auth_router.py      # /api/auth/{login,logout,me}
    categories.py       # /api/categories  (CRUD + subcategories + prices)
    clients.py          # /api/clients     (CRUD + детальная + monthly)
    events.py           # /api/events      (CRUD + фильтры + upcoming)
    dashboard.py        # /api/dashboard
    calendar.py         # /api/calendar/feed
    reports.py          # /api/reports
    google.py           # /api/google/*    (OAuth, calendars, sync-outbox)

web/
  src/
    main.tsx App.tsx index.css
    lib/
      api.ts            # fetch-клиент (credentials: include) + enqueue в outbox
      db.ts             # Dexie: outbox · idMap · persisted query cache
      outbox.ts syncDaemon.ts queryPersist.ts   # офлайн-очередь и персист
      format.ts eventCalc.ts calendarGrid.ts heatmap.ts utils.ts
    types/api.ts        # TS-зеркало pydantic-схем
    hooks/              # useAuth · useIsMobile · useOnline · useOfflineRefresh
    components/
      Layout.tsx ProtectedRoute.tsx design.tsx echart.tsx phosphor.tsx
      EventDetailModal.tsx ClientFormModal.tsx PctChangePill.tsx
      DatePicker.tsx DateTimePicker.tsx ColorPicker.tsx IconPicker.tsx
    pages/
      Login.tsx Dashboard.tsx
      Events.tsx EventForm.tsx
      Clients.tsx ClientDetail.tsx
      Categories.tsx Calendar.tsx Report.tsx
      SettingsGoogle.tsx SyncQueue.tsx Debug.tsx
  vite.config.ts        # PWA (Workbox) + dev-proxy /api → 8000

migrations/             # alembic (0001…0006, вкл. idempotency_log)
data/                   # SQLite (в .gitignore)

Dockerfile  entrypoint.sh  docker-compose.yml
.github/workflows/build.yml  deploy.yml
scripts/backup-db.sh  event-tracker-backup.{service,timer}
```

## API

Все endpoints под `/api/*`. Аутентификация через session cookie (`event_tracker_session`), `same_site=lax`, `https_only` управляется `COOKIE_SECURE`. Мутации (`POST/PUT/PATCH/DELETE`) принимают заголовок `Idempotency-Key` для безопасного повтора.

| Method | Path | Описание |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → `AuthMe` |
| POST | `/api/auth/logout` | сброс сессии |
| GET | `/api/auth/me` | текущий пользователь (`200 {authenticated}`) |
| GET | `/api/clients?q=` | список (поиск по имени/телефону/телеграму/заметкам) |
| POST | `/api/clients` | создание |
| GET | `/api/clients/{id}` | детальная карточка + статистика |
| GET | `/api/clients/{id}/monthly?year=` | помесячный доход по клиенту + прошлый год |
| PUT/DELETE | `/api/clients/{id}` | |
| GET | `/api/categories` | список с подкатегориями и ценами |
| POST/PUT/DELETE | `/api/categories[/{id}]` | |
| POST | `/api/categories/{id}/subcategories` | + initial_price |
| DELETE | `/api/categories/subcategories/{id}` | |
| POST | `/api/categories/subcategories/{id}/prices` | новая цена с `effective_from` |
| GET | `/api/events` | фильтры: `category_id, subcategory_id, client_id, date_from, date_to` → `{future, past}` (split по `end_at`) |
| GET | `/api/events/upcoming?limit=10` | идущие/ближайшие (по `end_at > now`) |
| POST | `/api/events` | создание |
| GET/PUT/DELETE | `/api/events/{id}` | |
| GET | `/api/dashboard?period=` | агрегаты + chart series + `prev_*` для %-дельт |
| GET | `/api/calendar/feed?start=&end=&client_id=` | события для календаря (вкл. `category_id`/`subcategory_id`) |
| GET | `/api/reports?year=&month=&category_id=` | подкатегории, monthly net+tax, роялти, `prev_*` тоталы |
| GET | `/api/reports/years` | годы, в которых есть события |
| GET | `/api/google/status` | статус подключения Google + валидность токена |
| GET | `/api/google/oauth/start` · `/api/google/oauth/callback` | OAuth-флоу |
| POST | `/api/google/manual-connect` · `/api/google/disconnect` | ручное подключение / отключение |
| GET | `/api/google/calendars` | список календарей аккаунта |
| GET | `/api/google/outbox` | строки синка с Google Calendar |
| POST | `/api/google/outbox/{id}/retry` · `/dismiss` | повтор / скрытие строки |

## Безопасность

- Один пользователь, имя в `APP_USERNAME`, пароль — argon2-хэш в `APP_PASSWORD_HASH`. Plain-пароль в системе нигде не хранится.
- Session cookie с подписью (`itsdangerous`), `same_site=lax`, в продакшене `Secure` (через Tailscale-HTTPS).
- 5 попыток логина/мин/IP (slowapi).
- В проде фронт и API подаются с одного origin → CORS не нужен; в dev CORS разрешён только для `http://localhost:5173`.
- Идемпотентность мутаций защищает от двойной доставки при ретраях офлайн-очереди (один и тот же `Idempotency-Key` → один и тот же ответ).
- `/api/auth/*` и `/api/google/*` всегда идут в сеть (NetworkOnly в SW), не кешируются и не ставятся в офлайн-очередь.

## Лицензия

Личный проект, без публичной лицензии. Использовать по согласованию с автором.
