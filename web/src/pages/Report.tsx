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
import { Echart, type EChartsOption } from "@/components/echart";
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
      legend: isMobile
        ? {
            orient: "horizontal",
            bottom: 4,
            left: "center",
            textStyle: { ...ECHART_BASE_TEXT, fontSize: 11 },
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 12,
            icon: "roundRect",
          }
        : {
            orient: "vertical",
            right: 8,
            top: "center",
            textStyle: { ...ECHART_BASE_TEXT, fontSize: 12 },
            itemWidth: 10,
            itemHeight: 10,
            icon: "roundRect",
          },
      series: [
        {
          name: "Часы",
          type: "pie" as const,
          radius: isMobile ? ["44%", "66%"] : ["52%", "78%"],
          center: isMobile ? ["50%", "40%"] : ["32%", "50%"],
          padAngle: 3,
          itemStyle: { borderRadius: 6, borderColor: "#FFFFFF", borderWidth: 2 },
          label: {
            show: true,
            position: "outside",
            color: "#2A2A2E",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 14,
            formatter: (p: unknown) => {
              const it = p as { value: number; percent: number };
              if (it.percent < 3) return "";
              const hours = it.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
              return `${hours} ч\n${it.percent.toFixed(0)}%`;
            },
          },
          labelLine: { show: true, length: 6, length2: 4, smooth: true, lineStyle: { color: "#DFDCD3" } },
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
      legend: isMobile
        ? {
            orient: "horizontal",
            bottom: 4,
            left: "center",
            textStyle: { ...ECHART_BASE_TEXT, fontSize: 11 },
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 12,
            icon: "roundRect",
          }
        : {
            orient: "vertical",
            right: 8,
            top: "center",
            textStyle: { ...ECHART_BASE_TEXT, fontSize: 12 },
            itemWidth: 10,
            itemHeight: 10,
            icon: "roundRect",
          },
      series: [
        {
          name: "Чистый доход",
          type: "pie" as const,
          radius: isMobile ? ["44%", "66%"] : ["52%", "78%"],
          center: isMobile ? ["50%", "40%"] : ["32%", "50%"],
          padAngle: 3,
          itemStyle: { borderRadius: 6, borderColor: "#FFFFFF", borderWidth: 2 },
          label: {
            show: true,
            position: "outside",
            color: "#2A2A2E",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 14,
            formatter: (p: unknown) => {
              const it = p as { value: number; percent: number };
              if (it.percent < 3) return "";
              const v = it.value;
              const compact = v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
              return `${compact} ₽\n${it.percent.toFixed(0)}%`;
            },
          },
          labelLine: { show: true, length: 6, length2: 4, smooth: true, lineStyle: { color: "#DFDCD3" } },
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

    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);

    return {
      grid: { top: 28, right: 16, bottom: 56, left: 56 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "#FFFFFF",
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string;
            value: number;
            color: string;
            dataIndex: number;
          }>;
          if (!items.length) return "";
          const idx = items[0].dataIndex;
          const monthDate = parse(String(idx + 1), "M", new Date());
          const label = format(monthDate, "LLLL yyyy", { locale: ru });
          const total = items.reduce((s, it) => s + (it.value || 0), 0);
          const rows = items
            .map(
              (it) =>
                `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${it.color}"></span><span style="flex:1">${it.seriesName}</span><span style="font-weight:500;font-feature-settings:'tnum'">${RUB(it.value)}</span></div>`,
            )
            .join("");
          return `<div style="font-weight:600;font-size:13px;text-transform:capitalize">${label.replace(/yyyy/, String(year))}</div>${rows}<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ECEAE3;display:flex;justify-content:space-between;font-size:12px"><span>Итого</span><span style="font-weight:600;font-feature-settings:'tnum'">${RUB(total)}</span></div>`;
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
          name: "Чистыми",
          type: "bar" as const,
          stack: "total",
          data: netSeries,
          itemStyle: { color: "oklch(0.62 0.13 145)", borderRadius: [0, 0, 0, 0] },
          barMaxWidth: 28,
          label: isMobile
            ? { show: false }
            : {
                show: true,
                position: "insideTop",
                color: "#FFFFFF",
                fontSize: 10,
                fontWeight: 600,
                formatter: (p: unknown) => {
                  const v = (p as { value: number }).value;
                  return v > 0 ? fmtCompact(v) : "";
                },
              },
        },
        {
          name: "Налог",
          type: "bar" as const,
          stack: "total",
          data: taxSeries,
          itemStyle: { color: "oklch(0.78 0.10 145)", borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 28,
          label: {
            show: true,
            position: "top",
            color: "#2A2A2E",
            fontSize: isMobile ? 9 : 10,
            fontWeight: 600,
            formatter: (p: unknown) => {
              const item = p as { value: number; dataIndex: number };
              const total = netSeries[item.dataIndex] + taxSeries[item.dataIndex];
              return total > 0 ? fmtCompact(total) : "";
            },
          },
        },
      ],
    };
  }, [data.data, year, isMobile]);

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
        <Card>
          <div className="card-head">
            <div>
              <div className="card-title">Часы по подкатегориям</div>
              <div className="muted small">{periodLabel}</div>
            </div>
          </div>
          {hoursPie ? (
            <Echart option={hoursPie} height={280} />
          ) : (
            <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
          )}
        </Card>

        <Card>
          <div className="card-head">
            <div>
              <div className="card-title">Чистый доход по подкатегориям</div>
              <div className="muted small">{periodLabel}</div>
            </div>
          </div>
          {netPie ? (
            <Echart option={netPie} height={280} />
          ) : (
            <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
          )}
        </Card>
      </div>

      <Card>
        <div className="report-monthly-head">
          <div className="card-title">Доход по месяцам</div>
          <div className="report-monthly-meta-row">
            <span className="muted small">{year}</span>
            <span className="muted small">
              <span style={{ marginRight: 4 }}>чистыми</span>
              <span className="mono">{fmt.money(yearTotal.net)} ₽</span>
            </span>
          </div>
          <div className="report-monthly-meta-row">
            <span />
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
