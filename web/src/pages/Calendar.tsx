import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, FilterX, Plus, Search } from "lucide-react";
import {
  Button,
  Card,
  IconButton,
  Input,
  MultiSelect,
  SearchableSelect,
  Select,
} from "@/components/design";
import { EventFormModal } from "@/pages/EventForm";
import { EventDetailModal } from "@/components/EventDetailModal";
import {
  calendar as calendarApi,
  categories as categoriesApi,
  clients as clientsApi,
} from "@/lib/api";
import {
  HOUR_COUNT,
  HOUR_HEIGHT,
  START_HOUR,
  minsToY,
  yToMins,
} from "@/lib/calendarGrid";
import { fmt, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/api";

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type View = "month" | "week" | "3days";

/** Local midnight of a date — start of the "3 дня" window. */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [openEventId, setOpenEventId] = useState<number | null>(null);
  const [clientFilter, setClientFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [subcatFilter, setSubcatFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formModal, setFormModal] = useState<
    | { kind: "new"; prefillStart?: string }
    | { kind: "edit"; eventId: number }
    | { kind: "copy"; copyId: number }
    | null
  >(null);

  // Build the prefill string for click-to-create from a date (+ optional time).
  const openCreateAt = (start: Date) =>
    setFormModal({ kind: "new", prefillStart: format(start, "yyyy-MM-dd'T'HH:mm") });

  const clientsList = useQuery({
    queryKey: ["clients", ""],
    queryFn: () => clientsApi.list(""),
  });

  const cats = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesApi.list(),
  });

  // Subcategory options cascade off the selected category — empty cat → all.
  const subcatOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const c of cats.data ?? []) {
      if (catFilter && c.id !== Number(catFilter)) continue;
      for (const s of c.subcategories) {
        out.push({ value: String(s.id), label: s.name });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return out;
  }, [cats.data, catFilter]);

  // Drop stale subcat picks when the category changes (or its subcats shift).
  useEffect(() => {
    setSubcatFilter((prev) => prev.filter((v) => subcatOptions.some((o) => o.value === v)));
  }, [subcatOptions]);

  const activeFilterCount =
    (clientFilter ? 1 : 0) + (catFilter ? 1 : 0) + (subcatFilter.length ? 1 : 0);

  const clearAllFilters = () => {
    setClientFilter("");
    setCatFilter("");
    setSubcatFilter([]);
  };

  const range = useMemo(() => {
    if (view === "month") {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const startDow = (first.getDay() + 6) % 7;
      const start = addDays(first, -startDow);
      const end = addDays(start, 42);
      return { start, end };
    }
    if (view === "3days") {
      const start = startOfDay(cursor);
      return { start, end: addDays(start, 3) };
    }
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return { start, end: addDays(start, 7) };
  }, [view, cursor]);

  // Day columns for the time-grid views (week = 7 from Monday, 3 дня = cursor + 2).
  const gridDays = useMemo(() => {
    if (view === "3days") {
      const start = startOfDay(cursor);
      return Array.from({ length: 3 }, (_, i) => addDays(start, i));
    }
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [view, cursor]);

  const feed = useQuery({
    queryKey: ["calendar", view, range.start.toISOString(), range.end.toISOString(), clientFilter],
    queryFn: () =>
      calendarApi.feed(
        range.start.toISOString(),
        range.end.toISOString(),
        clientFilter ? Number(clientFilter) : undefined,
      ),
  });

  // Client-side filter pass — client_id is server-narrowed for cache size,
  // but cat/subcat/search live here so the dropdowns can react instantly
  // without round-trips. Search hits the category, subcategory, client and
  // notes fields the calendar tile actually shows. ID match is primary, but
  // we fall back to name match so a persisted React Query payload from before
  // category_id/subcategory_id were added to /api/calendar/feed still filters
  // correctly (the cache buster only invalidates on a new git SHA).
  const filteredFeed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wantedCat = catFilter
      ? (cats.data ?? []).find((c) => c.id === Number(catFilter))
      : null;
    const wantedSubs = subcatFilter.length
      ? (cats.data ?? [])
          .flatMap((c) => c.subcategories)
          .filter((s) => subcatFilter.includes(String(s.id)))
      : [];
    const wantedSubIds = new Set(wantedSubs.map((s) => s.id));
    const wantedSubNames = new Set(wantedSubs.map((s) => s.name));

    return (feed.data ?? []).filter((ev) => {
      if (wantedCat) {
        const evCatId = ev.extendedProps.category_id;
        if (evCatId != null) {
          if (evCatId !== wantedCat.id) return false;
        } else if (ev.extendedProps.category !== wantedCat.name) {
          return false;
        }
      }
      if (wantedSubs.length) {
        const evSubId = ev.extendedProps.subcategory_id;
        if (evSubId != null) {
          if (!wantedSubIds.has(evSubId)) return false;
        } else if (!wantedSubNames.has(ev.extendedProps.subcategory)) {
          return false;
        }
      }
      if (q) {
        const hay = [
          ev.extendedProps.category,
          ev.extendedProps.subcategory,
          ev.extendedProps.client,
          ev.extendedProps.notes,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [feed.data, search, catFilter, subcatFilter, cats.data]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredFeed) {
      const key = new Date(ev.start).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }
    return map;
  }, [filteredFeed]);

  const headerLabel = useMemo(() => {
    if (view === "month") return fmt.monthYear(cursor);
    const start = view === "3days" ? startOfDay(cursor) : startOfWeek(cursor, { weekStartsOn: 1 });
    const end = addDays(start, view === "3days" ? 2 : 6);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const startDay = format(start, "d", { locale: ru });
    const endDay = format(end, "d", { locale: ru });
    const endMon = cap(format(end, "MMM", { locale: ru }));
    // Same calendar month → print the month once at the end ("1-7 Июн.");
    // spanning two months → keep both ("29 Июн.-5 Июл.").
    const sameMonth =
      start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) return `${startDay}-${endDay} ${endMon}`;
    const startMon = cap(format(start, "MMM", { locale: ru }));
    return `${startDay} ${startMon}-${endDay} ${endMon}`;
  }, [view, cursor]);

  const navigate = (dir: -1 | 1) => {
    if (view === "month") {
      setCursor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    } else {
      setCursor((d) => addDays(d, (view === "3days" ? 3 : 7) * dir));
    }
  };

  const handleMonthDayClick = (d: Date) => {
    setCursor(d);
    setView("week");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Календарь</h1>
          <div className="muted mobile-hide">
            {filteredFeed.length} {pluralize(filteredFeed.length, "событие", "события", "событий")}
          </div>
        </div>
        <div className="page-head-actions">
          <Button
            className="mobile-hide"
            icon={<Plus size={16} />}
            onClick={() => setFormModal({ kind: "new" })}
          >
            Событие
          </Button>
        </div>
      </div>

      <div className="cal-controls">
        <Card padding="p-4" className="events-filters cal-filters">
          <button
            type="button"
            className="events-filters-toggle"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            <span>Фильтры</span>
            {activeFilterCount > 0 && (
              <span className="events-filters-count">{activeFilterCount}</span>
            )}
            {activeFilterCount > 0 && (
              <span
                role="button"
                tabIndex={0}
                className="events-filters-clear-mobile"
                aria-label="Очистить все фильтры"
                title="Очистить всё"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAllFilters();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    clearAllFilters();
                  }
                }}
              >
                <FilterX size={15} />
              </span>
            )}
            <span className="events-filters-toggle-tail">
              {(activeFilterCount > 0 || search.trim().length > 0) && (
                <span
                  className="day-group-count-badge events-filtered-count"
                  title="Событий после фильтров"
                >
                  {filteredFeed.length}
                </span>
              )}
              <ChevronDown
                size={16}
                className="events-filters-caret"
                style={{ transform: filtersOpen ? "rotate(180deg)" : "none" }}
              />
            </span>
          </button>
          <div
            className="events-filters-body"
            data-open={filtersOpen ? "true" : "false"}
          >
            <div className="events-filters-row">
              <div className="filter-row-cal-3">
                <SearchableSelect
                  className="cal-client-filter"
                  value={clientFilter}
                  onChange={setClientFilter}
                  placeholder="Все клиенты"
                  options={(clientsList.data ?? []).map((c) => ({
                    value: String(c.id),
                    label: c.full_name,
                  }))}
                />
                <Select
                  value={catFilter}
                  onChange={setCatFilter}
                  placeholder="Все категории"
                  options={(cats.data ?? []).map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  }))}
                />
                <MultiSelect
                  value={subcatFilter}
                  onChange={setSubcatFilter}
                  placeholder="Все подкатегории"
                  options={subcatOptions}
                />
              </div>
              <button
                type="button"
                className="events-filter-clear"
                onClick={clearAllFilters}
                disabled={activeFilterCount === 0}
                aria-label="Очистить все фильтры"
                title="Очистить всё"
              >
                <FilterX size={16} />
              </button>
            </div>
          </div>
        </Card>

        <div className="cal-search">
          <Input
            icon={<Search size={16} />}
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
          />
        </div>

        <div className="cal-controls-actions">
          <ViewSwitcher
            value={view}
            onChange={setView}
            onToday={() => setCursor(new Date())}
          />
          <div className="cal-nav">
            <IconButton onClick={() => navigate(-1)} aria-label="Назад">
              <ChevronLeft size={16} />
            </IconButton>
            <span className="cal-month">{headerLabel}</span>
            <IconButton onClick={() => navigate(1)} aria-label="Вперёд">
              <ChevronRight size={16} />
            </IconButton>
          </div>
        </div>
      </div>

      {view === "month" && (
        <MonthView
          cursor={cursor}
          today={today}
          eventsByDay={eventsByDay}
          onEvent={(id) => setOpenEventId(id)}
          onDay={handleMonthDayClick}
          onCreate={(d) => {
            // No time in month view — default to the current hour, :00.
            const start = new Date(d);
            start.setHours(new Date().getHours(), 0, 0, 0);
            openCreateAt(start);
          }}
        />
      )}
      {(view === "week" || view === "3days") && (
        <WeekView
          days={gridDays}
          today={today}
          eventsByDay={eventsByDay}
          onEvent={(id) => setOpenEventId(id)}
          onCreate={openCreateAt}
        />
      )}
      {openEventId !== null && (
        <EventDetailModal
          eventId={openEventId}
          onClose={() => setOpenEventId(null)}
        />
      )}

      <EventFormModal
        open={formModal !== null}
        eventId={formModal?.kind === "edit" ? formModal.eventId : undefined}
        copyId={formModal?.kind === "copy" ? formModal.copyId : undefined}
        prefillStart={formModal?.kind === "new" ? formModal.prefillStart : undefined}
        onClose={() => setFormModal(null)}
        onSaved={() => setFormModal(null)}
        onCopy={(srcId) => setFormModal({ kind: "copy", copyId: srcId })}
      />
    </div>
  );
}

