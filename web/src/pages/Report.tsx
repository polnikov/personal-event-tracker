import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Card,
  Empty,
  EventLineRow,
  Select,
  buildEventLineIconMaps,
} from "@/components/design";
import {
  Echart,
  ECHART_BASE_TEXT,
  GRID_LEFT_FLUSH,
  type EChartsOption,
} from "@/components/echart";
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

export function ReportPage() {
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [categoryId, setCategoryId] = useState<string>("");

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });
  const icons = useMemo(() => buildEventLineIconMaps(cats.data), [cats.data]);

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

  // Pie data with assigned colors
  const subcatColored = useMemo(() => {
    if (!data.data) return [];
    return data.data.by_subcategory.map((s, i) => ({
      ...s,
      color: SUBCAT_PALETTE[i % SUBCAT_PALETTE.length],
    }));
  }, [data.data]);

  const hoursPie: EChartsOption | null = useMemo(() => {
    if (subcatColored.length === 0 || subcatColored.every((s) => s.hours === 0)) return null;
    return {
      tooltip: {
        trigger: "item",
        backgroundColor: "#FFFFFF",
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (p: unknown) => {
          const it = p as { name: string; value: number; percent: number; color: string };
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${it.color}"></span><span style="font-weight:500">${it.name}</span></div><div style="margin-top:4px;font-size:12px;font-feature-settings:'tnum'">${it.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч · ${it.percent.toFixed(1)}%</div>`;
        },
      },
      legend: {
        orient: "horizontal",
        bottom: 4,
        left: "center",
        textStyle: { ...ECHART_BASE_TEXT, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        icon: "circle",
      },
      series: [
        {
          name: "Часы",
          type: "pie" as const,
          radius: isMobile ? ["30%", "46%"] : ["38%", "60%"],
          center: ["50%", "50%"],
          padAngle: 2,
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "#FFFFFF", borderWidth: 2 },
          label: {
            show: true,
            position: "outer",
            color: "#2A2A2E",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontFeatureSettings: "'tnum'",
            fontSize: isMobile ? 9 : 10.5,
            fontWeight: 600,
            lineHeight: 13,
            backgroundColor: "#FFFFFF",
            borderColor: "#ECEAE3",
            borderWidth: 1,
            borderRadius: 6,
            padding: [2, 6, 2, 6],
            formatter: (p: unknown) => {
              const it = p as { value: number; percent: number };
              const hours = it.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
              return `${hours} ч | ${it.percent.toFixed(0)}%`;
            },
          },
          labelLine: {
            show: true,
            length: isMobile ? 4 : 10,
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
          data: subcatColored.map((s) => ({
            name: s.name,
            value: Number(s.hours.toFixed(2)),
            itemStyle: { color: s.color },
          })),
        },
      ],
    };
  }, [subcatColored, isMobile]);

  const netPie: EChartsOption | null = useMemo(() => {
    if (subcatColored.length === 0 || subcatColored.every((s) => s.net === 0)) return null;
    return {
      tooltip: {
        trigger: "item",
        backgroundColor: "#FFFFFF",
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (p: unknown) => {
          const it = p as { name: string; value: number; percent: number; color: string };
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${it.color}"></span><span style="font-weight:500">${it.name}</span></div><div style="margin-top:4px;font-size:12px;font-feature-settings:'tnum'">${RUB(it.value)} · ${it.percent.toFixed(1)}%</div>`;
        },
      },
      legend: {
        orient: "horizontal",
        bottom: 4,
        left: "center",
        textStyle: { ...ECHART_BASE_TEXT, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        icon: "circle",
      },
      series: [
        {
          name: "Чистый доход",
          type: "pie" as const,
          radius: isMobile ? ["30%", "46%"] : ["38%", "60%"],
          center: ["50%", "50%"],
          padAngle: 2,
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: "#FFFFFF", borderWidth: 2 },
          label: {
            show: true,
            position: "outer",
            color: "#2A2A2E",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontFeatureSettings: "'tnum'",
            fontSize: isMobile ? 9 : 10.5,
            fontWeight: 600,
            lineHeight: 13,
            backgroundColor: "#FFFFFF",
            borderColor: "#ECEAE3",
            borderWidth: 1,
            borderRadius: 6,
            padding: [2, 6, 2, 6],
            formatter: (p: unknown) => {
              const it = p as { value: number; percent: number };
              const v = it.value;
              const compact = v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
              return `${compact} ₽ | ${it.percent.toFixed(0)}%`;
            },
          },
          labelLine: {
            show: true,
            length: isMobile ? 4 : 10,
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
          data: subcatColored.map((s) => ({
            name: s.name,
            value: Math.round(s.net),
            itemStyle: { color: s.color },
          })),
        },
      ],
    };
  }, [subcatColored, isMobile]);

  const monthlyOption: EChartsOption | null = useMemo(() => {
    if (!data.data) return null;
    const labels = Array.from({ length: 12 }, (_, i) =>
      format(parse(String(i + 1), "M", new Date()), "LLL", { locale: ru }),
    );
    const netSeries = data.data.monthly.map((m) => Math.round(m.net));
    const taxSeries = data.data.monthly.map((m) => Math.round(m.tax_amount));
    const totalSeries = netSeries.map((n, i) => n + taxSeries[i]);

    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);

    return {
      grid: { top: 32, right: 16, bottom: 28, left: GRID_LEFT_FLUSH },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#FFFFFF",
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (params: unknown) => {
          const items = params as Array<{ dataIndex: number }>;
          if (!items.length) return "";
          const idx = items[0].dataIndex;
          const monthDate = parse(String(idx + 1), "M", new Date());
          const label = format(monthDate, "LLLL yyyy", { locale: ru }).replace(
            /yyyy/, String(year),
          );
          const net = netSeries[idx];
          const tax = taxSeries[idx];
          const total = net + tax;
          return (
            `<div style="font-weight:600;font-size:13px;text-transform:capitalize">${label}</div>` +
            `<div style="display:flex;justify-content:space-between;gap:14px;font-size:12px;margin-top:4px"><span>Чистыми</span><span style="font-weight:500;font-feature-settings:'tnum'">${RUB(net)}</span></div>` +
            `<div style="display:flex;justify-content:space-between;gap:14px;font-size:12px;margin-top:2px"><span>Налог</span><span style="font-weight:500;font-feature-settings:'tnum'">${RUB(tax)}</span></div>` +
            `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ECEAE3;display:flex;justify-content:space-between;font-size:12px"><span>Итого</span><span style="font-weight:600;font-feature-settings:'tnum'">${RUB(total)}</span></div>`
          );
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: { ...ECHART_BASE_TEXT, fontSize: 11 },
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
            fontSize: isMobile ? 9 : 10,
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
  }, [data.data, year, isMobile]);

  const heatmapOption: EChartsOption | null = useMemo(() => {
    const matrix = data.data?.weekday_month;
    if (!matrix || matrix.length !== 7) return null;
    const monthLabels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
    const dowLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    // ECharts heatmap data: [x_index, y_index, value]. Y-axis is inverted by
    // default (bottom→top), so we feed reversed weekday indices so Mon
    // appears at the top and Sun at the bottom of the chart.
    const cells: [number, number, number][] = [];
    let maxCount = 0;
    for (let w = 0; w < 7; w++) {
      for (let m = 0; m < 12; m++) {
        const c = matrix[w][m] || 0;
        cells.push([m, 6 - w, c]);
        if (c > maxCount) maxCount = c;
      }
    }
    return {
      grid: { top: 16, right: 16, bottom: 28, left: 26 },
      tooltip: {
        position: "top",
        backgroundColor: "#FFFFFF",
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (p: unknown) => {
          const it = p as { value: [number, number, number] };
          const [m, wRev, c] = it.value;
          const w = 6 - wRev;
          return `<div style="font-size:12px"><span style="font-weight:600">${dowLabels[w]} · ${monthLabels[m]}</span><br/><span class="mono">${c} событий</span></div>`;
        },
      },
      visualMap: {
        show: false,
        type: "continuous",
        min: 0,
        max: Math.max(maxCount, 1),
        calculable: false,
        inRange: {
          color: ["rgba(123, 182, 97, 0.04)", "rgb(123, 182, 97)"],
        },
      },
      xAxis: {
        type: "category",
        data: monthLabels,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: { ...ECHART_BASE_TEXT, fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: [...dowLabels].reverse(),  // reversed: Mon at top
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
          itemStyle: {
            borderColor: "#FFFFFF",
            borderWidth: 2,
            borderRadius: 4,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 8,
              shadowColor: "rgba(42, 42, 46, 0.15)",
            },
          },
        },
      ],
    };
  }, [data.data?.weekday_month]);

  const royaltyEvents = data.data?.events_with_royalty ?? [];
  const royaltyGroups = useMemo(() => groupRoyaltyByDay(royaltyEvents), [royaltyEvents]);

  const hoursTotal = useMemo(
    () => subcatColored.reduce((s, x) => s + (x.hours || 0), 0),
    [subcatColored],
  );
  const netTotal = useMemo(
    () => subcatColored.reduce((s, x) => s + (x.net || 0), 0),
    [subcatColored],
  );

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
        <div>
          <h1 className="h1">Отчёт</h1>
          <div className="muted" style={{ textTransform: "capitalize" }}>
            {periodLabel}
          </div>
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
        <Card className="chart-card">
          <div className="card-head">
            <div>
              <div className="card-title">Часы по подкатегориям</div>
              <div className="muted small">{periodLabel}</div>
            </div>
            {hoursPie && (
              <div className="card-head-sum">
                {hoursTotal.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч
              </div>
            )}
          </div>
          {hoursPie ? (
            <Echart option={hoursPie} height={380} />
          ) : (
            <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
          )}
        </Card>

        <Card className="chart-card">
          <div className="card-head">
            <div>
              <div className="card-title">Чистый доход по подкатегориям</div>
              <div className="muted small">{periodLabel}</div>
            </div>
            {netPie && (
              <div className="card-head-sum">{fmt.money(netTotal)} ₽</div>
            )}
          </div>
          {netPie ? (
            <Echart option={netPie} height={380} />
          ) : (
            <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
          )}
        </Card>
      </div>

      <Card className="chart-card">
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

      {!isMobile && heatmapOption && (
        <Card className="chart-card">
          <div className="card-head">
            <div>
              <div className="card-title">События по дням недели</div>
              <div className="muted small">{year}</div>
            </div>
          </div>
          <Echart option={heatmapOption} height={290} />
        </Card>
      )}

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
                    <EventLineRow
                      key={e.id}
                      ev={e}
                      icons={icons}
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
