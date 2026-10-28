import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import type { BarSeriesOption } from "echarts";
import {
  Button,
  Card,
  EventLineRow,
  buildEventLineIconMaps,
} from "@/components/design";
import type { EventItem } from "@/types/api";
import {
  CHART_GAP,
  CHART_INK,
  CHART_LINE,
  CHART_TOOLTIP,
  Echart,
  ECHART_BASE_TEXT,
  ECHART_MONO_TEXT,
  GRID_LEFT_FLUSH,
  INCOME_GREEN,
  fmtBarTotal,
  monthlyBarStyle,
  verticalBarLabel,
  type EChartsOption,
} from "@/components/echart";
import { categories as categoriesApi, dashboard as dashboardApi, events as eventsApi } from "@/lib/api";
import { EventFormModal } from "@/pages/EventForm";
import { EventDetailModal } from "@/components/EventDetailModal";
import { PctChangePill } from "@/components/PctChangePill";
import { fmt, pluralize } from "@/lib/format";
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

/** 245000 -> "245K": the donut centre has room for a short total only. */
function fmtThousands(v: number): string {
  return `${(v / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}K`;
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

  const incomeHistory = useQuery({
    queryKey: ["dashboard", "income-history"],
    queryFn: () => dashboardApi.incomeHistory(),
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
    // Today's column gets a soft band behind the bars (plus the dark day pill
    // on the axis below), so the current date is findable at a glance. The
    // band rides on every series instead of one: a legend toggle then can't
    // take it away, and an opaque fill keeps the stacked copies identical.
    const todayIdx = dates.indexOf(todayKey);
    const todayBand: BarSeriesOption["markArea"] =
      todayIdx < 0
        ? undefined
        : {
            silent: true,
            label: { show: false },
            itemStyle: { color: "rgba(255, 255, 255, 0.06)" },
            // On a bar series markArea snaps to the tick coords, so the same
            // index on both ends covers exactly one category band.
            data: [[{ xAxis: todayIdx }, { xAxis: todayIdx }]],
          };

    return {
      grid: { top: 55, right: 0, bottom: 44, left: 0, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        ...CHART_TOOLTIP,
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
                `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${it.color}"></span><span style="flex:1">${it.seriesName}</span><span style="font-weight:500;font-feature-settings:'ss01'">${RUB(it.value)}</span></div>`,
            )
            .join("");
          return `<div style="font-weight:600;font-size:13px">${dateLabel}</div>${rows}<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.14);display:flex;justify-content:space-between;font-size:12px"><span>Итого</span><span style="font-weight:600;font-feature-settings:'ss01'">${RUB(total)}</span></div>`;
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
        axisLine: { lineStyle: { color: CHART_LINE } },
        axisLabel: {
          ...ECHART_BASE_TEXT,
          fontSize: 10.5,
          interval: 0,
          formatter: (value: string, index: number) => {
            if (index === todayIdx) return `{today|${value}}`;
            const last = xLabels.length - 1;
            // Leave the slots next to the pill empty so nothing collides.
            if (todayIdx >= 0 && Math.abs(index - todayIdx) === 1) return "";
            if (index === 0 || index === last) return value;
            return index % 3 === 0 ? value : "";
          },
          rich: {
            today: {
              color: "#1B2140",
              backgroundColor: "#FFFFFF",
              borderRadius: 999,
              padding: [3, 5, 2, 5],
              fontSize: 10.5,
              fontWeight: 600,
              fontFamily: "Onest Variable, system-ui, sans-serif",
            },
          },
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_LINE } },
        axisLabel: { show: false },
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
        itemStyle: { color: s.color, borderRadius: [8, 8, 8, 8] },
        markArea: todayBand,
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
                color: CHART_INK,
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
                fontFeatureSettings: "'ss01'",
                fontSize: isMobile ? 11 : 12,
                lineHeight: isMobile ? 11 : 12,
                fontWeight: 400,
                formatter: (p: unknown) => {
                  const total = dailyTotals[(p as { dataIndex: number }).dataIndex];
                  return total > 0 ? total.toLocaleString('ru-RU') : "";
                },
              }
            : { show: false },
      })),
    };
  }, [data, todayKey, isMobile]);

  const pieOption: EChartsOption | null = useMemo(() => {
    if (!data || data.by_category.length === 0) return null;
    // Thin ring: the sums, shares and hours live in the legend under it.
    return {
      tooltip: {
        trigger: "item",
        ...CHART_TOOLTIP,
        formatter: (p: unknown) => {
          const item = p as { name: string; value: number; percent: number; color: string };
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${item.color}"></span><span style="font-weight:500">${item.name}</span></div><div style="margin-top:4px;font-size:12px">${RUB(item.value)} · ${item.percent.toFixed(1)}%</div>`;
        },
      },
      series: [
        {
          name: "По категориям",
          type: "pie" as const,
          radius: ["66%", "88%"],
          padAngle: 2,
          itemStyle: { borderRadius: 4 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 3 },
          data: data.by_category.map((c) => ({
            name: c.name,
            value: parseFloat(c.cost) || 0,
            itemStyle: { color: c.color || "#8A8FA8" },
          })),
        },
      ],
    };
  }, [data]);

  const monthlyOption: EChartsOption | null = useMemo(() => {
    if (!data) return null;
    const labels = data.chart.monthly_labels.map(
      (m) => MONTH_ABBR[parseInt(m.slice(5, 7), 10) - 1] ?? m,
    );
    return {
      // Tall top inset: the vertical totals stand above the highest bar.
      grid: { top: 64, right: 0, bottom: 10, left: 0, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        ...CHART_TOOLTIP,
        formatter: (params: unknown) => {
          const items = params as Array<{ name: string; value: number; dataIndex: number }>;
          if (!items.length || !items[0].value) return "";
          const idx = items[0].dataIndex;
          const monthDate = parse(data.chart.monthly_labels[idx], "yyyy-MM", new Date());
          const label = format(monthDate, "LLLL yyyy", { locale: ru });
          return `<div style="font-weight:600;font-size:13px;text-transform:capitalize">${label}</div><div style="margin-top:4px;font-size:13px;font-feature-settings:'ss01'">${RUB(items[0].value)}</div>`;
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: CHART_LINE } },
        axisLabel: {
          ...ECHART_BASE_TEXT,
          fontSize: 11,
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_LINE } },
        axisLabel: { show: false },
      },
      series: [
        {
          type: "bar" as const,
          barMaxWidth: 28,
          itemStyle: monthlyBarStyle(INCOME_GREEN),
          // Empty months carry no label, so nothing stands on the baseline.
          data: data.chart.monthly_values.map((v) =>
            v > 0 ? v : { value: v, label: { show: false } },
          ),
          label: verticalBarLabel(isMobile, (p) =>
            fmtBarTotal((p as { value: number }).value),
          ),
        },
      ],
    };
  }, [data, isMobile]);

  // "Динамика дохода": one point per calendar day across the whole history.
  // Large-area setup (no symbols, LTTB sampling) so thousands of days stay
  // smooth, with a zoom slider to narrow the window down to a single week.
  const historyOption: EChartsOption | null = useMemo(() => {
    const hist = incomeHistory.data;
    if (!hist || hist.dates.length === 0) return null;
    // "2026-03-04" -> "4 мар 26". Falls back to the raw value so an axis or
    // slider label that isn't a plain ISO day can never render as NaN.
    const shortDate = (d: string) => {
      const [y, m, day] = String(d).split("-");
      const mon = MONTH_ABBR[parseInt(m, 10) - 1];
      if (!mon || !day) return String(d);
      return `${parseInt(day, 10)} ${mon.toLowerCase()} ${y.slice(2)}`;
    };
    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
    return {
      grid: {
        top: 16,
        right: 6,
        bottom: isMobile ? 68 : 62,
        left: 0,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        // Narrow screens: keep the box inside the canvas.
        confine: true,
        axisPointer: { type: "line", lineStyle: { color: "rgba(255, 255, 255, 0.3)" } },
        ...CHART_TOOLTIP,
        formatter: (params: unknown) => {
          const items = params as Array<{ dataIndex: number; value: number }>;
          if (!items.length) return "";
          const label = format(
            parse(hist.dates[items[0].dataIndex], "yyyy-MM-dd", new Date()),
            "d MMMM yyyy",
            { locale: ru },
          );
          return `<div style="font-weight:600;font-size:13px">${label}</div><div style="margin-top:4px;font-size:13px;font-feature-settings:'ss01'">${RUB(items[0].value || 0)}</div>`;
        },
      },
      xAxis: {
        type: "category",
        data: hist.dates,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: CHART_LINE } },
        axisLabel: {
          ...ECHART_BASE_TEXT,
          fontSize: 10.5,
          hideOverlap: true,
          formatter: (v: string) => shortDate(v),
        },
      },
      yAxis: {
        type: "value",
        boundaryGap: [0, "8%"],
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: CHART_LINE } },
        axisLabel: { ...ECHART_MONO_TEXT, fontSize: 10.5, formatter: fmtCompact },
      },
      dataZoom: [
        // Desktop keeps an in-plot zoom, but bound to Ctrl+wheel and pointer
        // drag, so a plain scroll over the card still scrolls the page. Touch
        // gets the slider only: a one-finger drag inside the plot has to stay
        // page scroll.
        ...(isMobile
          ? []
          : [
              {
                type: "inside" as const,
                zoomOnMouseWheel: "ctrl" as const,
                moveOnMouseMove: true,
                moveOnMouseWheel: false,
              },
            ]),
        {
          type: "slider" as const,
          height: isMobile ? 28 : 24,
          bottom: 6,
          borderColor: CHART_LINE,
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          fillerColor: "rgba(143, 227, 176, 0.14)",
          dataBackground: {
            lineStyle: { color: "rgba(255, 255, 255, 0.25)" },
            areaStyle: { color: "rgba(255, 255, 255, 0.06)" },
          },
          selectedDataBackground: {
            lineStyle: { color: INCOME_GREEN },
            areaStyle: { color: "rgba(143, 227, 176, 0.22)" },
          },
          handleStyle: { color: "#FFFFFF", borderColor: "rgba(255, 255, 255, 0.5)" },
          moveHandleStyle: { color: "rgba(255, 255, 255, 0.25)" },
          // Touch needs grips a finger can actually land on; the thin desktop
          // handles are unhittable on a phone.
          handleSize: isMobile ? "150%" : "120%",
          moveHandleSize: isMobile ? 20 : 3,
          // Drag-to-select inside the mini map fights touch scrolling.
          brushSelect: false,
          labelFormatter: (_: number, valueStr: string) => shortDate(valueStr),
          textStyle: { ...ECHART_BASE_TEXT, fontSize: 10 },
        },
      ],
      series: [
        {
          name: "Доход",
          type: "line" as const,
          // Income is a per-day bucket, not a continuous reading: the step
          // holds each day's value across its own band instead of sloping
          // between days as if the money trickled in.
          step: "middle" as const,
          symbol: "none" as const,
          sampling: "lttb" as const,
          itemStyle: { color: INCOME_GREEN },
          lineStyle: { width: 1.5, color: INCOME_GREEN },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(143, 227, 176, 0.4)" },
                { offset: 1, color: "rgba(143, 227, 176, 0.02)" },
              ],
            },
          },
          data: hist.values,
        },
      ],
    };
  }, [incomeHistory.data, isMobile]);

  const historyRange = useMemo(() => {
    const hist = incomeHistory.data;
    if (!hist || hist.dates.length === 0) return null;
    const monthLabelOf = (d: string) =>
      format(parse(d, "yyyy-MM-dd", new Date()), "LLL yyyy", { locale: ru });
    const from = monthLabelOf(hist.dates[0]);
    const to = monthLabelOf(hist.dates[hist.dates.length - 1]);
    return from === to ? from : `${from} - ${to}`;
  }, [incomeHistory.data]);

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
                <div className="card-head-sum-wrap">
                  <div className="card-head-sum">{fmt.money(data.total_cost)} ₽</div>
                  {/* Delta compares equal slices: the 1st-through-today sum
                      of this month against the same days of the previous one,
                      not the whole month that is still running. */}
                  <PctChangePill
                    current={
                      parseFloat(data.mtd_total_cost ?? data.total_cost) || 0
                    }
                    previous={
                      data.prev_total_cost != null
                        ? parseFloat(data.prev_total_cost) || 0
                        : null
                    }
                    prevLabel={
                      data.mtd_prev_days != null
                        ? `Прошлый месяц, 1-${data.mtd_prev_days}`
                        : undefined
                    }
                  />
                </div>
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
                <>
                  <div className="cat-donut">
                    <Echart option={pieOption} height={220} />
                    <div className="cat-donut-center">
                      <span className="muted small">
                        {data.total_count}{" "}
                        {pluralize(data.total_count, "событие", "события", "событий")}
                      </span>
                      <b>{fmtThousands(parseFloat(data.total_cost) || 0)} ₽</b>
                    </div>
                  </div>
                  <div className="cat-share-list">
                    {data.by_category.map((c) => {
                      const cost = parseFloat(c.cost) || 0;
                      const total = parseFloat(data.total_cost) || 0;
                      const share = total > 0 ? (cost / total) * 100 : 0;
                      return (
                        <div key={c.name} className="cat-share-row">
                          <span className="cat-share-name">
                            <i style={{ background: c.color }} />
                            {c.name}
                          </span>
                          <span className="cat-share-value mono">{fmt.money(cost)} ₽</span>
                          <span className="cat-share-meta">
                            {Math.round(share)}% · {c.count}{" "}
                            {pluralize(c.count, "событие", "события", "событий")} ·{" "}
                            {(c.minutes / 60).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч
                          </span>
                          <span className="cat-share-bar">
                            <span style={{ width: `${share}%`, background: c.color }} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
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
              <div className="card-head-sum-wrap">
                <div className="card-head-sum">
                  {fmt.money(data.chart.monthly_values.reduce((s, v) => s + v, 0))} ₽
                </div>
                <PctChangePill
                  current={data.chart.monthly_values.reduce((s, v) => s + v, 0)}
                  previous={data.chart.monthly_prev_total ?? null}
                  prevLabel={`${new Date().getFullYear() - 1}`}
                />
              </div>
            </div>
            {monthlyOption && data.chart.monthly_values.some((v) => v > 0) ? (
              <Echart option={monthlyOption} height={260} />
            ) : (
              <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
            )}
          </Card>

          {/* Row 4: whole-history income dynamics, zoomable down to a day */}
          <Card className="chart-card">
            <div className="card-head">
              <div>
                <div className="card-title">Динамика дохода</div>
                <div className="muted small" style={{ textTransform: "capitalize" }}>
                  {historyRange ?? "вся история"}
                </div>
              </div>
            </div>
            {historyOption ? (
              <Echart option={historyOption} height={isMobile ? 260 : 320} />
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
