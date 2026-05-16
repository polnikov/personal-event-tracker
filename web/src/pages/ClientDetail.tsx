import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Edit3, Phone, Plus, Send, StickyNote } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Empty,
  EventTableRow,
  Tabs,
} from "@/components/design";
import type { EventItem } from "@/types/api";
import { Echart, type EChartsOption } from "@/components/echart";
import { ClientFormModal } from "@/components/ClientFormModal";
import { clients as clientsApi } from "@/lib/api";
import { fmt } from "@/lib/format";

type TabKey = "future" | "past" | "analytics";

const RUB = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
const PAGE_SIZE = 10;

function netOf(e: EventItem): number {
  const gross = parseFloat(e.total_cost) || 0;
  const tax = (gross * (parseFloat(e.tax) || 0)) / 100;
  const royalty = (gross * (parseFloat(e.royalty) || 0)) / 100;
  return gross - tax - royalty;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface MonthGroup {
  key: string;       // YYYY-MM
  date: Date;        // first day of month, local
  events: EventItem[];
  net: number;
}

function groupByMonth(events: EventItem[], orderDesc = true): MonthGroup[] {
  const map = new Map<string, EventItem[]>();
  for (const e of events) {
    const key = e.start_at.slice(0, 7); // YYYY-MM
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  const groups: MonthGroup[] = [];
  for (const [key, evs] of map.entries()) {
    // Within a month: events sorted by start_at according to view direction.
    evs.sort((a, b) =>
      orderDesc
        ? b.start_at.localeCompare(a.start_at)
        : a.start_at.localeCompare(b.start_at),
    );
    groups.push({
      key,
      date: parseISO(`${key}-01T00:00:00`),
      events: evs,
      net: evs.reduce((s, e) => s + netOf(e), 0),
    });
  }
  groups.sort((a, b) =>
    orderDesc ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key),
  );
  return groups;
}

function MonthGroupedEvents({
  events,
  emptyTitle,
  onEventClick,
  orderDesc = true,
}: {
  events: EventItem[];
  emptyTitle: string;
  onEventClick: (id: number) => void;
  orderDesc?: boolean;
}) {
  const groups = useMemo(() => groupByMonth(events, orderDesc), [events, orderDesc]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [events, orderDesc]);

  if (groups.length === 0) {
    return (
      <Card><Empty title={emptyTitle} /></Card>
    );
  }

  // Trim events across month widgets so the total displayed events <= limit.
  const totalEvents = groups.reduce((s, g) => s + g.events.length, 0);
  const visibleGroups: MonthGroup[] = [];
  let remaining = limit;
  for (const g of groups) {
    if (remaining <= 0) break;
    if (g.events.length <= remaining) {
      visibleGroups.push(g);
      remaining -= g.events.length;
    } else {
      visibleGroups.push({ ...g, events: g.events.slice(0, remaining) });
      remaining = 0;
    }
  }

  return (
    <div className="stack-md">
      {visibleGroups.map((g) => (
        <Card key={g.key}>
          <div className="card-head" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ textTransform: "capitalize" }}>
              {format(g.date, "LLLL yyyy", { locale: ru })}
            </div>
            <div className="day-group-net mono">{RUB(g.net)}</div>
          </div>
          <div className="event-table">
            {g.events.map((e) => {
              const d = parseISO(e.start_at);
              const label = `${format(d, "d")} ${format(d, "EEEEEE", { locale: ru })}`;
              return (
                <EventTableRow
                  key={e.id}
                  ev={e}
                  showDate
                  dateLabel={label}
                  notesInsteadOfClient
                  onClick={() => onEventClick(e.id)}
                />
              );
            })}
          </div>
        </Card>
      ))}
      {limit < totalEvents && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Загрузить ещё ({totalEvents - limit})
          </Button>
        </div>
      )}
    </div>
  );
}

