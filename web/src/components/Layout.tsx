import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import {
  Bug,
  CalendarDots,
  CalendarPlus,
  ChartPieSlice,
  GearSix,
  GridFour,
  IdentificationCard,
  ListPlus,
  Tag,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIconType } from "@phosphor-icons/react";
import { google as googleApi } from "@/lib/api";
import { useOnline } from "@/hooks/useOnline";
import { count as outboxCount, subscribe as outboxSubscribe } from "@/lib/outbox";
import { cn } from "@/lib/utils";
import { EventFormModal } from "@/pages/EventForm";

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
  { to: "/debug", label: "Отладка", Icon: Bug, end: false },
];

export function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newEventOpen, setNewEventOpen] = useState(false);
  // Lightweight poll for the failed-sync badge in the "Отладка" nav item.
  const googleStatus = useQuery({
    queryKey: ["google", "status"],
    queryFn: () => googleApi.status(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const failedCount = googleStatus.data?.failed ?? 0;
  const online = useOnline();
  const [queued, setQueued] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const n = await outboxCount();
      if (!cancelled) setQueued(n);
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

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  return (
    <div className="app" data-mobile-open={mobileOpen ? "true" : "false"}>
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
        {queued > 0 && (
          <div
            role="status"
            aria-live="polite"
            title="Ожидают отправки на сервер"
            style={{
              margin: "0 12px 8px",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
              background: "var(--accent-soft)",
              color: "var(--accent-ink)",
            }}
          >
            В очереди: {queued}
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
              </NavLink>
            );
          })}
        </div>

      </aside>

      <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />

      <button
        type="button"
        className="mobile-fab mobile-fab-new"
        onClick={() => setNewEventOpen(true)}
        aria-label="Новое событие"
      >
        <CalendarPlus size={24} weight="duotone" />
      </button>

      <button
        type="button"
        className="mobile-fab mobile-fab-menu"
        onClick={() => setMobileOpen(true)}
        aria-label="Меню"
      >
        <Menu size={24} />
      </button>

      <EventFormModal
        open={newEventOpen}
        onClose={() => setNewEventOpen(false)}
        onSaved={() => setNewEventOpen(false)}
      />

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
