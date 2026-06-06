import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMinutes, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Copy, History, Pencil } from "lucide-react";
import { HandCoins, SealPercent } from "@phosphor-icons/react";
import { Button, Modal } from "@/components/design";
import { DateTimePicker } from "@/components/DateTimePicker";
import { EventFormModal } from "@/pages/EventForm";
import { events as eventsApi } from "@/lib/api";
import { fmt } from "@/lib/format";

/**
 * Shared "Детали события" modal. Driven by an event id alone — fetches the
 * full event via the detail endpoint, so it can be opened from anywhere an
 * event card/row is shown (Calendar, Events, Dashboard, ClientDetail, Report).
 * Edit/Copy reuse the shared EventFormModal, layered over this one; Reschedule
 * is handled inline.
 */
export function EventDetailModal({
  eventId,
  onClose,
}: {
  eventId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["events", "detail", eventId],
    queryFn: () => eventsApi.detail(eventId),
  });
  const ev = detail.data;

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [form, setForm] = useState<"edit" | "copy" | null>(null);

  // Seed the reschedule picker once the event loads.
  useEffect(() => {
    if (ev) setNewStart(format(parseISO(ev.start_at), "yyyy-MM-dd'T'HH:mm"));
  }, [ev?.start_at]);

  const reschedule = useMutation({
    mutationFn: () => {
      if (!ev) throw new Error("Загрузка");
      const local = newStart.length === 16 ? `${newStart}:00` : newStart;
      return eventsApi.update(eventId, {
        subcategory_id: ev.subcategory_id,
        client_id: ev.client_id,
        club_id: ev.club_id,
        start_at: local,
        duration_minutes: ev.duration_minutes,
        notes: ev.notes,
        recalculate_price: false,
        price_per_hour: parseFloat(ev.hourly_rate_snapshot) || 0,
        tax: parseFloat(ev.tax) || 0,
        royalty: parseFloat(ev.royalty) || 0,
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
    if (!newStart || !ev) return null;
    try {
      const d = parseISO(newStart);
      if (Number.isNaN(d.getTime())) return null;
      return format(addMinutes(d, ev.duration_minutes), "d MMMM, HH:mm", { locale: ru });
    } catch {
      return null;
    }
  }, [newStart, ev?.duration_minutes]);

  const dateLine = useMemo(() => {
    if (!ev) return "";
    const s = parseISO(ev.start_at);
    return `${format(s, "d MMMM", { locale: ru })} | ${fmt.time(ev.start_at)} – ${fmt.time(ev.end_at)}`;
  }, [ev?.start_at, ev?.end_at]);

  const dateBadge = useMemo(() => {
    if (!ev) return { day: "", weekday: "" };
    const d = parseISO(ev.start_at);
    return { day: format(d, "d"), weekday: format(d, "EEEEEE", { locale: ru }) };
  }, [ev?.start_at]);

  const costFmt = useMemo(
    () => (ev ? Number(ev.total_cost).toLocaleString("ru-RU", { maximumFractionDigits: 0 }) : ""),
    [ev?.total_cost],
  );

  const taxPct = ev ? parseFloat(ev.tax) || 0 : 0;
  const royaltyPct = ev ? parseFloat(ev.royalty) || 0 : 0;

  // Edit / copy hand off to the shared event form, layered over this modal.
  if (form) {
    return (
      <EventFormModal
        open
        eventId={form === "edit" ? eventId : undefined}
        copyId={form === "copy" ? eventId : undefined}
        onClose={() => {
          setForm(null);
          onClose();
        }}
        onSaved={() => {
          setForm(null);
          onClose();
        }}
        onCopy={() => setForm("copy")}
      />
    );
  }

  const cat = ev?.subcategory.category_color ?? "var(--ink)";
  const ariaLabel = ev
    ? `${ev.subcategory.category_name} · ${ev.subcategory.name}`
    : "Детали события";

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      ariaLabel={ariaLabel}
      hideTitle
      noFooterBorder
      footer={
        !ev ? undefined : rescheduleOpen ? (
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>
              Назад
            </Button>
            <Button
              icon={<History size={14} />}
              onClick={() => reschedule.mutate()}
              disabled={reschedule.isPending}
            >
              {reschedule.isPending ? "Перенос…" : "Перенести"}
            </Button>
          </>
        ) : (
          <>
            <Button
              className="cd2-btn"
              variant="secondary"
              icon={<History size={14} />}
              onClick={() => setRescheduleOpen(true)}
            >
              Перенести
            </Button>
            <Button
              className="cd2-btn"
              variant="secondary"
              icon={<Copy size={14} />}
              onClick={() => setForm("copy")}
            >
              Копировать
            </Button>
            <Button
              className="cd2-btn"
              icon={<Pencil size={14} />}
              onClick={() => setForm("edit")}
            >
              Редактировать
            </Button>
          </>
        )
      }
    >
      {!ev ? (
        <div className="cd2-loading">Загрузка…</div>
      ) : !rescheduleOpen ? (
        <div className="cd2" style={{ "--cat": cat } as React.CSSProperties}>
          <div className="cd2-hero">
            <div className="cd2-hero-head">
              <div className="cd2-tag">
                <span className="cd2-tag-dot" style={{ background: cat }} />
                <span className="cd2-tag-text">
                  {ev.subcategory.category_name} · {ev.subcategory.name}
                </span>
              </div>
            </div>
            <div className="cd2-ticket">
              <span className="cd2-datebox">
                <span className="cd2-datebox-day">{dateBadge.day}</span>
                <span className="cd2-datebox-wd">{dateBadge.weekday}</span>
              </span>
              <span className="cd2-time">{fmt.time(ev.start_at)}</span>
              <span className="cd2-dash" aria-hidden="true" />
              <span className="cd2-time">{fmt.time(ev.end_at)}</span>
            </div>
          </div>
          <div className="cd2-row">
            <div className="cd2-nameline">
              {ev.client ? (
                <Link className="cd2-name" to={`/clients/${ev.client.id}`}>
                  {ev.client.full_name}
                </Link>
              ) : (
                <span className="cd2-name" />
              )}
              <span className="cd2-metacol">
                <span className="cd2-meta">
                  <span className="cd2-price">{costFmt} ₽</span>
                  {taxPct > 0 && (
                    <HandCoins
                      className="cd2-flag"
                      size={16}
                      weight="duotone"
                      aria-label={`Налог ${taxPct}%`}
                    >
                      <title>{`Налог ${taxPct}%`}</title>
                    </HandCoins>
                  )}
                  {royaltyPct > 0 && (
                    <SealPercent
                      className="cd2-flag"
                      size={16}
                      weight="duotone"
                      aria-label={`Роялти ${royaltyPct}%`}
                    >
                      <title>{`Роялти ${royaltyPct}%`}</title>
                    </SealPercent>
                  )}
                </span>
                {/* Club sits right-aligned directly under the cost. */}
                {ev.club && <span className="cd2-club">{ev.club.name}</span>}
              </span>
            </div>
            {/* Notes, when present, drop to their own full-width line below. */}
            {ev.notes && <div className="cd2-note">{ev.notes}</div>}
          </div>
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