function ViewSwitcher({
  value,
  onChange,
  onToday,
}: {
  value: View;
  onChange: (v: View) => void;
  onToday: () => void;
}) {
  const opts: { value: View; label: string }[] = [
    { value: "month", label: "Месяц" },
    { value: "week", label: "Неделя" },
    { value: "3days", label: "3 дня" },
  ];
  return (
    <div className="view-switcher">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cn("view-switch-btn", value === o.value && "on")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
      {/* Action tab — sits right of "Неделя" and snaps cursor to today
          without changing the current view. Never gets the "on" state. */}
      <button
        type="button"
        className="view-switch-btn"
        onClick={onToday}
        aria-label="Перейти к сегодняшнему дню"
      >
        Сегодня
      </button>
    </div>
  );
}

function MonthView({
  cursor,
  today,
  eventsByDay,
  onEvent,
  onDay,
  onCreate,
}: {
  cursor: Date;
  today: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onEvent: (id: number) => void;
  onDay: (d: Date) => void;
  onCreate: (d: Date) => void;
}) {
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDow = (first.getDay() + 6) % 7;
    const start = addDays(first, -startDow);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);
  const todayKey = today.toDateString();

  return (
    <Card padding="p-0">
      <div className="cal-grid">
        {DOW.map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {grid.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = d.toDateString() === todayKey;
          const evs = eventsByDay.get(d.toDateString()) || [];
          return (
            <div
              key={d.toISOString()}
              className={cn("cal-cell", !inMonth && "out", isToday && "today")}
              onClick={() => onCreate(d)}
              role="button"
              tabIndex={0}
              title="Создать событие"
            >
              <div
                className="cal-num"
                role="button"
                tabIndex={0}
                title="Открыть неделю"
                onClick={(e) => {
                  e.stopPropagation();
                  onDay(d);
                }}
              >
                {d.getDate()}
              </div>
              <div className="cal-events">
                {evs.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="cal-event"
                    style={{ "--cat": e.backgroundColor } as React.CSSProperties}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEvent(Number(e.id));
                    }}
                  >
                    <div className="cal-event-name">
                      {e.extendedProps.category}
                      {e.extendedProps.client ? ` | ${e.extendedProps.client}` : ""}
                    </div>
                    <div className="cal-event-time mono">{fmt.time(e.start)} – {fmt.time(e.end)}</div>
                    <div className="cal-event-sub">{e.extendedProps.subcategory}</div>
                  </div>
                ))}
                {evs.length > 3 && <div className="cal-event-more">+{evs.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeekView({
  days,
  today,
  eventsByDay,
  onEvent,
  onCreate,
}: {
  days: Date[];
  today: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onEvent: (id: number) => void;
  onCreate: (start: Date) => void;
}) {
  const todayKey = today.toDateString();
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => START_HOUR + i);

  // Uniform grid: every hour gets the full height.
  const hourHeights = new Array<number>(HOUR_COUNT).fill(HOUR_HEIGHT);
  const totalHeight = HOUR_HEIGHT * HOUR_COUNT;

  return (
    <Card padding="p-0">
      <div className="week-time" style={{ "--cal-days": days.length } as React.CSSProperties}>
        <div className="week-time-head">
          <div className="week-time-corner" />
          {days.map((d) => {
            const isToday = d.toDateString() === todayKey;
            return (
              <div key={d.toISOString()} className={cn("week-time-dh", isToday && "today")}>
                <div className="week-dow">{format(d, "EEEEEE", { locale: ru })}</div>
                <div className={cn("week-day", isToday && "today")}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>
        <div className="week-time-body">
          <div className="week-time-grid">
            <div className="week-time-hours" style={{ height: totalHeight }}>
              {hours.map((h, i) => (
                <div key={h} className="week-time-hour" style={{ height: hourHeights[i] }}>
                  {/* Skip the first label — it would sit on the very top edge
                      (clipped) and force a gap below the day header. */}
                  {i > 0 && (
                    <span className="week-time-hour-label">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  )}
                </div>
              ))}
            </div>
            {days.map((d) => {
              const isToday = d.toDateString() === todayKey;
              const evs = eventsByDay.get(d.toDateString()) || [];
              return (
                <div
                  key={d.toISOString()}
                  className={cn("week-time-col", isToday && "today")}
                  style={{ height: totalHeight }}
                  title="Создать событие"
                  onClick={(e) => {
                    // Empty-slot click → create. Clicks on an event bubble up
                    // here too, but the event's own handler stops propagation.
                    const rect = e.currentTarget.getBoundingClientRect();
                    const mins = yToMins(e.clientY - rect.top);
                    const start = new Date(d);
                    start.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
                    onCreate(start);
                  }}
                >
                  {/* One in-flow row per hour gives the horizontal separators
                      aligned with the gutter (replaces the old fixed-pitch
                      gradient, which assumed uniform hour heights). */}
                  {hourHeights.map((h, i) => (
                    <div
                      key={i}
                      className="week-time-col-hour"
                      style={{ height: h }}
                    />
                  ))}
                  {evs.map((e) => {
                    const s = new Date(e.start);
                    const en = new Date(e.end);
                    const startMins = s.getHours() * 60 + s.getMinutes();
                    const endMins = en.getHours() * 60 + en.getMinutes();
                    const top = minsToY(startMins);
                    const height = Math.max(24, minsToY(endMins) - top - 2);
                    return (
                      <div
                        key={e.id}
                        className="week-time-event"
                        style={{
                          top,
                          height,
                          "--cat": e.backgroundColor,
                        } as React.CSSProperties}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEvent(Number(e.id));
                        }}
                      >
                        <div className="week-time-ev-name">
                          {e.extendedProps.category}
                          {e.extendedProps.client ? ` | ${e.extendedProps.client}` : ""}
                        </div>
                        <div className="week-time-ev-time mono">
                          {fmt.time(e.start)} – {fmt.time(e.end)}
                        </div>
                        <div className="week-time-ev-sub">{e.extendedProps.subcategory}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
