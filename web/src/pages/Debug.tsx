import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Button, Card, Tabs } from "@/components/design";
import { google as googleApi } from "@/lib/api";
import type { GoogleOutboxRow } from "@/lib/api";

type Filter = "all" | "pending" | "failed";

export function DebugPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useQuery({
    queryKey: ["google", "outbox", filter],
    queryFn: () => googleApi.outbox({ status: filter, limit: 100 }),
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

  const data = rows.data ?? [];

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
        onChange={setFilter}
        options={[
          { value: "all", label: "Все" },
          { value: "pending", label: "В очереди" },
          { value: "failed", label: "Ошибки" },
        ]}
      />

      <Card padding="p-0">
        <div className="event-table">
          {data.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }} className="muted small">
              {rows.isLoading ? "Загрузка…" : "Нет записей"}
            </div>
          ) : (
            data.map((r) => <OutboxRow key={r.id} row={r} onRetry={(id) => retry.mutate(id)} onDismiss={(id) => dismiss.mutate(id)} />)
          )}
        </div>
      </Card>
    </div>
  );
}

function OutboxRow({
  row,
  onRetry,
  onDismiss,
}: {
  row: GoogleOutboxRow;
  onRetry: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const done = !!row.completed_at;
  const failed = !done && row.attempts >= 5;
  const dot = done
    ? "var(--accent)"
    : failed
    ? "var(--danger)"
    : "var(--muted)";

  return (
    <div className="events-row" style={{ alignItems: "flex-start", cursor: "default" }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: dot,
          marginTop: 8,
          flexShrink: 0,
        }}
      />
      <span className="events-row-cat" style={{ minWidth: 64 }}>
        <span className="events-row-cat-name">{row.op}</span>
      </span>
      <span className="events-row-sub" style={{ flex: 1, minWidth: 0 }}>
        <span className="events-row-sub-name" style={{ whiteSpace: "normal" }}>
          {row.event_summary ?? <em className="muted">(событие удалено)</em>}
          <span className="muted small" style={{ marginLeft: 6 }}>
            cal: <span className="mono">{row.calendar_id}</span>
          </span>
          {row.last_error && (
            <div className="muted small" style={{ marginTop: 2 }} title={row.last_error}>
              {row.last_error.slice(0, 200)}
            </div>
          )}
        </span>
      </span>
      <span className="muted small mono" style={{ flexShrink: 0 }}>
        {format(parseISO(row.created_at), "d MMM HH:mm", { locale: ru })}
      </span>
      <span className="muted small mono" style={{ marginLeft: 12, flexShrink: 0 }}>
        попыток: {row.attempts}
      </span>
      <span style={{ display: "flex", gap: 6, marginLeft: 12, flexShrink: 0 }}>
        {!done && (
          <Button size="sm" variant="secondary" onClick={() => onRetry(row.id)}>
            Повторить
          </Button>
        )}
        {!done && (
          <Button size="sm" variant="ghost" onClick={() => onDismiss(row.id)}>
            Скрыть
          </Button>
        )}
      </span>
    </div>
  );
}
