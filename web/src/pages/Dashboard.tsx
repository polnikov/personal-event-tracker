import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Button,
  Card,
  EventTableRow,
} from "@/components/design";
import type { EventItem } from "@/types/api";
import { Echart, type EChartsOption } from "@/components/echart";
import { dashboard as dashboardApi, events as eventsApi } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useIsMobile } from "@/hooks/useIsMobile";

const RUB = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;

const ECHART_BASE_TEXT = {
  fontFamily: "Inter, system-ui, sans-serif",
  color: "#807A72",
};

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
  groups.sort((a, b) => b.key.localeCompare(a.key));
  return groups;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DashboardPage() {
  const nav = useNavigate();
  const isMobile = useIsMobile();

  const dash = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => dashboardApi.fetch({ period: "month" }),
  });

  const upcoming = useQuery({
    queryKey: ["events", "list", "future"],
    queryFn: () => eventsApi.list(),
  });

  const today = useMemo(() => new Date(), []);
  const todayLabel = fmt.todayHeader(today);
  const data = dash.data;

  const dailyOption: EChartsOption | null = useMemo(() => {
    if (!data) return null;
    const dates = data.chart.daily_dates;
    if (dates.length === 0) return null;
    const xLabels = dates.map((d) => parseInt(d.slice(8, 10), 10).toString());

    return {
      grid: { top: 24, right: 16, bottom: 64, left: 56 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#FFFFFF",
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
          const idx = items[0].dataIndex;
          const dateLabel = format(
            parse(dates[idx], "yyyy-MM-dd", new Date()),
            "d MMMM",
            { locale: ru },
          );
          const total = items.reduce((s, it) => s + (it.value || 0), 0);
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
        bottom: 4,
        left: "center",
        textStyle: { ...ECHART_BASE_TEXT, fontSize: 11 },
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
        splitLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: {
          ...ECHART_BASE_TEXT,
          fontSize: 10.5,
          formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)),
        },
      },
      series: data.chart.daily_series.map((s) => ({
        name: s.name,
        type: "bar" as const,
        stack: "total",
        data: s.values,
        itemStyle: { color: s.color, borderRadius: [3, 3, 0, 0] },
        emphasis: { focus: "series" as const },
        barMaxWidth: 24,
      })),
    };
  }, [data]);

  const pieOption: EChartsOption | null = useMemo(() => {
    if (!data || data.by_category.length === 0) return null;
    return {
      tooltip: {
        trigger: "item",
        backgroundColor: "#FFFFFF",
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
        bottom: 4,
        left: "center",
        textStyle: { ...ECHART_BASE_TEXT, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 12,
        icon: "roundRect",
      },
      series: [
        {
          name: "По категориям",
          type: "pie" as const,
          radius: isMobile ? ["44%", "60%"] : ["46%", "62%"],
          center: ["50%", "42%"],
          padAngle: 3,
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "#FFFFFF", borderWidth: 2 },
          label: {
            show: true,
            position: "outer",
            alignTo: "edge",
            edgeDistance: 10,
            color: "#2A2A2E",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 14,
            formatter: (p: unknown) => {
              const it = p as { value: number; percent: number };
              const v = it.value;
              const compact = v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v));
              return `${compact} ₽\n${it.percent.toFixed(0)}%`;
            },
          },
          labelLine: { show: true, length: 14, length2: 16, smooth: true, lineStyle: { color: "#DFDCD3" } },
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
    const labels = data.chart.monthly_labels.map((m) =>
      format(parse(m, "yyyy-MM", new Date()), "LLL", { locale: ru }),
    );
    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
    return {
      grid: { top: 32, right: 16, bottom: 28, left: 56 },
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
        splitLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: {
          ...ECHART_BASE_TEXT,
          fontSize: 10.5,
          formatter: (v: number) => fmtCompact(v),
        },
      },
      series: [
        {
          type: "bar" as const,
          data: data.chart.monthly_values,
          itemStyle: { color: "oklch(0.62 0.13 145)", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 28,
          label: {
            show: true,
            position: "top",
            color: "#807A72",
            fontSize: 10,
            fontWeight: 600,
            formatter: (p: unknown) => {
              const v = (p as { value: number }).value;
              return v > 0 ? fmtCompact(v) : "";
            },
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
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Дашборд</h1>
          <div className="muted" style={{ textTransform: "lowercase" }}>{todayLabel}</div>
        </div>
        <div className="page-head-actions">
          <Button icon={<Plus size={16} />} onClick={() => nav("/events/new")}>
            Новое событие
          </Button>
        </div>
      </div>

      {data && (
        <>
          {/* Row 1: upcoming (3-day window) */}
          <div className="section">
            <div className="section-head">
              <div className="card-title">Ближайшие события</div>
              <Link className="link small" to="/events">Все →</Link>
            </div>
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
                    </div>
                    {g.events.length >= 2 && (
                      <div className="day-group-net mono">{fmt.money(g.net)} ₽</div>
                    )}
                  </div>
                  <Card padding="p-0">
                    <div className="event-table">
                      {g.events.map((e) => (
                        <EventTableRow
                          key={e.id}
                          ev={e}
                          showDate={false}
                          onClick={() => nav(`/events/${e.id}/edit`)}
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

          {/* Row 2: daily + pie */}
          <div className="grid grid-2 gap-md">
            <Card>
              <div className="card-head">
                <div>
                  <div className="card-title">Доход по дням</div>
                  <div className="muted small" style={{ textTransform: "capitalize" }}>{monthLabel}</div>
                </div>
                <div className="muted small">{fmt.money(data.total_cost)} ₽</div>
              </div>
              {dailyOption ? (
                <Echart option={dailyOption} height={280} />
              ) : (
                <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
              )}
            </Card>

            <Card>
              <div className="card-head">
                <div>
                  <div className="card-title">Доход по категориям</div>
                  <div className="muted small" style={{ textTransform: "capitalize" }}>{monthLabel}</div>
                </div>
              </div>
              {pieOption ? (
                <Echart option={pieOption} height={320} />
              ) : (
                <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
              )}
            </Card>
          </div>

          {/* Row 3: monthly */}
          <Card>
            <div className="card-head">
              <div>
                <div className="card-title">Доход по месяцам</div>
                <div className="muted small">{new Date().getFullYear()}</div>
              </div>
              <div className="muted small">
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
    </div>
  );
}
