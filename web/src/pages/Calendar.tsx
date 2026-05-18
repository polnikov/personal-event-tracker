import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMinutes, format, parseISO, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Edit3,
  FileText,
  Hourglass,
  Plus,
  User,
} from "lucide-react";
import { Button, Card, IconButton, Modal, NotesPill, Select } from "@/components/design";
import { AppIcon } from "@/components/phosphor";
import { calendar as calendarApi, clients as clientsApi, events as eventsApi } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/api";

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type View = "month" | "week" | "list";

const HOUR_HEIGHT = 44;
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_COUNT = END_HOUR - START_HOUR + 1;

export function CalendarPage() {
  const nav = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [clientFilter, setClientFilter] = useState("");

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
    if (view === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return { start, end: addDays(start, 7) };
    }
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    return { start, end: addDays(start, 30) };
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
    if (view === "week") {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      const end = addDays(start, 6);
      return `${format(start, "d MMM", { locale: ru })} – ${format(end, "d MMM", { locale: ru })}`;
    }
    return `${format(range.start, "d MMM", { locale: ru })} – ${format(addDays(range.end, -1), "d MMM", { locale: ru })}`;
  }, [view, cursor, range]);

  const navigate = (dir: -1 | 0 | 1) => {
    if (dir === 0) {
      setCursor(new Date());
      return;
    }
    if (view === "month") {
      setCursor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    } else if (view === "week") {
      setCursor((d) => addDays(d, 7 * dir));
    } else {
      setCursor((d) => addDays(d, 14 * dir));
    }
  };

  const handleMonthDayClick = (d: Date) => {
    setCursor(d);
    setView("list");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Календарь</h1>
          <div className="muted">Расписание событий</div>
        </div>
        <div className="page-head-actions">
          <div style={{ minWidth: 180 }}>
            <Select
              value={clientFilter || "all"}
              onChange={(v) => setClientFilter(v === "all" ? "" : v)}
              options={[
                { value: "all", label: "Все клиенты" },
                ...((clientsList.data ?? []).map((c) => ({ value: String(c.id), label: c.full_name }))),
              ]}
            />
          </div>
          <ViewSwitcher value={view} onChange={setView} />
          <div className="cal-nav">
            <IconButton onClick={() => navigate(-1)} aria-label="Назад">
              <ChevronLeft size={16} />
            </IconButton>
            <span className="cal-month">{headerLabel}</span>
            <IconButton onClick={() => navigate(1)} aria-label="Вперёд">
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <Button variant="secondary" onClick={() => navigate(0)}>
            Сегодня
          </Button>
          <Button icon={<Plus size={16} />} onClick={() => nav("/events/new")}>
            Событие
          </Button>
        </div>
      </div>

      {view === "month" && (
        <MonthView
          cursor={cursor}
          today={today}
          eventsByDay={eventsByDay}
          onEvent={(e) => setOpenEvent(e)}
          onDay={handleMonthDayClick}
        />
      )}
      {view === "week" && (
        <WeekView
          cursor={cursor}
          today={today}
          eventsByDay={eventsByDay}
          onEvent={(e) => setOpenEvent(e)}
        />
      )}
      {view === "list" && (
        <ListView
          start={range.start}
          end={range.end}
          eventsByDay={eventsByDay}
          today={today}
          onEvent={(e) => setOpenEvent(e)}
        />
      )}

      {openEvent && (
        <EventDetailModal
          event={openEvent}
          onClose={() => setOpenEvent(null)}
          onEdit={(id) => {
            setOpenEvent(null);
            nav(`/events/${id}/edit`);
          }}
        />
      )}
    </div>
  );
}

