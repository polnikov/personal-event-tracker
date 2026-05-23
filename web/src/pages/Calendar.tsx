import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMinutes, format, parseISO, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  ClockClockwise,
  Clock as ClockIcon,
  Copy as CopyIcon,
  CurrencyRub,
  Hourglass as HourglassIcon,
  Note,
  PencilSimple,
  User as UserIcon,
} from "@phosphor-icons/react";
import { Button, Card, IconButton, Modal, SearchableSelect } from "@/components/design";
import { EventFormModal } from "@/pages/EventForm";
import { DateTimePicker } from "@/components/DateTimePicker";
import { calendar as calendarApi, clients as clientsApi, events as eventsApi } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/api";

const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type View = "month" | "week";

const HOUR_HEIGHT = 56;
const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_COUNT = END_HOUR - START_HOUR + 1;

export function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [clientFilter, setClientFilter] = useState("");
  const [formModal, setFormModal] = useState<
    | { kind: "new" }
    | { kind: "edit"; eventId: number }
    | { kind: "copy"; copyId: number }
    | null
  >(null);

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
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return { start, end: addDays(start, 7) };
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
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const end = addDays(start, 6);
    return `${format(start, "d MMM", { locale: ru })} – ${format(end, "d MMM", { locale: ru })}`;
  }, [view, cursor]);

  const navigate = (dir: -1 | 1) => {
    if (view === "month") {
      setCursor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    } else {
      setCursor((d) => addDays(d, 7 * dir));
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
      {openEvent && (
        <EventDetailModal
          event={openEvent}
          onClose={() => setOpenEvent(null)}
          onEdit={(id) => {
            setOpenEvent(null);
            setFormModal({ kind: "edit", eventId: id });
          }}
          onCopy={(id) => {
            setOpenEvent(null);
            setFormModal({ kind: "copy", copyId: id });
          }}
        />
      )}

      <EventFormModal
        open={formModal !== null}
        eventId={formModal?.kind === "edit" ? formModal.eventId : undefined}
        copyId={formModal?.kind === "copy" ? formModal.copyId : undefined}
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

function EventDetailModal({
  event,
  onClose,
  onEdit,
  onCopy,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: (id: number) => void;
  onCopy: (id: number) => void;
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
            <Button
              icon={<ClockClockwise size={14} weight="fill" />}
              onClick={() => reschedule.mutate()}
              disabled={reschedule.isPending}
            >
              {reschedule.isPending ? "Перенос…" : "Перенести"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className="btn-outline"
              icon={<ClockClockwise size={14} weight="fill" />}
              onClick={() => setRescheduleOpen(true)}
            >
              Перенести
            </Button>
            <Button
              variant="secondary"
              className="btn-outline"
              icon={<CopyIcon size={14} weight="fill" />}
              onClick={() => onCopy(eventId)}
            >
              Копировать
            </Button>
            <Button
              icon={<PencilSimple size={14} weight="fill" />}
              onClick={() => onEdit(eventId)}
            >
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
            <span className="meta-icon"><ClockIcon size={14} weight="fill" /></span>
            <span className="mono">{dateLine}</span>
          </div>
          <div className="meta-row">
            <span className="meta-icon"><HourglassIcon size={14} weight="fill" /></span>
            <span>{fmt.duration(event.extendedProps.duration)}</span>
          </div>
          {event.extendedProps.client && (
            <div className="meta-row">
              <span className="meta-icon"><UserIcon size={14} weight="fill" /></span>
              <span>{event.extendedProps.client}</span>
            </div>
          )}
          <div className="meta-row">
            <span className="meta-icon"><CurrencyRub size={14} weight="fill" /></span>
            <span className="mono">
              {event.extendedProps.cost.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽
            </span>
          </div>
          {detail.data?.notes && (
            <div className="meta-note">
              <span className="meta-icon"><Note size={14} weight="fill" /></span>
              <span>{detail.data.notes}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="form">
          <div className="muted small">Текущее: {dateLine}</div>
          <label className="field">
            <div className="field-label">Новое время</div>
            <DateTimePicker value={newStart} onChange={setNewStart} />
            {newEndPreview && (
              <span className="muted small">Окончание: {newEndPreview}</span>
            )}
          </label>
        </div>
      )}
    </Modal>
  );
}
