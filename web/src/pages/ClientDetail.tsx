import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Edit3, Phone, Plus, Send, StickyNote } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Empty,
  EventLineRow,
  IconButton,
  Tabs,
  buildEventLineIconMaps,
} from "@/components/design";
import type { EventItem } from "@/types/api";
import {
  Echart,
  ECHART_BASE_TEXT,
  GRID_LEFT_FLUSH,
  type EChartsOption,
} from "@/components/echart";
import { ClientFormModal } from "@/components/ClientFormModal";
import { categories as categoriesApi, clients as clientsApi } from "@/lib/api";
import { EventFormModal } from "@/pages/EventForm";
import { fmt, pluralize } from "@/lib/format";

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
    // Within a month: days follow the view direction (past=DESC,
    // future=ASC), but events on the same day are ALWAYS chronological
    // (earliest first) — that's how the user reads a schedule.
    evs.sort((a, b) => {
      const dayA = a.start_at.slice(0, 10);
      const dayB = b.start_at.slice(0, 10);
      if (dayA !== dayB) {
        return orderDesc ? dayB.localeCompare(dayA) : dayA.localeCompare(dayB);
      }
      return a.start_at.localeCompare(b.start_at);
    });
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
  onClientClick,
  icons,
  orderDesc = true,
}: {
  events: EventItem[];
  emptyTitle: string;
  onEventClick: (id: number) => void;
  onClientClick: (id: number) => void;
  icons: ReturnType<typeof buildEventLineIconMaps>;
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
        <div key={g.key} className="day-group">
          <div className="day-group-head">
            <div>
              <span className="day-group-weekday" style={{ textTransform: "capitalize" }}>
                {format(g.date, "LLLL yyyy", { locale: ru })}
              </span>
              <span className="day-group-date muted">
                {" · "}
                {g.events.length} {pluralize(g.events.length, "событие", "события", "событий")}
              </span>
            </div>
            <div className="day-group-net mono">{RUB(g.net)}</div>
          </div>
          <Card padding="p-0">
            <div className="event-table">
              {g.events.map((e) => {
                const d = parseISO(e.start_at);
                return (
                  <EventLineRow
                    key={e.id}
                    ev={e}
                    icons={icons}
                    dateBadge={{
                      day: format(d, "d"),
                      weekday: format(d, "EEEEEE", { locale: ru }),
                    }}
                    hideClient
                    onClick={() => onEventClick(e.id)}
                    onClient={onClientClick}
                  />
                );
              })}
            </div>
          </Card>
        </div>
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
  const [formModal, setFormModal] = useState<
    | { kind: "new"; prefillClient?: string }
    | { kind: "edit"; eventId: number }
    | { kind: "copy"; copyId: number }
    | null
  >(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", "detail", clientId],
    queryFn: () => clientsApi.detail(clientId),
    enabled: !!clientId,
  });

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });
  const icons = useMemo(() => buildEventLineIconMaps(cats.data), [cats.data]);

  // "Будущие" starts strictly from tomorrow — today's events are dropped.
  const tomorrowKey = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return format(t, "yyyy-MM-dd");
  }, []);

  // Years that have at least one event — chevron pager only navigates
  // between these. ASC order so prev/next neighbour lookups are simple.
  const availableYears = useMemo(() => {
    if (!data) return [] as number[];
    const ys = new Set<number>();
    for (const e of data.future_events) ys.add(new Date(e.start_at).getFullYear());
    for (const e of data.past_events) ys.add(new Date(e.start_at).getFullYear());
    return Array.from(ys).sort((a, b) => a - b);
  }, [data]);
  const hasAnyEvents = availableYears.length > 0;

  const prevYear = useMemo(() => {
    const candidates = availableYears.filter((y) => y < year);
    return candidates.length ? candidates[candidates.length - 1] : null;
  }, [availableYears, year]);
  const nextYear = useMemo(() => {
    const candidates = availableYears.filter((y) => y > year);
    return candidates.length ? candidates[0] : null;
  }, [availableYears, year]);

  // If the currently-selected year has no data, snap to the closest year
  // that does (prefer most recent past year, otherwise nearest future).
  useEffect(() => {
    if (!availableYears.length) return;
    if (availableYears.includes(year)) return;
    const past = availableYears.filter((y) => y < year);
    const future = availableYears.filter((y) => y > year);
    if (past.length) setYear(past[past.length - 1]);
    else setYear(future[0]);
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
    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v));
    return {
      grid: { top: 32, right: 16, bottom: 28, left: GRID_LEFT_FLUSH },
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
          ...ECHART_BASE_TEXT,
          fontSize: 11,
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: {
          ...ECHART_BASE_TEXT,
          fontSize: 10.5,
          inside: true,
          align: "left",
          verticalAlign: "bottom",
          padding: [0, 0, 4, 0],
          formatter: (v: number) => (v === 0 ? "" : fmtCompact(v)),
        },
      },
      series: [
        {
          type: "line" as const,
          smooth: 0.2,
          data: monthly.data.values.map((v) =>
            v > 0 ? v : { value: v, label: { show: false } },
          ),
          symbol: "circle",
          symbolSize: 6,
          showSymbol: true,
          itemStyle: { color: "rgb(123, 182, 97)" },
          lineStyle: { color: "rgb(123, 182, 97)", width: 2 },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(123, 182, 97, 0.42)" },
                { offset: 1, color: "rgba(123, 182, 97, 0)" },
              ],
            },
          },
          label: {
            show: true,
            position: "top",
            color: "#2A2A2E",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontFeatureSettings: "'tnum'",
            fontSize: 10,
            fontWeight: 600,
            backgroundColor: "#FFFFFF",
            borderColor: "#ECEAE3",
            borderWidth: 1,
            borderRadius: 6,
            padding: [2, 6, 2, 6],
            formatter: (p: unknown) => fmtCompact((p as { value: number }).value),
          },
        },
      ],
    };
  }, [monthly.data, year]);

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
            <Button
              variant="secondary"
              size="sm"
              className="client-detail-action client-detail-action--edit"
              icon={<Edit3 size={14} />}
              onClick={() => setEditing(true)}
            >
              Редактировать
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="client-detail-action client-detail-action--add"
              icon={<Plus size={14} />}
              onClick={() =>
                setFormModal({ kind: "new", prefillClient: String(client.id) })
              }
            >
              Добавить событие
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
            {tab === "analytics" && hasAnyEvents && (
              <div className="year-nav">
                <IconButton
                  onClick={() => prevYear != null && setYear(prevYear)}
                  disabled={prevYear == null}
                  aria-label="Предыдущий год"
                >
                  <ChevronLeft size={16} />
                </IconButton>
                <span className="year-nav-label">{year}</span>
                <IconButton
                  onClick={() => nextYear != null && setYear(nextYear)}
                  disabled={nextYear == null}
                  aria-label="Следующий год"
                >
                  <ChevronRight size={16} />
                </IconButton>
              </div>
            )}
          </div>

          {tab === "future" && (
            <MonthGroupedEvents
              events={future_events.filter((e) => e.start_at.slice(0, 10) >= tomorrowKey)}
              emptyTitle="Будущих событий нет"
              orderDesc={false}
              icons={icons}
              onEventClick={(id) => setFormModal({ kind: "edit", eventId: id })}
              onClientClick={(id) => nav(`/clients/${id}`)}
            />
          )}

          {tab === "past" && (
            <MonthGroupedEvents
              events={past_events}
              emptyTitle="Завершённых событий нет"
              orderDesc
              icons={icons}
              onEventClick={(id) => setFormModal({ kind: "edit", eventId: id })}
              onClientClick={(id) => nav(`/clients/${id}`)}
            />
          )}

          {tab === "analytics" && (
            !hasAnyEvents ? (
              <Card>
                <Empty
                  title="Нет данных для аналитики"
                  hint="Появятся, как только у клиента будет хотя бы одно событие"
                />
              </Card>
            ) : (
              <Card className="chart-card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Доход по месяцам</div>
                    <div className="muted small">{year}</div>
                  </div>
                  {monthly.data && (
                    <div className="card-head-sum">
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

      <EventFormModal
        open={formModal !== null}
        eventId={formModal?.kind === "edit" ? formModal.eventId : undefined}
        copyId={formModal?.kind === "copy" ? formModal.copyId : undefined}
        prefillClient={formModal?.kind === "new" ? formModal.prefillClient : undefined}
        onClose={() => setFormModal(null)}
        onSaved={() => setFormModal(null)}
        onCopy={(srcId) => setFormModal({ kind: "copy", copyId: srcId })}
      />
    </div>
  );
}
