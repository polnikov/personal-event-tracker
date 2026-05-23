import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Card,
  Empty,
  EventTableRow,
  Select,
} from "@/components/design";
import { Echart, GRID_LEFT_FLUSH, type EChartsOption } from "@/components/echart";
import { categories as categoriesApi, reports as reportsApi } from "@/lib/api";
import { fmt } from "@/lib/format";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { EventItem } from "@/types/api";

const RUB = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;

function royaltyOfEvent(e: EventItem): number {
  const gross = parseFloat(e.total_cost) || 0;
  return (gross * (parseFloat(e.royalty) || 0)) / 100;
}

interface RoyaltyDayGroup {
  key: string;
  date: Date;
  events: EventItem[];
  royalty: number;
}

function groupRoyaltyByDay(events: EventItem[]): RoyaltyDayGroup[] {
  const map = new Map<string, EventItem[]>();
  for (const e of events) {
    const k = e.start_at.slice(0, 10);
    const list = map.get(k) ?? [];
    list.push(e);
    map.set(k, list);
  }
  const groups: RoyaltyDayGroup[] = [];
  for (const [k, evs] of map.entries()) {
    evs.sort((a, b) => b.start_at.localeCompare(a.start_at));
    groups.push({
      key: k,
      date: parseISO(`${k}T00:00:00`),
      events: evs,
      royalty: evs.reduce((s, e) => s + royaltyOfEvent(e), 0),
    });
  }
  groups.sort((a, b) => b.key.localeCompare(a.key));
  return groups;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SUBCAT_PALETTE = [
  "#7BB661", "#D9A86C", "#6E8FB8", "#C26B6B", "#A855F7",
  "#EC4899", "#0EA5E9", "#F1416C", "#FACA15", "#5E6278",
  "#00BFA5", "#7239EA",
];

const MONTH_ABBR = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

const ECHART_BASE_TEXT = {
  fontFamily: "Inter, system-ui, sans-serif",
  color: "#807A72",
};

export function ReportPage() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [categoryId, setCategoryId] = useState<string>("");

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });

  const yearsQuery = useQuery({
    queryKey: ["report", "years"],
    queryFn: () => reportsApi.years(),
    staleTime: 60_000,
  });

  const data = useQuery({
    queryKey: ["report", { year, month, categoryId }],
    queryFn: () =>
      reportsApi.fetch({
        year,
        month,
        category_id: categoryId ? Number(categoryId) : undefined,
      }),
  });

  const yearOptions = useMemo(() => {
    const now = today.getFullYear();
    const set = new Set<number>(yearsQuery.data?.years ?? []);
    set.add(now); // current year always present
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [today, yearsQuery.data]);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const d = parse(String(i + 1), "M", new Date());
        return { value: String(i + 1), label: format(d, "LLLL", { locale: ru }) };
      }),
    [],
  );

  const periodLabel = useMemo(() => {
    const d = new Date(year, month - 1, 1);
    return format(d, "LLLL yyyy", { locale: ru });
  }, [year, month]);

  // Per-subcategory color assignment shared across charts.
  const subcatColored = useMemo(() => {
    if (!data.data) return [];
    return data.data.by_subcategory.map((s, i) => ({
      ...s,
      color: SUBCAT_PALETTE[i % SUBCAT_PALETTE.length],
    }));
  }, [data.data]);

  const hoursBar: EChartsOption | null = useMemo(() => {
    const items = subcatColored.filter((s) => s.hours > 0);
    if (items.length === 0) return null;
    const sorted = [...items].sort((a, b) => b.hours - a.hours);
    const total = sorted.reduce((s, x) => s + x.hours, 0);
    return {
      grid: { top: 8, right: 110, bottom: 0, left: 4, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(255, 255, 255, 0.6)",
        extraCssText: 'backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
        borderRadius: 16,
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (p: unknown) => {
          const it = p as { name: string; value: number; color: string };
          const pct = total > 0 ? (it.value / total) * 100 : 0;
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${it.color}"></span><span style="font-weight:500">${it.name}</span></div><div style="margin-top:4px;font-size:12px;font-feature-settings:'tnum'">${it.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч · ${pct.toFixed(1)}%</div>`;
        },
      },
      xAxis: { type: "value", show: false, splitLine: { show: false } },
      yAxis: {
        type: "category",
        data: sorted.map((s) => s.name),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...ECHART_BASE_TEXT, fontSize: 12 },
      },
      series: [
        {
          name: "Часы",
          type: "bar" as const,
          barMaxWidth: 18,
          itemStyle: { borderRadius: 4 },
          label: {
            show: true,
            position: "right",
            distance: 8,
            align: "left",
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
            padding: isMobile ? [3, 5, 3, 5] : [4, 6, 4, 6],
            shadowColor: "rgba(0, 0, 0, 0.12)",
            shadowBlur: 6,
            shadowOffsetY: 2,
            formatter: (p: unknown) => {
              const it = p as { value: number };
              const hours = it.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
              const pct = total > 0 ? (it.value / total) * 100 : 0;
              return `${hours} ч · ${pct.toFixed(0)}%`;
            },
          },
          data: sorted.map((s) => ({
            value: Number(s.hours.toFixed(2)),
            itemStyle: { color: s.color },
          })),
        },
      ],
    };
  }, [subcatColored, isMobile]);

  const netBar: EChartsOption | null = useMemo(() => {
    const items = subcatColored.filter((s) => s.net > 0);
    if (items.length === 0) return null;
    const sorted = [...items].sort((a, b) => b.net - a.net);
    const total = sorted.reduce((s, x) => s + x.net, 0);
    return {
      grid: { top: 8, right: 110, bottom: 0, left: 4, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(255, 255, 255, 0.6)",
        extraCssText: 'backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
        borderRadius: 16,
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (p: unknown) => {
          const it = p as { name: string; value: number; color: string };
          const pct = total > 0 ? (it.value / total) * 100 : 0;
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${it.color}"></span><span style="font-weight:500">${it.name}</span></div><div style="margin-top:4px;font-size:12px;font-feature-settings:'tnum'">${RUB(it.value)} · ${pct.toFixed(1)}%</div>`;
        },
      },
      xAxis: { type: "value", show: false, splitLine: { show: false } },
      yAxis: {
        type: "category",
        data: sorted.map((s) => s.name),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { ...ECHART_BASE_TEXT, fontSize: 12 },
      },
      series: [
        {
          name: "Чистый доход",
          type: "bar" as const,
          barMaxWidth: 18,
          itemStyle: { borderRadius: 4 },
          label: {
            show: true,
            position: "right",
            distance: 8,
            align: "left",
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
            padding: isMobile ? [3, 5, 3, 5] : [4, 6, 4, 6],
            shadowColor: "rgba(0, 0, 0, 0.12)",
            shadowBlur: 6,
            shadowOffsetY: 2,
            formatter: (p: unknown) => {
              const it = p as { value: number };
              const v = it.value;
              const compact = v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
              const pct = total > 0 ? (v / total) * 100 : 0;
              return `${compact} ₽ · ${pct.toFixed(0)}%`;
            },
          },
          data: sorted.map((s) => ({
            value: Math.round(s.net),
            itemStyle: { color: s.color },
          })),
        },
      ],
    };
  }, [subcatColored, isMobile]);

  const monthlyOption: EChartsOption | null = useMemo(() => {
    if (!data.data) return null;
    const labels = MONTH_ABBR;
    const netSeries = data.data.monthly.map((m) => Math.round(m.net));
    const taxSeries = data.data.monthly.map((m) => Math.round(m.tax_amount));
    const totalSeries = netSeries.map((n, i) => n + taxSeries[i]);

    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);

    const netColor = "oklch(0.62 0.13 145)";
    const taxColor = "oklch(0.78 0.10 145)";

    return {
      grid: { top: 72, right: 16, bottom: 28, left: GRID_LEFT_FLUSH },
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
          const items = params as Array<{ dataIndex: number }>;
          if (!items.length) return "";
          const idx = items[0].dataIndex;
          const net = netSeries[idx];
          const tax = taxSeries[idx];
          const total = net + tax;
          if (total === 0) return "";
          const monthDate = parse(String(idx + 1), "M", new Date());
          const label = format(monthDate, "LLLL yyyy", { locale: ru }).replace(
            /yyyy/, String(year),
          );
          return (
            `<div style="font-weight:600;font-size:13px;text-transform:capitalize">${label}</div>` +
            `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${netColor}"></span><span style="flex:1">Чистыми</span><span style="font-weight:500;font-feature-settings:'tnum'">${RUB(net)}</span></div>` +
            `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${taxColor}"></span><span style="flex:1">Налог</span><span style="font-weight:500;font-feature-settings:'tnum'">${RUB(tax)}</span></div>` +
            `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ECEAE3;display:flex;justify-content:space-between;font-size:12px"><span>Итого</span><span style="font-weight:600;font-feature-settings:'tnum'">${RUB(total)}</span></div>`
          );
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
          // Per-point label.show=false on zero months so an empty pill
          // doesn't sit on the baseline.
          data: totalSeries.map((v) =>
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
            position: "top" as const,
            distance: 12,
            align: "center" as const,
            verticalAlign: "middle" as const,
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
        {
          name: "Налог",
          type: "line" as const,
          smooth: 0.2,
          data: taxSeries,
          symbol: "circle",
          symbolSize: 5,
          itemStyle: { color: "#DC2626" },
          lineStyle: { color: "#DC2626", width: 1.5 },
          label: { show: false },
        },
      ],
    };
  }, [data.data, year, isMobile]);

  const hoursRowCount = subcatColored.filter((s) => s.hours > 0).length;
  const netRowCount = subcatColored.filter((s) => s.net > 0).length;
  const barChartHeight = (rows: number) => Math.max(160, rows * 34 + 16);

  const royaltyEvents = data.data?.events_with_royalty ?? [];
  const royaltyGroups = useMemo(() => groupRoyaltyByDay(royaltyEvents), [royaltyEvents]);
  const yearTotal = useMemo(
    () =>
      (data.data?.monthly ?? []).reduce(
        (acc, m) => ({
          net: acc.net + m.net,
          tax: acc.tax + m.tax_amount,
        }),
        { net: 0, tax: 0 },
      ),
    [data.data],
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Отчёт</h1>
        <div className="muted" style={{ textTransform: "capitalize", marginBottom: 8 }}>
          {periodLabel}
        </div>
      </div>

      <Card padding="p-4">
        <div className="filter-row">
          <Select
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={yearOptions}
          />
          <Select
            value={String(month)}
            onChange={(v) => setMonth(Number(v))}
            options={monthOptions}
          />
          <Select
            value={categoryId || "all"}
            onChange={(v) => setCategoryId(v === "all" ? "" : v)}
            options={[
              { value: "all", label: "Все категории" },
              ...((cats.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))),
            ]}
          />
        </div>
      </Card>

      <div className="grid grid-2 gap-md">
        <Card>
          <div className="card-head" style={{ alignItems: "baseline" }}>
            <div className="card-title">Часы по подкатегориям</div>
            <div className="muted small" style={{ textTransform: "capitalize" }}>{periodLabel}</div>
          </div>
          {hoursBar ? (
            <Echart option={hoursBar} height={barChartHeight(hoursRowCount)} />
          ) : (
            <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
          )}
        </Card>

        <Card>
          <div className="card-head" style={{ alignItems: "baseline" }}>
            <div className="card-title">Чистый доход по подкатегориям</div>
            <div className="muted small" style={{ textTransform: "capitalize" }}>{periodLabel}</div>
          </div>
          {netBar ? (
            <Echart option={netBar} height={barChartHeight(netRowCount)} />
          ) : (
            <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
          )}
        </Card>
      </div>

      <Card>
        <div className="report-monthly-head">
          <div className="report-monthly-meta-row">
            <div className="card-title">Доход по месяцам</div>
            <span className="muted small">
              <span style={{ marginRight: 4 }}>чистыми</span>
              <span className="mono">{fmt.money(yearTotal.net)} ₽</span>
            </span>
          </div>
          <div className="report-monthly-meta-row">
            <span className="muted small">{year}</span>
            <span className="muted small">
              <span style={{ marginRight: 4 }}>налог</span>
              <span className="mono">{fmt.money(yearTotal.tax)} ₽</span>
            </span>
          </div>
        </div>
        {monthlyOption && (yearTotal.net > 0 || yearTotal.tax > 0) ? (
          <Echart option={monthlyOption} height={300} />
        ) : (
          <div className="muted small" style={{ marginTop: 16 }}>Нет данных за {year}</div>
        )}
      </Card>

      <div className="section">
        <div className="section-head">
          <div className="section-title">События с роялти</div>
          <div className="section-meta muted small">{royaltyEvents.length}</div>
        </div>
        {royaltyGroups.length > 0 ? (
          royaltyGroups.map((g) => (
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
                  <div className="day-group-net mono">{fmt.money(g.royalty)} ₽</div>
                )}
              </div>
              <Card padding="p-0">
                <div className="event-table">
                  {g.events.map((e) => (
                    <EventTableRow
                      key={e.id}
                      ev={e}
                      showDate={false}
                      costOverride={royaltyOfEvent(e)}
                      onClick={() => nav(`/events/${e.id}/edit`)}
                      onClient={(id) => nav(`/clients/${id}`)}
                    />
                  ))}
                </div>
              </Card>
            </div>
          ))
        ) : (
          <Card>
            <Empty
              title="Событий с роялти нет"
              hint="Включите роялти при создании события — они появятся здесь"
            />
          </Card>
        )}
      </div>
    </div>
  );
}
