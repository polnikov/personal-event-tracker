import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button, Card, IconButton } from "@/components/design";
import type { OutboxEntry } from "@/lib/db";
import { ack, list, retry, subscribe } from "@/lib/outbox";
import { flush } from "@/lib/syncDaemon";

function methodPill(method: string) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 6,
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontSize: 10.5,
        background: "var(--surface-2, #f3efe7)",
        color: "var(--ink-2)",
      }}
    >
      {method}
    </span>
  );
}

export function SyncQueuePage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<OutboxEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const all = await list();
      if (!cancelled) setRows(all);
    };
    void refresh();
    const unsub = subscribe(() => void refresh());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const pending = rows.filter((r) => r.status === "pending");
  const failed = rows.filter((r) => r.status === "failed");

  const Section = ({ title, items }: { title: string; items: OutboxEntry[] }) => {
    if (items.length === 0) return null;
    return (
      <div className="section">
        <div className="section-head">
          <div className="card-title">{title} · {items.length}</div>
        </div>
        <Card padding="p-0">
          <div>
            {items.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 14px",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {methodPill(row.method)}
                    <span className="mono small">{row.url}</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    {format(row.ts, "d MMM yyyy, HH:mm:ss", { locale: ru })}
                    {row.attempts > 0 && <> · попыток: {row.attempts}</>}
                    {row.lastError && <> · {row.lastError}</>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {row.status === "failed" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<RotateCcw size={14} />}
                      onClick={async () => {
                        await retry(row.id);
                        await flush();
                        qc.invalidateQueries({ queryKey: ["events"] });
                      }}
                    >
                      Повторить
                    </Button>
                  )}
                  <IconButton
                    small
                    danger
                    aria-label="Удалить из очереди"
                    onClick={() => {
                      if (confirm("Удалить эту операцию из очереди?")) {
                        void ack(row.id);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Очередь синхронизации</h1>
          <div className="muted">
            Изменения, которые ждут отправки на сервер. Уходят автоматически при появлении сети.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={() => void flush()} disabled={rows.length === 0}>
            Синхронизировать сейчас
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="empty">
            <div className="empty-title">Очередь пуста</div>
            <div className="empty-hint">Все изменения отправлены на сервер.</div>
          </div>
        </Card>
      ) : (
        <>
          <Section title="Ожидают отправки" items={pending} />
          <Section title="Не удалось отправить" items={failed} />
        </>
      )}
    </div>
  );
}
