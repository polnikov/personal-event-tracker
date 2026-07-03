import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "@/components/design";
import { google as googleApi } from "@/lib/api";
import { list as outboxList, subscribe as outboxSubscribe } from "@/lib/outbox";

type SettingsTab = "google" | "queue" | "debug";

// Shell for the merged Настройки section: single nav entry, three sub-tabs
// (Google connection, Очередь синхронизации, Отладка). Routing is path-based
// so deep links and each child's own query params (?filter, ?status, OAuth
// callback params) keep working.
export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const seg = location.pathname.split("/")[2];
  const active: SettingsTab = seg === "queue" || seg === "debug" ? seg : "google";

  // Badge sources mirror the old separate nav items so each sub-tab still
  // signals attention: googleApi.status().failed for the Google outbox log,
  // the local outbox for pending/failed client-side sync.
  const googleStatus = useQuery({
    queryKey: ["google", "status"],
    queryFn: () => googleApi.status(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const failedCount = googleStatus.data?.failed ?? 0;

  const [outbox, setOutbox] = useState({ pending: 0, failed: 0 });
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const all = await outboxList();
      if (cancelled) return;
      setOutbox({
        pending: all.filter((e) => e.status === "pending").length,
        failed: all.filter((e) => e.status === "failed").length,
      });
    };
    void refresh();
    const unsub = outboxSubscribe(() => void refresh());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const queueBadge =
    outbox.failed > 0 ? `!${outbox.failed}` : outbox.pending > 0 ? String(outbox.pending) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Настройки</h1>
        </div>
      </div>

      <Tabs<SettingsTab>
        value={active}
        onChange={(v) => navigate(`/settings/${v}`)}
        options={[
          { value: "google", label: "Google" },
          {
            value: "queue",
            label: (
              <>
                Очередь
                {queueBadge && (
                  <span
                    className="tab-badge"
                    style={outbox.failed > 0 ? { background: "var(--danger)" } : undefined}
                  >
                    {queueBadge}
                  </span>
                )}
              </>
            ),
          },
          {
            value: "debug",
            label: (
              <>
                Отладка
                {failedCount > 0 && (
                  <span className="tab-badge" style={{ background: "var(--danger)" }}>
                    {failedCount}
                  </span>
                )}
              </>
            ),
          },
        ]}
      />

      <Outlet />
    </div>
  );
}
