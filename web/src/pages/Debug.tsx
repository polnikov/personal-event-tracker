import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronDown } from "lucide-react";
import { Button, Card, Tabs } from "@/components/design";
import { google as googleApi } from "@/lib/api";
import type { GoogleOutboxRow } from "@/lib/api";
import { EventFormModal } from "@/pages/EventForm";

type Filter = "all" | "pending" | "failed";

const PAGE = 10;

export function DebugPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [openEventId, setOpenEventId] = useState<number | null>(null);

  // Fetch one extra to know whether more pages exist.
  const rows = useQuery({
    queryKey: ["google", "outbox", filter, limit],
    queryFn: () => googleApi.outbox({ status: filter, limit: limit + 1 }),
    refetchInterval: 10_000,
  });

  const retry = useMutation({
    mutationFn: (id: number) => googleApi.retryOutbox(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google", "outbox"] }),
  });
  const dismiss = useMutation({
    mutationFn: (id: number) => googleApi.dismissOutbox(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google", "outbox"] }),
  });

  const all = rows.data ?? [];
  const hasMore = all.length > limit;
  const visible = useMemo(() => all.slice(0, limit), [all, limit]);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Отладка</h1>
          <div className="muted">Журнал синхронизации с Google Calendar</div>
        </div>
      </div>

      <Tabs<Filter>
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setLimit(PAGE);
          setExpanded(new Set());
        }}
        options={[
          { value: "all", label: "Все" },
          { value: "pending", label: "В очереди" },
          { value: "failed", label: "Ошибки" },
        ]}
      />

      <Card padding="p-0">
        <div className="event-table">
          {visible.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }} className="muted small">
              {rows.isLoading ? "Загрузка…" : "Нет записей"}
            </div>
          ) : (
            visible.map((r) => (
              <OutboxRow
                key={r.id}
                row={r}
                expanded={expanded.has(r.id)}
                onToggle={() => toggleExpand(r.id)}
                onOpenEvent={(id) => setOpenEventId(id)}
                onRetry={(id) => retry.mutate(id)}
                onDismiss={(id) => dismiss.mutate(id)}
              />
            ))
          )}
        </div>
      </Card>

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
            Загрузить ещё
          </Button>
        </div>
      )}

      <EventFormModal
        open={openEventId !== null}
        eventId={openEventId ?? undefined}
        onClose={() => setOpenEventId(null)}
        onSaved={() => setOpenEventId(null)}
      />
    </div>
  );
}

function OutboxRow({
  row,
  expanded,
  onToggle,
  onOpenEvent,
  onRetry,
  onDismiss,
}: {
  row: GoogleOutboxRow;
  expanded: boolean;
  onToggle: () => void;
  onOpenEvent: (id: number) => void;
  onRetry: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const done = !!row.completed_at;
  const failed = !done && row.attempts >= 5;
  const dot = done ? "var(--accent)" : failed ? "var(--danger)" : "var(--muted)";
  const badgeStyle: React.CSSProperties = {
    display: "inline-grid",
    placeItems: "center",
    minWidth: 22,
    height: 20,
    padding: "0 7px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    fontFeatureSettings: "'tnum'",
    background: failed ? "var(--danger)" : "var(--bg-2)",
    color: failed ? "#fff" : "var(--ink-2)",
  };

  const eventClickable = row.event_id !== null;
  const clientLabel = row.event_summary ?? "(событие удалено)";

  return (
    <div className="debug-row">
      <div className="debug-row-head" onClick={onToggle} role="button" tabIndex={0}>
        <span
          className="debug-row-dot"
          style={{ background: dot }}
          title={done ? "Завершено" : failed ? "Ошибка" : "В очереди"}
        />
        <span className="debug-row-when mono">
          {format(parseISO(row.created_at), "d MMM HH:mm", { locale: ru })}
        </span>
        <span
          className={`debug-row-client${eventClickable ? " is-link" : ""}`}
          onClick={(e) => {
            if (!eventClickable || row.event_id === null) return;
            e.stopPropagation();
            onOpenEvent(row.event_id);
          }}
          title={clientLabel}
        >
          {clientLabel}
        </span>
        <span style={badgeStyle} title={`Попыток: ${row.attempts}`}>
          {row.attempts}
        </span>
        <ChevronDown
          size={16}
          className="debug-row-caret"
          style={{ transform: expanded ? "rotate(180deg)" : "none", color: "var(--muted)" }}
        />
      </div>
      {expanded && (
        <div className="debug-row-body">
          <div className="meta-row">
            <span className="muted small">Календарь:</span>
            <span className="mono small">{row.calendar_id}</span>
          </div>
          <div className="meta-row">
            <span className="muted small">Операция:</span>
            <span className="small">{row.op}</span>
          </div>
          {row.google_event_id && (
            <div className="meta-row">
              <span className="muted small">Google event id:</span>
              <span className="mono small">{row.google_event_id}</span>
            </div>
          )}
          {row.last_error && (
            <div className="meta-note">
              <span className="muted small">Ошибка:</span>
              <span className="small" style={{ color: "var(--danger)" }}>
                {row.last_error}
              </span>
            </div>
          )}
          {!done && (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Button size="sm" variant="secondary" onClick={() => onRetry(row.id)}>
                Повторить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDismiss(row.id)}>
                Скрыть
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