function ViewSwitcher({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const opts: { value: View; label: string }[] = [
    { value: "month", label: "Месяц" },
    { value: "week", label: "Неделя" },
    { value: "list", label: "Список" },
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
    </div>
  );
}

function MonthView({
  cursor,
  today,
  eventsByDay,
  onEvent,
  onDay,
}: {
  cursor: Date;
  today: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onEvent: (e: CalendarEvent) => void;
  onDay: (d: Date) => void;
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
              onClick={() => onDay(d)}
              role="button"
              tabIndex={0}
            >
              <div className="cal-num">{d.getDate()}</div>
              <div className="cal-events">
                {evs.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="cal-event"
                    style={{ "--cat": e.backgroundColor } as React.CSSProperties}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEvent(e);
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
  cursor,
  today,
  eventsByDay,
  onEvent,
}: {
  cursor: Date;
  today: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onEvent: (e: CalendarEvent) => void;
}) {
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const todayKey = today.toDateString();
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => START_HOUR + i);

  return (
    <Card padding="p-0">
      <div className="week-time">
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
            <div className="week-time-hours" style={{ height: HOUR_HEIGHT * HOUR_COUNT }}>
              {hours.map((h) => (
                <div key={h} className="week-time-hour" style={{ height: HOUR_HEIGHT }}>
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
                  style={{
                    height: HOUR_HEIGHT * HOUR_COUNT,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${
                      HOUR_HEIGHT - 1
                    }px, var(--line) ${HOUR_HEIGHT - 1}px, var(--line) ${HOUR_HEIGHT}px)`,
                  }}
                >
                  {evs.map((e) => {
                    const s = new Date(e.start);
                    const en = new Date(e.end);
                    const startMins = s.getHours() * 60 + s.getMinutes();
                    const endMins = en.getHours() * 60 + en.getMinutes();
                    const top = ((startMins - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      24,
                      ((endMins - startMins) / 60) * HOUR_HEIGHT - 2,
                    );
                    return (
                      <div
                        key={e.id}
                        className="week-time-event"
                        style={{
                          top,
                          height,
                          "--cat": e.backgroundColor,
                        } as React.CSSProperties}
                        onClick={() => onEvent(e)}
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

function ListView({
  start,
  end,
  today,
  eventsByDay,
  onEvent,
}: {
  start: Date;
  end: Date;
  today: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onEvent: (e: CalendarEvent) => void;
}) {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur < end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const todayKey = today.toDateString();
  const daysWithEvents = days
    .filter((d) => (eventsByDay.get(d.toDateString()) || []).length > 0)
    .sort((a, b) => b.getTime() - a.getTime());

  if (daysWithEvents.length === 0) {
    return (
      <Card>
        <div className="empty">
          <div className="empty-title">В этот период событий нет</div>
          <div className="empty-hint">Попробуйте сменить диапазон или создать событие</div>
        </div>
      </Card>
    );
  }

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="stack-md">
      {daysWithEvents.map((d) => {
        const evs = eventsByDay.get(d.toDateString()) || [];
        const isToday = d.toDateString() === todayKey;
        return (
          <div key={d.toISOString()} className="day-group">
            <div className="day-group-head">
              <div>
                <span className="day-group-weekday">
                  {capitalize(format(d, "EEEE", { locale: ru }))}
                </span>
                <span className="day-group-date muted">
                  {" · "}
                  {format(d, "d MMMM", { locale: ru })}
                  {isToday ? " · сегодня" : ""}
                </span>
              </div>
            </div>
            <Card padding="p-0">
              <div className="event-table">
                {evs.map((e) => {
                  const ex = e.extendedProps;
                  const catColor = ex.category_color || e.backgroundColor;
                  return (
                    <div
                      key={e.id}
                      className="events-row"
                      onClick={() => onEvent(e)}
                    >
                      <span className="events-row-time-start">{fmt.time(e.start)}</span>
                      <span className="events-row-time-sep">–</span>
                      <span className="events-row-time-end">{fmt.time(e.end)}</span>
                      <span className="events-row-cat">
                        <span className="events-row-cat-dot" style={{ background: catColor }} />
                        <span className="events-row-cat-name">{ex.category}</span>
                      </span>
                      <span className="events-row-sub">
                        {ex.subcategory_icon && (
                          <span className="events-row-sub-icon">
                            <AppIcon name={ex.subcategory_icon} size={14} weight="duotone" color={catColor} />
                          </span>
                        )}
                        <span className="events-row-sub-name">{ex.subcategory}</span>
                      </span>
                      {ex.notes ? <NotesPill notes={ex.notes} /> : null}
                      {ex.client && (
                        <span className="events-row-client events-row-client-static">
                          {ex.client}
                        </span>
                      )}
                      <span className="events-row-cost">
                        {ex.cost.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function EventDetailModal({
  event,
  onClose,
  onEdit,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: (id: number) => void;
}) {
  const qc = useQueryClient();
  const eventId = Number(event.id);
  const detail = useQuery({
    queryKey: ["events", "detail", eventId],
    queryFn: () => eventsApi.detail(eventId),
  });

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newStart, setNewStart] = useState(format(parseISO(event.start), "yyyy-MM-dd'T'HH:mm"));

  const reschedule = useMutation({
    mutationFn: () => {
      if (!detail.data) throw new Error("Загрузка");
      const local = newStart.length === 16 ? `${newStart}:00` : newStart;
      return eventsApi.update(eventId, {
        subcategory_id: detail.data.subcategory_id,
        client_id: detail.data.client_id,
        start_at: local,
        duration_minutes: detail.data.duration_minutes,
        notes: detail.data.notes,
        recalculate_price: false,
        price_per_hour: parseFloat(detail.data.hourly_rate_snapshot) || 0,
        tax: parseFloat(detail.data.tax) || 0,
        royalty: parseFloat(detail.data.royalty) || 0,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });

  const newEndPreview = useMemo(() => {
    if (!newStart || !detail.data) return null;
    try {
      const d = parseISO(newStart);
      if (Number.isNaN(d.getTime())) return null;
      return format(addMinutes(d, detail.data.duration_minutes), "d MMMM, HH:mm", { locale: ru });
    } catch {
      return null;
    }
  }, [newStart, detail.data]);

  const dateLine = useMemo(() => {
    const s = parseISO(event.start);
    const dateStr = format(s, "d MMMM", { locale: ru });
    return `${dateStr} | ${fmt.time(event.start)} – ${fmt.time(event.end)}`;
  }, [event.start, event.end]);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      ariaLabel={event.title}
      noFooterBorder
      bodyClassName="modal-body-cal-detail"
      footer={
        rescheduleOpen ? (
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>
              Назад
            </Button>
            <Button onClick={() => reschedule.mutate()} disabled={reschedule.isPending}>
              {reschedule.isPending ? "Перенос…" : "Перенести"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(true)}>
              Перенести
            </Button>
            <Button icon={<Edit3 size={14} />} onClick={() => onEdit(eventId)}>
              Редактировать
            </Button>
          </>
        )
      }
    >
      {!rescheduleOpen ? (
        <div className="form">
          <div className="meta-row">
            <span
              className="cat-dot"
              style={{ width: 10, height: 10, background: event.backgroundColor }}
            />
            <span>{event.extendedProps.category} | {event.extendedProps.subcategory}</span>
          </div>
          <div className="meta-row">
            <span className="meta-icon"><Clock size={14} strokeWidth={1.6} /></span>
            <span className="mono">{dateLine}</span>
          </div>
          <div className="meta-row">
            <span className="meta-icon"><Hourglass size={14} strokeWidth={1.6} /></span>
            <span>{fmt.duration(event.extendedProps.duration)}</span>
          </div>
          {event.extendedProps.client && (
            <div className="meta-row">
              <span className="meta-icon"><User size={14} strokeWidth={1.6} /></span>
              <span>{event.extendedProps.client}</span>
            </div>
          )}
          <div className="meta-row">
            <span className="meta-icon"><DollarSign size={14} strokeWidth={1.6} /></span>
            <span className="mono">
              {event.extendedProps.cost.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽
            </span>
          </div>
          {detail.data?.notes && (
            <div className="meta-note">
              <span className="meta-icon"><FileText size={14} strokeWidth={1.6} /></span>
              <span>{detail.data.notes}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="form">
          <div className="muted small">Текущее: {dateLine}</div>
          <label className="field">
            <div className="field-label">Новое время</div>
            <input
              type="datetime-local"
              className="input"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
            />
            {newEndPreview && (
              <span className="muted small">Окончание: {newEndPreview}</span>
            )}
          </label>
        </div>
      )}
    </Modal>
  );
}
