import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Button,
  Card,
  EventLineRow,
  buildEventLineIconMaps,
} from "@/components/design";
import type { EventItem } from "@/types/api";
import {
  Echart,
  ECHART_BASE_TEXT,
  GRID_LEFT_FLUSH,
  type EChartsOption,
} from "@/components/echart";
import { categories as categoriesApi, dashboard as dashboardApi, events as eventsApi } from "@/lib/api";
import { EventFormModal } from "@/pages/EventForm";
import { EventDetailModal } from "@/components/EventDetailModal";
import { fmt } from "@/lib/format";
import { useIsMobile } from "@/hooks/useIsMobile";

const RUB = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;

const MONTH_ABBR = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

function netOfEvent(e: EventItem): number {
  const gross = parseFloat(e.total_cost) || 0;
  const tax = (gross * (parseFloat(e.tax) || 0)) / 100;
  const royalty = (gross * (parseFloat(e.royalty) || 0)) / 100;
  return gross - tax - royalty;
}

interface UpcomingDayGroup {
  key: string;
  date: Date;
  events: EventItem[];
  net: number;
}

function groupUpcomingByDay(events: EventItem[]): UpcomingDayGroup[] {
  const map = new Map<string, EventItem[]>();
  for (const e of events) {
    const k = e.start_at.slice(0, 10);
    const list = map.get(k) ?? [];
    list.push(e);
    map.set(k, list);
  }
  const groups: UpcomingDayGroup[] = [];
  for (const [k, evs] of map.entries()) {
    evs.sort((a, b) => a.start_at.localeCompare(b.start_at));
    groups.push({
      key: k,
      date: parseISO(`${k}T00:00:00`),
      events: evs,
      net: evs.reduce((s, e) => s + netOfEvent(e), 0),
    });
  }
  // Closest first: today → +1 → +2 ... — matches the user's expectation
  // of an upcoming-events feed.
  groups.sort((a, b) => a.key.localeCompare(b.key));
  return groups;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DashboardPage() {
  const nav = useNavigate();
  const [formModal, setFormModal] = useState<
    | { kind: "new" }
    | { kind: "edit"; eventId: number }
    | { kind: "copy"; copyId: number }
    | null
  >(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const isMobile = useIsMobile();

  const dash = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => dashboardApi.fetch({ period: "month" }),
  });

  const upcoming = useQuery({
    queryKey: ["events", "list", "future"],
    queryFn: () => eventsApi.list(),
  });

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });
  const icons = useMemo(() => buildEventLineIconMaps(cats.data), [cats.data]);

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  const todayLabel = fmt.todayHeader(today);
  const todayShort = useMemo(
    () => format(today, "EEEE, d MMMM", { locale: ru }),
    [today],
  );
  const data = dash.data;

  const dailyOption: EChartsOption | null = useMemo(() => {
    if (!data) return null;
    const dates = data.chart.daily_dates;
    if (dates.length === 0) return null;
    const xLabels = dates.map((d) => parseInt(d.slice(8, 10), 10).toString());
    const dailySeries = data.chart.daily_series;
    const dailyTotals = dates.map((_, i) =>
      dailySeries.reduce((s, srs) => s + (srs.values[i] || 0), 0),
    );
    const lastSeriesIdx = dailySeries.length - 1;
    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);

    return {
      grid: { top: 55, right: 16, bottom: 44, left: 20, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(255, 255, 255, 0.6)",
        extraCssText: 'backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
        borderRadius: 16,
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        valueFormatter: (v: unknown) => RUB(typeof v === "number" ? v : 0),
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string;
            value: number;
            color: string;
            dataIndex: number;
          }>;
          if (!items.length) return "";
          const total = items.reduce((s, it) => s + (it.value || 0), 0);
          if (total === 0) return "";
          const idx = items[0].dataIndex;
          const dateLabel = format(
            parse(dates[idx], "yyyy-MM-dd", new Date()),
            "d MMMM",
            { locale: ru },
          );
          const rows = items
            .filter((it) => it.value)
            .map(
              (it) =>
                `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${it.color}"></span><span style="flex:1">${it.seriesName}</span><span style="font-weight:500;font-feature-settings:'tnum'">${RUB(it.value)}</span></div>`,
            )
            .join("");
          return `<div style="font-weight:600;font-size:13px">${dateLabel}</div>${rows}<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ECEAE3;display:flex;justify-content:space-between;font-size:12px"><span>Итого</span><span style="font-weight:600;font-feature-settings:'tnum'">${RUB(total)}</span></div>`;
        },
      },
      legend: {
        bottom: 0,
        left: "center",
        textStyle: { ...ECHART_BASE_TEXT, fontSize: 12 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        icon: "roundRect",
      },
      xAxis: {
        type: "category",
        data: xLabels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: {
          ...ECHART_BASE_TEXT,
          fontSize: 10.5,
          interval: 0,
          formatter: (value: string, index: number) => {
            const last = xLabels.length - 1;
            if (index === 0 || index === last) return value;
            return index % 3 === 0 ? value : "";
          },
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
          // Negative left-padding shifts the Y label out of the plot area
          // back toward the card's title column, while grid.left keeps the
          // first bar clear of the axis line.
          padding: [0, 0, 4, -28],
          // Skip the "0" tick so the bottom-most Y label doesn't sit on
          // top of the first X-axis label.
          formatter: (v: number) =>
            v === 0 ? "" : v >= 1000 ? `${v / 1000}k` : String(v),
        },
      },
      series: dailySeries.map((s, srsIdx) => ({
        name: s.name,
        type: "bar" as const,
        stack: "total",
        // Suppress the total-label pill on days whose stack sums to 0 by
        // injecting a per-point label override (only the top series carries
        // the label, so this only matters on the last series).
        data:
          srsIdx === lastSeriesIdx
            ? s.values.map((v, i) =>
                dailyTotals[i] > 0 ? v : { value: v, label: { show: false } },
              )
            : s.values,
        itemStyle: { color: s.color, borderRadius: [3, 3, 0, 0] },
        emphasis: { focus: "series" as const },
        barMaxWidth: 24,
        label:
          srsIdx === lastSeriesIdx
            ? {
                show: true,
                position: "top" as const,
                rotate: 90,
                align: "center" as const,
                verticalAlign: "middle" as const,
                // After 90° rotation the label's original width becomes its
                // vertical extent. Push the anchor up by ~half the pill width
                // plus an extra gap so the rotated pill sits clearly above
                // the bar, centered on the column axis.
                distance: 32,
                color: "#2A2A2E",
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                fontFeatureSettings: "'tnum'",
                fontSize: isMobile ? 11 : 12,
                lineHeight: isMobile ? 11 : 12,
                fontWeight: 600,
                backgroundColor: "#FFFFFF",
                borderColor: "#ECEAE3",
                borderWidth: 1,
                borderRadius: 6,
                padding: [4, 6, 4, 6],
                shadowColor: "rgba(0, 0, 0, 0.12)",
                shadowBlur: 6,
                shadowOffsetY: 2,
                formatter: (p: unknown) => {
                  const total = dailyTotals[(p as { dataIndex: number }).dataIndex];
                  return total > 0 ? fmtCompact(total) : "";
                },
              }
            : { show: false },
      })),
    };
  }, [data]);

  const pieOption: EChartsOption | null = useMemo(() => {
    if (!data || data.by_category.length === 0) return null;
    return {
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(255, 255, 255, 0.6)",
        extraCssText: 'backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
        borderRadius: 16,
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (p: unknown) => {
          const item = p as { name: string; value: number; percent: number; color: string };
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${item.color}"></span><span style="font-weight:500">${item.name}</span></div><div style="margin-top:4px;font-size:12px;font-feature-settings:'tnum'">${RUB(item.value)} · ${item.percent.toFixed(1)}%</div>`;
        },
      },
      legend: {
        orient: "horizontal",
        bottom: 0,
        left: "center",
        textStyle: { ...ECHART_BASE_TEXT, fontSize: 12 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        icon: "circle",
      },
      series: [
        {
          name: "По категориям",
          type: "pie" as const,
          radius: isMobile ? ["30%", "80%"] : ["35%", "75%"],
          center: ["50%", "40%"],
          padAngle: 2,
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "#FFFFFF", borderWidth: 2 },
          label: {
            show: true,
            position: "inside",       // radial — label sits at end of leader line
            color: "#2A2A2E",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontFeatureSettings: "'tnum'",
            fontSize: isMobile ? 12 : 12.5,
            fontWeight: 600,
            lineHeight: 15,
            backgroundColor: "rgba(255, 255, 255, 0.6)",
            extraCssText: 'backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
            borderColor: "#ECEAE3",
            borderWidth: 1,
            borderRadius: 6,
            padding: [2, 6, 2, 6],
            formatter: (p: unknown) => {
              const it = p as { value: number; percent: number };
              const v = it.value;
              const compact = v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v));
              return `${compact} ₽\n${it.percent.toFixed(0)}%`;
            },
            rich: {
              value: {
                align: 'left'
              },
              percent: {
                align: 'left'
              }
            },
          },
          labelLine: {
            show: true,
            length: isMobile ? 8 : 10,
            length2: isMobile ? 4 : 10,
            smooth: true,
            lineStyle: { color: "#DFDCD3" },
          },
          labelLayout: { hideOverlap: false },
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: { shadowBlur: 12, shadowColor: "rgba(42,42,46,0.15)" },
          },
          data: data.by_category.map((c) => ({
            name: c.name,
            value: parseFloat(c.cost) || 0,
            itemStyle: { color: c.color || "#807A72" },
          })),
        },
      ],
    };
  }, [data, isMobile]);

  const monthlyOption: EChartsOption | null = useMemo(() => {
    if (!data) return null;
    const labels = data.chart.monthly_labels.map(
      (m) => MONTH_ABBR[parseInt(m.slice(5, 7), 10) - 1] ?? m,
    );
    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
    return {
      grid: { top: 20, right: 5, bottom: 10, left: GRID_LEFT_FLUSH, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(255, 255, 255, 0.6)",
        extraCssText: 'backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
        borderRadius: 16,
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number; dataIndex: number }>;
          if (!items.length || !items[0].value) return "";
          const idx = items[0].dataIndex;
          const monthDate = parse(data.chart.monthly_labels[idx], "yyyy-MM", new Date());
          const label = format(monthDate, "LLLL yyyy", { locale: ru });
          return `<div style="font-weight:600;font-size:13px;text-transform:capitalize">${label}</div><div style="margin-top:4px;font-size:13px;font-feature-settings:'tnum'">${RUB(items[0].value)}</div>`;
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
          // Per-point label.show is forced to false on zero values so empty
          // months don't render a stray label pill above the baseline.
          data: data.chart.monthly_values.map((v) =>
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
                { offset: 0, color: "rgba(123, 182, 97, 0.82)" },
                { offset: 1, color: "rgba(123, 182, 97, 0)" },
              ],
            },
          },
          label: {
            show: true,
            position: "top",
            distance: 12,
            align: "center",
            verticalAlign: "middle",
            color: "#2A2A2E",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontFeatureSettings: "'tnum'",
            fontSize: isMobile ? 11 : 12,
            lineHeight: isMobile ? 11 : 12,
            fontWeight: 600,
            backgroundColor: "#FFFFFF",
            borderColor: "#ECEAE3",
            borderWidth: 1,
            borderRadius: 6,
            padding: [4, 6, 4, 6],
            shadowColor: "rgba(0, 0, 0, 0.12)",
            shadowBlur: 6,
            shadowOffsetY: 2,
            formatter: (p: unknown) => fmtCompact((p as { value: number }).value),
          },
        },
      ],
    };
  }, [data]);

  const upcomingEvents = useMemo(() => {
    if (!upcoming.data) return [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const limit = start.getTime() + 3 * 86_400_000;
    return upcoming.data.future.filter((e) => new Date(e.start_at).getTime() < limit);
  }, [upcoming.data]);

  const upcomingGroups = useMemo(
    () => groupUpcomingByDay(upcomingEvents),
    [upcomingEvents],
  );

  const monthLabel = useMemo(
    () => format(today, "LLLL", { locale: ru }),
    [today],
  );

  return (
    <div className="page dashboard-page">
      <div className="page-head">
        <div>
          <h1 className="h1">Дашборд</h1>
          <div className="muted mobile-hide" style={{ textTransform: "lowercase" }}>{todayLabel}</div>
        </div>
        <div className="page-head-actions">
          <div
            className="muted mobile-only page-head-mobile-meta"
            style={{ textTransform: "lowercase" }}
          >
            {todayShort}
          </div>
          <Button
            className="mobile-hide"
            icon={<Plus size={16} />}
            onClick={() => setFormModal({ kind: "new" })}
          >
            Новое событие
          </Button>
        </div>
      </div>

      {data && (
        <>
          {/* Row 1: upcoming (3-day window) — no section header; each day
              group's weekday + date acts as the card heading. */}
          <div className="section">
            {upcomingGroups.length > 0 ? (
              upcomingGroups.map((g) => (
                <div key={g.key} className="day-group">
                  <div className="day-group-head">
                    <div>
                      <span className="day-group-weekday">
                        {capitalize(format(g.date, "EEEE", { locale: ru }))}
                      </span>
                      <span className="day-group-date muted">
                        {" · "}
                        {format(g.date, "d MMMM", { locale: ru })}
                      </span>
                      <span className="day-group-count-badge">{g.events.length}</span>
                      {g.key === todayKey && (
                        <span className="day-group-today"> · сегодня</span>
                      )}
                    </div>
                    {g.events.length >= 2 && (
                      <div className="day-group-net mono">{fmt.money(g.net)} ₽</div>
                    )}
                  </div>
                  <Card padding="p-0">
                    <div className="event-table">
                      {g.events.map((e) => (
                        <EventLineRow
                          key={e.id}
                          ev={e}
                          icons={icons}
                          onClick={() => setDetailId(e.id)}
                          onClient={(id) => nav(`/clients/${id}`)}
                        />
                      ))}
                    </div>
                  </Card>
                </div>
              ))
            ) : (
              <div className="muted small">В ближайшие 3 дня событий нет</div>
            )}
          </div>

          {/* Mobile-only "Все события" button — sibling at page level so the
              page gap separates it from the upcoming block above and the
              chart row below by the same amount. */}
          {isMobile && (
            <Button variant="secondary" block onClick={() => nav("/events")}>
              Все события
            </Button>
          )}

          {/* Row 2: daily + pie */}
          <div className="grid grid-2 gap-md">
            <Card className="chart-card">
              <div className="card-head">
                <div>
                  <div className="card-title">Доход по дням</div>
                  <div className="muted small" style={{ textTransform: "capitalize" }}>{monthLabel}</div>
                </div>
                <div className="card-head-sum">{fmt.money(data.total_cost)} ₽</div>
              </div>
              {dailyOption ? (
                <Echart option={dailyOption} height={392} />
              ) : (
                <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
              )}
            </Card>

            <Card className="chart-card">
              <div className="card-head">
                <div>
                  <div className="card-title">Доход по категориям</div>
                  <div className="muted small" style={{ textTransform: "capitalize" }}>{monthLabel}</div>
                </div>
              </div>
              {pieOption ? (
                <Echart option={pieOption} height={380} />
              ) : (
                <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
              )}
            </Card>
          </div>

          {/* Row 3: monthly */}
          <Card className="chart-card">
            <div className="card-head">
              <div>
                <div className="card-title">Доход по месяцам</div>
                <div className="muted small">{new Date().getFullYear()}</div>
              </div>
              <div className="card-head-sum">
                {fmt.money(data.chart.monthly_values.reduce((s, v) => s + v, 0))} ₽
              </div>
            </div>
            {monthlyOption && data.chart.monthly_values.some((v) => v > 0) ? (
              <Echart option={monthlyOption} height={220} />
            ) : (
              <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
            )}
          </Card>
        </>
      )}

      <EventFormModal
        open={formModal !== null}
        eventId={formModal?.kind === "edit" ? formModal.eventId : undefined}
        copyId={formModal?.kind === "copy" ? formModal.copyId : undefined}
        onClose={() => setFormModal(null)}
        onSaved={() => setFormModal(null)}
        onCopy={(srcId) => setFormModal({ kind: "copy", copyId: srcId })}
      />
      {detailId !== null && (
        <EventDetailModal eventId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
