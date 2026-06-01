import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bug,
  CalendarDots,
  CalendarPlus,
  ChartPieSlice,
  CloudArrowUp,
  DotsThree,
  GearSix,
  GridFour,
  IdentificationCard,
  ListPlus,
  Tag,
  UserPlus,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIconType } from "@phosphor-icons/react";
import { google as googleApi } from "@/lib/api";
import { useOnline } from "@/hooks/useOnline";
import { list as outboxList, subscribe as outboxSubscribe } from "@/lib/outbox";
import { cn } from "@/lib/utils";
import { EventFormModal } from "@/pages/EventForm";
import { ClientFormModal } from "@/components/ClientFormModal";

type NavItem = {
  to: string;
  label: string;
  Icon: PhosphorIconType;
  end: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Дашборд", Icon: GridFour, end: true },
  { to: "/calendar", label: "Календарь", Icon: CalendarDots, end: false },
  { to: "/events", label: "События", Icon: ListPlus, end: false },
  { to: "/clients", label: "Клиенты", Icon: IdentificationCard, end: false },
  { to: "/categories", label: "Категории", Icon: Tag, end: false },
  { to: "/report", label: "Отчёт", Icon: ChartPieSlice, end: false },
  { to: "/settings/google", label: "Настройки", Icon: GearSix, end: false },
  { to: "/sync", label: "Очередь", Icon: CloudArrowUp, end: false },
  { to: "/debug", label: "Отладка", Icon: Bug, end: false },
];

const MOBILE_TABS: NavItem[] = [
  { to: "/", label: "Дашборд", Icon: GridFour, end: true },
  { to: "/calendar", label: "Календарь", Icon: CalendarDots, end: false },
  { to: "/events", label: "События", Icon: ListPlus, end: false },
  { to: "/report", label: "Отчёт", Icon: ChartPieSlice, end: false },
];

// Routes that live behind the "Ещё" sheet — keep the More tab highlighted
// when the user is on any of these pages.
const MORE_ROUTES = ["/categories", "/clients", "/sync", "/debug", "/settings"];

