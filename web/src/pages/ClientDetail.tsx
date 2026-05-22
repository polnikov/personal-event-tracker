import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Edit3, Phone, Plus, Search, Send, StickyNote } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Empty,
  EventLineRow,
  IconButton,
  Input,
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
import { useIsMobile } from "@/hooks/useIsMobile";

type TabKey = "future" | "past" | "analytics";

function filterByNotes(events: EventItem[], query: string): EventItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return events;
  return events.filter((e) => (e.notes || "").toLowerCase().includes(q));
}

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

  const todayDayKey = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="stack-md">
      {visibleGroups.map((g) => {
        const groupHasToday = g.events.some(
          (e) => e.start_at.slice(0, 10) === todayDayKey,
        );
        return (
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
              {groupHasToday && (
                <span className="day-group-today"> · сегодня</span>
              )}
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
        );
      })}
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
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<TabKey>("future");
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [notesQuery, setNotesQuery] = useState("");
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

  // "Будущие" includes today's not-yet-ended events too — matches Events
  // page logic. Backend partitions on start_at vs now, so we re-partition
  // client-side on end_at > now to capture in-progress and not-started.
  const isFutureEvent = (e: EventItem) =>
    new Date(e.end_at).getTime() > Date.now();

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
    const labels = [
      "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
      "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
    ];
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

  // Weekday × month heatmap — same shape & settings as the Report page,
  // but scoped to the current client + selected year. Mobile rotates the
  // axes (months become rows, weekdays become columns).
  const heatmapOption: EChartsOption | null = useMemo(() => {
    const matrix = monthly.data?.weekday_month;
    if (!matrix || matrix.length !== 7) return null;
    const monthLabels = [
      "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
      "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
    ];
    const dowLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const cells: [number, number, number][] = [];
    let maxCount = 0;
    for (let w = 0; w < 7; w++) {
      for (let m = 0; m < 12; m++) {
        const c = matrix[w]?.[m] || 0;
        const x = isMobile ? w : m;
        const y = isMobile ? 11 - m : 6 - w;
        cells.push([x, y, c]);
        if (c > maxCount) maxCount = c;
      }
    }
    const xData = isMobile ? dowLabels : monthLabels;
    const yData = isMobile
      ? [...monthLabels].reverse()
      : [...dowLabels].reverse();
    return {
      grid: { top: 16, right: 16, bottom: 28, left: 36 },
      tooltip: { show: false },
      visualMap: {
        show: false,
        type: "continuous",
        min: 0,
        max: Math.max(maxCount, 1),
        calculable: false,
        inRange: { color: ["rgba(123, 182, 97, 0.04)", "rgb(123, 182, 97)"] },
      },
      xAxis: {
        type: "category",
        data: xData,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: { ...ECHART_BASE_TEXT, fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: yData,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: { ...ECHART_BASE_TEXT, fontSize: 11 },
      },
      series: [
        {
          type: "heatmap" as const,
          data: cells,
          label: {
            show: true,
            color: "#2A2A2E",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontFeatureSettings: "'tnum'",
            fontSize: 11,
            formatter: (p: unknown) => {
              const v = (p as { value: [number, number, number] }).value[2];
              return v > 0 ? String(v) : "";
            },
          },
          itemStyle: { borderColor: "#FFFFFF", borderWidth: 2, borderRadius: 4 },
          emphasis: {
            itemStyle: { shadowBlur: 8, shadowColor: "rgba(42, 42, 46, 0.15)" },
          },
        },
      ],
    };
  }, [monthly.data, isMobile]);

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

  const { client } = data;
  // Re-partition all events on end_at > now so today's in-progress and
  // not-yet-started events surface under "Будущие" (the backend put them
  // in past_events when start_at <= now).
  const all = [...data.future_events, ...data.past_events];
  const future_events = all.filter(isFutureEvent);
  const past_events = all.filter((e) => !isFutureEvent(e));

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
            {(tab === "future" || tab === "past") && (
              <div className="client-detail-notes-search">
                <Input
                  icon={<Search size={16} />}
                  placeholder="Поиск..."
                  value={notesQuery}
                  onChange={(e) => setNotesQuery(e.target.value)}
                  onClear={() => setNotesQuery("")}
                />
              </div>
            )}
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
              events={filterByNotes(
                future_events,
                notesQuery,
              )}
              emptyTitle="Будущих событий нет"
              orderDesc={false}
              icons={icons}
              onEventClick={(id) => setFormModal({ kind: "edit", eventId: id })}
              onClientClick={(id) => nav(`/clients/${id}`)}
            />
          )}

          {tab === "past" && (
            <MonthGroupedEvents
              events={filterByNotes(past_events, notesQuery)}
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
              <div className="stack-md">
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

                {heatmapOption && (
                  <Card className="chart-card">
                    <div className="card-head">
                      <div>
                        <div className="card-title">События по дням недели</div>
                        <div className="muted small">{year}</div>
                      </div>
                    </div>
                    <Echart option={heatmapOption} height={isMobile ? 420 : 290} />
                  </Card>
                )}
              </div>
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
