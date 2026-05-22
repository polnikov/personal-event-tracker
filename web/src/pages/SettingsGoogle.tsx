import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, Input, Textarea } from "@/components/design";
import { google as googleApi } from "@/lib/api";

export function SettingsGooglePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const status = useQuery({
    queryKey: ["google", "status"],
    queryFn: () => googleApi.status(),
    refetchInterval: 15_000,
  });

  // OAuth callback redirects back with ?status=ok|error&reason=...
  // Strip them from the URL once read, so reloads don't keep the banner.
  const callbackStatus = search.get("status");
  const callbackReason = search.get("reason");
  useEffect(() => {
    if (callbackStatus) {
      qc.invalidateQueries({ queryKey: ["google", "status"] });
      qc.invalidateQueries({ queryKey: ["google", "calendars"] });
      const next = new URLSearchParams(search);
      next.delete("status");
      next.delete("reason");
      setSearch(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = useMutation({
    mutationFn: () => googleApi.disconnect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["google", "status"] });
      qc.invalidateQueries({ queryKey: ["google", "calendars"] });
    },
  });

  const banner = useMemo(() => {
    if (callbackStatus === "ok") return { kind: "ok" as const, text: "Google подключён" };
    if (callbackStatus === "error")
      return { kind: "error" as const, text: `Не удалось подключить Google: ${callbackReason || "неизвестная ошибка"}` };
    return null;
  }, [callbackStatus, callbackReason]);

  const connected = status.data?.connected ?? false;
  const email = status.data?.email ?? null;
  const pending = status.data?.pending ?? 0;
  const failed = status.data?.failed ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Настройки → Google Calendar</h1>
          <div className="muted">Push-синхронизация событий по категориям</div>
        </div>
      </div>

      {banner && (
        <Card padding="p-4" style={{ borderLeft: `4px solid ${banner.kind === "ok" ? "var(--accent)" : "var(--danger)"}` }}>
          {banner.text}
        </Card>
      )}

      <Card>
        <div className="form">
          <div>
            <div className="muted small">Статус</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }}>
              {connected ? (
                <>
                  Подключён{email ? <>: <span className="mono">{email}</span></> : null}
                </>
              ) : (
                "Не подключён"
              )}
            </div>
          </div>

          {connected && (
            <div className="muted small">
              {pending > 0 && <>В очереди: <span className="mono">{pending}</span>{". "}</>}
              {failed > 0 && (
                <>
                  Ошибок:{" "}
                  <Link to="/debug?filter=failed" className="mono" style={{ color: "var(--danger)" }}>
                    {failed}
                  </Link>
                </>
              )}
              {pending === 0 && failed === 0 && <>Очередь пуста.</>}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {!connected ? (
              <Button onClick={() => googleApi.startAuth()}>Подключить Google</Button>
            ) : (
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm("Отключить Google Calendar? Очередь сохранится для повторного подключения.")) {
                    disconnect.mutate();
                  }
                }}
                disabled={disconnect.isPending}
              >
                Отключить
              </Button>
            )}
          </div>

          <div className="muted small" style={{ marginTop: 12 }}>
            После подключения выберите календарь для каждой категории на странице{" "}
            <Link to="/categories">Категории</Link>. Журнал синхронизации —{" "}
            <Link to="/debug">Отладка</Link>.
          </div>
        </div>
      </Card>

      {!connected && <ManualConnectCard />}
    </div>
  );
}

function ManualConnectCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      googleApi.manualConnect({
        refresh_token: token.trim(),
        email: email.trim() || undefined,
      }),
    onSuccess: () => {
      setToken("");
      setEmail("");
      setError(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["google", "status"] });
      qc.invalidateQueries({ queryKey: ["google", "calendars"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          color: "var(--accent-ink)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {open ? "Скрыть" : "Подключить вручную"}
      </button>
      {open && (
        <div className="form" style={{ marginTop: 16 }}>
          <div className="muted small">
            Если OAuth через редирект не работает (например, из-за прокси/Funnel), получи{" "}
            <code>refresh_token</code> локально:
            <pre style={{ background: "var(--bg)", padding: 10, borderRadius: 8, marginTop: 8, overflow: "auto" }}>
{`.venv\\Scripts\\python.exe scripts\\google_oauth_local.py \\
    --client-id "<DESKTOP_CLIENT_ID>" \\
    --client-secret "<DESKTOP_CLIENT_SECRET>"`}
            </pre>
            Создай в Google Cloud отдельный <strong>Desktop app</strong> OAuth client (типа Desktop позволяет
            редиректы на любой <code>http://localhost</code> без регистрации), запусти скрипт у себя на ПК —
            он отдаст <code>refresh_token</code> и email. Вставь их сюда.
          </div>

          {error && <div className="login-error">{error}</div>}

          <Field label="refresh_token">
            <Textarea
              rows={3}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="1//0g..."
            />
          </Field>
          <Field label="Email (опционально, для отображения)">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
            />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              onClick={() => token.trim() && submit.mutate()}
              disabled={!token.trim() || submit.isPending}
            >
              {submit.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