export function Layout() {
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  // Lightweight poll for the failed-sync badge in the "Отладка" nav item.
  const googleStatus = useQuery({
    queryKey: ["google", "status"],
    queryFn: () => googleApi.status(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const failedCount = googleStatus.data?.failed ?? 0;
  const online = useOnline();
  const [outbox, setOutbox] = useState({ pending: 0, failed: 0 });
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const all = await outboxList();
      if (cancelled) return;
      setOutbox({
        pending: all.filter((e) => e.status === "pending").length,
        failed: all.filter((e) => e.status === "failed").length,
      });
    };
    void refresh();
    const unsub = outboxSubscribe(() => void refresh());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  // Connected but the token no longer works → warn on the Settings item.
  const googleBroken =
    !!googleStatus.data?.connected && googleStatus.data?.credentials_valid === false;

  // Any attention-needing state surfaces a dot on the mobile "Ещё" tab so
  // the user knows something inside the sheet wants action.
  const moreTabAlert =
    outbox.failed > 0 || failedCount > 0 || googleBroken || outbox.pending > 0;

  // Close the sheet whenever the route changes (item tap that navigates).
  useEffect(() => setSheetOpen(false), [location.pathname]);

  useEffect(() => {
    if (sheetOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setSheetOpen(false);
      };
      document.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = prev;
        document.removeEventListener("keydown", onKey);
      };
    }
  }, [sheetOpen]);

  const inMore = MORE_ROUTES.some((p) => location.pathname.startsWith(p));

  return (
    <div className="app">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <img src="/icon.png" alt="Tracker" className="brand-mark" />
          <div className="brand-name">Tracker</div>
        </NavLink>

        {!online && (
          <div
            role="status"
            aria-live="polite"
            title="Нет соединения. Данные показываются из кэша."
            style={{
              margin: "0 12px 8px",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
              background: "var(--danger-soft, #fdecea)",
              color: "var(--danger, #b00020)",
            }}
          >
            Офлайн
          </div>
        )}

        <div className="nav">
          {NAV_ITEMS.map(({ to, label, Icon, end }) => {
            const active =
              (end && location.pathname === to) ||
              (!end && location.pathname.startsWith(to));
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={cn("nav-item", active && "active")}
              >
                <span className="nav-icon">
                  <Icon size={24} weight="fill" />
                </span>
                <span>{label}</span>
                {to === "/debug" && failedCount > 0 && (
                  <span className="nav-badge">{failedCount}</span>
                )}
                {to === "/settings/google" && googleBroken && (
                  <span className="nav-badge" title="Проблема с подключением Google">!</span>
                )}
                {to === "/sync" && outbox.failed > 0 && (
                  <span className="nav-badge" title="Не удалось отправить">
                    {`!${outbox.failed}`}
                  </span>
                )}
                {to === "/sync" && outbox.failed === 0 && outbox.pending > 0 && (
                  <span
                    className="nav-badge"
                    title="Ожидают отправки"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent-ink)",
                    }}
                  >
                    {outbox.pending}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

      </aside>

      <nav className="mobile-tabbar" aria-label="Основная навигация">
        {MOBILE_TABS.map(({ to, label, Icon, end }) => {
          const active =
            (end && location.pathname === to) ||
            (!end && location.pathname.startsWith(to));
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={cn("mobile-tab", active && !inMore && "active")}
            >
              <Icon size={22} weight={active && !inMore ? "fill" : "regular"} />
              <span>{label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          className={cn("mobile-tab", (inMore || sheetOpen) && "active")}
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          <DotsThree size={26} weight={inMore || sheetOpen ? "fill" : "bold"} />
          <span>Ещё</span>
          {moreTabAlert && (
            <span
              className="mobile-tab-dot"
              style={{
                background: outbox.failed > 0 || googleBroken ? "var(--danger)" : "var(--accent)",
              }}
            />
          )}
        </button>
      </nav>

      {sheetOpen && (
        <>
          <div
            className="mobile-sheet-backdrop"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            className="mobile-sheet"
            role="dialog"
            aria-label="Дополнительное меню"
          >
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-status">
              <span
                className={cn(
                  "mobile-sheet-status-pill",
                  online ? "online" : "offline",
                )}
                title={
                  online
                    ? "Соединение активно"
                    : "Нет соединения. Данные показываются из кэша."
                }
              >
                <span className="mobile-sheet-status-dot" />
                {online ? "Онлайн" : "Оффлайн"}
              </span>
            </div>

            <button
              type="button"
              className="mobile-sheet-item"
              onClick={() => {
                setSheetOpen(false);
                setNewEventOpen(true);
              }}
            >
              <span className="mobile-sheet-item-icon">
                <CalendarPlus size={22} weight="duotone" />
              </span>
              <span>Добавить событие</span>
            </button>

            <button
              type="button"
              className="mobile-sheet-item"
              onClick={() => {
                setSheetOpen(false);
                setNewClientOpen(true);
              }}
            >
              <span className="mobile-sheet-item-icon">
                <UserPlus size={22} weight="duotone" />
              </span>
              <span>Добавить клиента</span>
            </button>

            <NavLink to="/clients" className="mobile-sheet-item">
              <span className="mobile-sheet-item-icon">
                <IdentificationCard size={22} weight="fill" />
              </span>
              <span>Клиенты</span>
            </NavLink>

            <NavLink to="/categories" className="mobile-sheet-item">
              <span className="mobile-sheet-item-icon">
                <Tag size={22} weight="fill" />
              </span>
              <span>Категории</span>
            </NavLink>

            <NavLink to="/sync" className="mobile-sheet-item">
              <span className="mobile-sheet-item-icon">
                <CloudArrowUp size={22} weight="fill" />
              </span>
              <span>Очередь</span>
              {outbox.failed > 0 && (
                <span className="nav-badge" title="Не удалось отправить">
                  {`!${outbox.failed}`}
                </span>
              )}
              {outbox.failed === 0 && outbox.pending > 0 && (
                <span
                  className="nav-badge"
                  title="Ожидают отправки"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent-ink)",
                  }}
                >
                  {outbox.pending}
                </span>
              )}
            </NavLink>

            <NavLink to="/debug" className="mobile-sheet-item">
              <span className="mobile-sheet-item-icon">
                <Bug size={22} weight="fill" />
              </span>
              <span>Отладка</span>
              {failedCount > 0 && (
                <span className="nav-badge">{failedCount}</span>
              )}
            </NavLink>

            <NavLink to="/settings/google" className="mobile-sheet-item">
              <span className="mobile-sheet-item-icon">
                <GearSix size={22} weight="fill" />
              </span>
              <span>Настройки</span>
              {googleBroken && (
                <span className="nav-badge" title="Проблема с подключением Google">
                  !
                </span>
              )}
            </NavLink>
          </div>
        </>
      )}

      <EventFormModal
        open={newEventOpen}
        onClose={() => setNewEventOpen(false)}
        onSaved={() => setNewEventOpen(false)}
      />

      {newClientOpen && (
        <ClientFormModal
          client={null}
          onClose={() => setNewClientOpen(false)}
          onSaved={() => setNewClientOpen(false)}
        />
      )}

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