export function ClientDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const clientId = Number(id);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<TabKey>("future");
  const [year, setYear] = useState<number>(() => new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["clients", "detail", clientId],
    queryFn: () => clientsApi.detail(clientId),
    enabled: !!clientId,
  });

  // Years actually present in this client's events (newest first).
  const availableYears = useMemo(() => {
    if (!data) return [];
    const set = new Set<number>();
    for (const e of [...data.future_events, ...data.past_events]) {
      set.add(parseISO(e.start_at).getFullYear());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [data]);

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

  // If selected year isn't in the data, switch to the most recent available one.
  useEffect(() => {
    if (availableYears.length === 0) return;
    if (!availableYears.includes(year)) setYear(availableYears[0]);
  }, [availableYears, year]);

  const monthly = useQuery({
    queryKey: ["clients", clientId, "monthly", year],
    queryFn: () => clientsApi.monthly(clientId, year),
    enabled: !!clientId && tab === "analytics",
  });

  const monthlyOption: EChartsOption | null = useMemo(() => {
    if (!monthly.data) return null;
    const labels = Array.from({ length: 12 }, (_, i) =>
      format(parse(String(i + 1), "M", new Date()), "LLL", { locale: ru }),
    );
    return {
      grid: { top: 24, right: 16, bottom: 28, left: 56 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#FFFFFF",
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number; dataIndex: number }>;
          if (!items.length) return "";
          const idx = items[0].dataIndex;
          const monthDate = parse(String(idx + 1), "M", new Date());
          const monthLabel = format(monthDate, "LLLL", { locale: ru });
          const y = monthly.data?.year ?? year;
          return `<div style="font-weight:600;font-size:13px;text-transform:capitalize">${monthLabel} ${y}</div><div style="margin-top:4px;font-size:13px;font-feature-settings:'tnum'">${RUB(items[0].value)}</div>`;
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: {
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#807A72",
          fontSize: 11,
        },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: {
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#807A72",
          fontSize: 10.5,
          formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)),
        },
      },
      series: [
        {
          type: "bar" as const,
          data: monthly.data.values,
          itemStyle: { color: "oklch(0.62 0.13 145)", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 28,
        },
      ],
    };
  }, [monthly.data]);

  // Earliest event across past + future, used as "первое событие" subtitle.
  // MUST be declared before any early return so the hook order is stable.
  const firstEventDate = useMemo(() => {
    if (!data) return null;
    let earliest: string | null = null;
    for (const e of [...data.past_events, ...data.future_events]) {
      if (earliest === null || e.start_at < earliest) earliest = e.start_at;
    }
    return earliest;
  }, [data]);

  if (isLoading) return <div className="muted small">Загрузка…</div>;
  if (!data) return <Card>Клиент не найден</Card>;

  const { client, future_events, past_events } = data;

  return (
    <div className="page">
      <div className="back-link" onClick={() => nav("/clients")}>← Клиенты</div>

      <div className="grid gap-md" style={{ "--col-template": "1fr 2fr" } as React.CSSProperties}>
        <Card>
          <div className="client-detail-top">
            <Avatar name={client.full_name} size={64} />
            <div>
              <div className="h2">{client.full_name}</div>
              <div className="muted small">
                {firstEventDate
                  ? `Первое событие: ${fmt.fullDate(firstEventDate)}`
                  : "Событий пока нет"}
              </div>
            </div>
          </div>

          <div className="client-detail-stats">
            <div>
              <div className="ds-num mono">{client.events_count}</div>
              <div className="ds-lab muted small">событий</div>
            </div>
            <div>
              <div className="ds-num mono">{fmt.money(client.total_spent)} ₽</div>
              <div className="ds-lab muted small">всего</div>
            </div>
          </div>

          <div className="client-detail-meta">
            {client.phone && (
              <div className="meta-row">
                <span className="meta-icon"><Phone size={14} strokeWidth={1.6} /></span>
                <a href={`tel:${client.phone}`}>{client.phone}</a>
              </div>
            )}
            {client.telegram && (
              <div className="meta-row">
                <span className="meta-icon"><Send size={14} strokeWidth={1.6} /></span>
                <a href={`https://t.me/${client.telegram}`} target="_blank" rel="noopener">
                  @{client.telegram}
                </a>
              </div>
            )}
            {client.notes && (
              <div className="meta-note">
                <span className="meta-icon"><StickyNote size={14} strokeWidth={1.6} /></span>
                <span>{client.notes}</span>
              </div>
            )}
          </div>

          <div className="client-detail-actions">
            <Button variant="secondary" size="sm" icon={<Edit3 size={14} />}
              onClick={() => setEditing(true)}>
              Редактировать
            </Button>
            <Button variant="ghost" size="sm" icon={<Plus size={14} />}
              onClick={() => nav(`/events/new?client=${client.id}`)}>
              Событие
            </Button>
          </div>
        </Card>

        {editing && (
          <ClientFormModal client={client} onClose={() => setEditing(false)} />
        )}

        <div className="stack-md">
          <div className="client-detail-tabs-row">
            <Tabs<TabKey>
              value={tab}
              onChange={setTab}
              options={[
                {
                  value: "future",
                  label: (
                    <>
                      Будущие
                      {future_events.length > 0 && (
                        <span className="tab-badge">{future_events.length}</span>
                      )}
                    </>
                  ),
                },
                {
                  value: "past",
                  label: (
                    <>
                      Прошедшие
                      {past_events.length > 0 && (
                        <span className="tab-badge">{past_events.length}</span>
                      )}
                    </>
                  ),
                },
                { value: "analytics", label: "Аналитика" },
              ]}
            />
            {tab === "analytics" && yearOptions.length > 0 && (
              <Tabs<string>
                value={String(year)}
                onChange={(v) => setYear(Number(v))}
                options={yearOptions}
              />
            )}
          </div>

          {tab === "future" && (
            <MonthGroupedEvents
              events={future_events}
              emptyTitle="Будущих событий нет"
              orderDesc
              onEventClick={(id) => nav(`/events/${id}/edit`)}
            />
          )}

          {tab === "past" && (
            <MonthGroupedEvents
              events={past_events}
              emptyTitle="Завершённых событий нет"
              orderDesc
              onEventClick={(id) => nav(`/events/${id}/edit`)}
            />
          )}

          {tab === "analytics" && (
            availableYears.length === 0 ? (
              <Card>
                <Empty
                  title="Нет данных для аналитики"
                  hint="Появятся, как только у клиента будет хотя бы одно событие"
                />
              </Card>
            ) : (
              <Card>
                <div className="card-head">
                  <div>
                    <div className="card-title">Доход по месяцам</div>
                    <div className="muted small">{year}</div>
                  </div>
                  {monthly.data && (
                    <div className="muted small">
                      {fmt.money(monthly.data.values.reduce((s, v) => s + v, 0))} ₽
                    </div>
                  )}
                </div>
                {monthly.isLoading ? (
                  <div className="muted small" style={{ marginTop: 16 }}>Загрузка…</div>
                ) : monthlyOption && monthly.data && monthly.data.values.some((v) => v > 0) ? (
                  <Echart option={monthlyOption} height={240} />
                ) : (
                  <div className="muted small" style={{ marginTop: 16 }}>Нет данных за {year}</div>
                )}
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}
