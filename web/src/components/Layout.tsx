import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import {
  CalendarDots,
  ChartPieSlice,
  GridFour,
  IdentificationCard,
  ListPlus,
  Tag,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIconType } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

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
];

export function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

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
                  <Icon size={18} weight="fill" />
                </span>
                <span>{label}</span>
              </NavLink>
            );
          })}
        </div>

      </aside>

      <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />

      <main className="main">
        <div className="mobile-trigger">
          <button
            type="button"
            className="mobile-trigger-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="Меню"
          >
            <Menu size={18} />
          </button>
          <div className="mobile-trigger-brand">
            <img src="/icon.png" alt="" className="brand-mark" style={{ width: 24, height: 24 }} />
            <span>Tracker</span>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
