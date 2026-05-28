import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, Card, IconButton, SearchableSelect } from "@/components/design";
import { EventFormModal } from "@/pages/EventForm";
import { EventDetailModal } from "@/components/EventDetailModal";
import { calendar as calendarApi, clients as clientsApi } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/api";

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type View = "month" | "week" | "3days";

/** Local midnight of a date — start of the "3 дня" window. */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const HOUR_HEIGHT = 56;          // full height for hours that contain events
const EMPTY_HOUR_HEIGHT = 20;    // collapsed height for empty hours (just fits the label)
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_COUNT = END_HOUR - START_HOUR + 1;

export function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [openEventId, setOpenEventId] = useState<number | null>(null);
  const [clientFilter, setClientFilter] = useState("");
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

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (feed.data) {
      for (const ev of feed.data) {
        const key = new Date(ev.start).toDateString();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
      }
      for (const list of map.values()) {
        list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      }
    }
    return map;
  }, [feed.data]);

  const headerLabel = useMemo(() => {
    if (view === "month") return fmt.monthYear(cursor);
    const start = view === "3days" ? startOfDay(cursor) : startOfWeek(cursor, { weekStartsOn: 1 });
    const end = addDays(start, view === "3days" ? 2 : 6);
    return `${format(start, "d MMM", { locale: ru })} – ${format(end, "d MMM", { locale: ru })}`;
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
        <h1 className="h1">Календарь</h1>
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
        <div className="cal-controls-filter">
          <SearchableSelect
            value={clientFilter}
            onChange={setClientFilter}
            placeholder="Все клиенты"
            options={(clientsList.data ?? []).map((c) => ({ value: String(c.id), label: c.full_name }))}
          />
        </div>
        <div className="cal-controls-actions">
          <ViewSwitcher value={view} onChange={setView} onToday={() => setCursor(new Date())} />
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

  // Mark which hours are "busy" — covered by at least one event across the
  // visible days. Busy hours keep the full height; empty hours collapse so
  // the grid focuses on the times that actually have events.
  const hourBusy = new Array<boolean>(HOUR_COUNT).fill(false);
  for (const d of days) {
    const evs = eventsByDay.get(d.toDateString()) ?? [];
    for (const e of evs) {
      const s = new Date(e.start);
      const en = new Date(e.end);
      const startMins = s.getHours() * 60 + s.getMinutes();
      const endMins = en.getHours() * 60 + en.getMinutes();
      const startH = Math.floor(startMins / 60);
      const endH = Math.max(startH, Math.ceil(endMins / 60) - 1);
      for (let h = Math.max(startH, START_HOUR); h <= Math.min(endH, END_HOUR); h++) {
        hourBusy[h - START_HOUR] = true;
      }
    }
  }
  const hourHeights = hourBusy.map((b) => (b ? HOUR_HEIGHT : EMPTY_HOUR_HEIGHT));
  const hourOffsets: number[] = [0];
  for (const h of hourHeights) hourOffsets.push(hourOffsets[hourOffsets.length - 1] + h);
  const totalHeight = hourOffsets[HOUR_COUNT];

  // Map a minute-of-day to its pixel offset within the column, respecting
  // per-hour heights. Events sit entirely inside busy hours so their internal
  // proportions stay correct (full HOUR_HEIGHT per spanned hour).
  const minsToY = (mins: number): number => {
    const clamped = Math.max(START_HOUR * 60, Math.min(mins, (END_HOUR + 1) * 60));
    const h = Math.floor(clamped / 60);
    const i = h - START_HOUR;
    if (i >= HOUR_COUNT) return hourOffsets[HOUR_COUNT];
    const frac = (clamped - h * 60) / 60;
    return hourOffsets[i] + frac * hourHeights[i];
  };

  // Inverse of minsToY: pixel offset within a column → minute-of-day, snapped
  // to 15-minute steps. Used by click-to-create on an empty slot.
  const yToMins = (y: number): number => {
    let mins = (END_HOUR + 1) * 60;
    for (let i = 0; i < HOUR_COUNT; i++) {
      if (y < hourOffsets[i + 1]) {
        const frac = (y - hourOffsets[i]) / hourHeights[i];
        mins = (START_HOUR + i) * 60 + frac * 60;
        break;
      }
    }
    const snapped = Math.round(mins / 15) * 15;
    return Math.max(START_HOUR * 60, Math.min(snapped, END_HOUR * 60 + 45));
  };

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
                  {String(h).padStart(2, "0")}:00
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
