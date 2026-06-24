import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronDown, FilterX } from "lucide-react";
import {
  Card,
  Select,
} from "@/components/design";
import { Echart, PRESSED_LABEL_BOX, pressedFill, type EChartsOption } from "@/components/echart";
import { PctChangePill } from "@/components/PctChangePill";
import { categories as categoriesApi, reports as reportsApi } from "@/lib/api";
import { fmt } from "@/lib/format";
import { MONTH_ABBR, weekdayHourHeatmap, weekdayMonthHeatmap } from "@/lib/heatmap";
import { useIsMobile } from "@/hooks/useIsMobile";

const RUB = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;

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
  const isMobile = useIsMobile();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [categoryId, setCategoryId] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Кнопка «Очистить» активна, если выбрана категория ИЛИ месяц/год не текущие.
  // Сброс возвращает год, месяц и категорию к значениям по умолчанию.
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const activeFilterCount =
    (categoryId ? 1 : 0) +
    (year !== todayYear ? 1 : 0) +
    (month !== todayMonth ? 1 : 0);
  const clearAllFilters = () => {
    setYear(todayYear);
    setMonth(todayMonth);
    setCategoryId("");
  };

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
        const name = format(d, "LLLL", { locale: ru });
        return {
          value: String(i + 1),
          label: name.charAt(0).toUpperCase() + name.slice(1),
        };
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
          const it = p as { name: string; value: number; dataIndex: number };
          const dot = sorted[it.dataIndex]?.color ?? "#807A72";
          const pct = total > 0 ? (it.value / total) * 100 : 0;
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${dot}"></span><span style="font-weight:500">${it.name}</span></div><div style="margin-top:4px;font-size:12px;font-feature-settings:'ss01'">${it.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч · ${pct.toFixed(1)}%</div>`;
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
          itemStyle: { borderRadius: 8 },
          label: {
            show: true,
            position: "right",
            distance: 8,
            align: "left",
            verticalAlign: "middle",
            color: "#2A2A2E",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontFeatureSettings: "'ss01'",
            fontSize: isMobile ? 11 : 12,
            lineHeight: isMobile ? 11 : 12,
            fontWeight: 400,
            formatter: (p: unknown) => {
              const it = p as { value: number };
              const hours = it.value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
              const pct = total > 0 ? (it.value / total) * 100 : 0;
              return `${hours} ч · ${pct.toFixed(0)}%`;
            },
          },
          data: sorted.map((s) => ({
            value: Number(s.hours.toFixed(2)),
            itemStyle: { color: pressedFill(s.color) },
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
        borderColor: "#ECEAE3",
        borderWidth: 1,
        textStyle: { color: "#2A2A2E", fontFamily: "Inter, system-ui" },
        formatter: (p: unknown) => {
          const it = p as { name: string; value: number; dataIndex: number };
          const dot = sorted[it.dataIndex]?.color ?? "#807A72";
          const pct = total > 0 ? (it.value / total) * 100 : 0;
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${dot}"></span><span style="font-weight:500">${it.name}</span></div><div style="margin-top:4px;font-size:12px;font-feature-settings:'ss01'">${RUB(it.value)} · ${pct.toFixed(1)}%</div>`;
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
          itemStyle: { borderRadius: 8 },
          label: {
            show: true,
            position: "right",
            distance: 8,
            align: "left",
            verticalAlign: "middle",
            color: "#2A2A2E",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontFeatureSettings: "'ss01'",
            fontSize: isMobile ? 11 : 12,
            lineHeight: isMobile ? 11 : 12,
            fontWeight: 400,
            formatter: (p: unknown) => {
              const it = p as { value: number };
              const v = it.value;
              const formattedValue = Math.round(v).toLocaleString('ru-RU');
              const pct = total > 0 ? (v / total) * 100 : 0;
              return `${formattedValue} ₽ · ${pct.toFixed(0)}%`;
            }
          },
          data: sorted.map((s) => ({
            value: Math.round(s.net),
            itemStyle: { color: pressedFill(s.color) },
          })),
        },
      ],
    };
  }, [subcatColored, isMobile]);

  const monthlyOption: EChartsOption | null = useMemo(() => {
    if (!data.data) return null;
    const labels = MONTH_ABBR;
    const fmtCompact = (v: number) =>
      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);

    const netSeries = data.data.monthly.map((m) => Math.round(m.net));
    const taxSeries = data.data.monthly.map((m) => Math.round(m.tax_amount));
    const totalSeries = netSeries.map((n, i) => n + taxSeries[i]);

    // Stacked bars: a net segment per category (category colours), plus a tax
    // segment on top, summing to the month's total. When a single category is
    // filtered, monthly_by_category already holds just that one.
    const cats = data.data.monthly_by_category ?? [];

    const netColor = "oklch(0.62 0.13 145)";
    // Match the tax segment's colour (#DC2626) so the tooltip swatch agrees.
    const taxColor = "#DC2626";

    // Per month, the topmost non-zero stacking segment (tax sits above the
    // categories) — only that one gets the rounded top so the stack reads as
    // one bar.
    const topIdx = Array.from({ length: 12 }, (_, m) => {
      let top = -1;
      cats.forEach((c, i) => {
        if (Math.round(c.net[m] || 0) > 0) top = i;
      });
      if (taxSeries[m] > 0) top = cats.length; // tax index = cats.length
      return top;
    });
    const roundedTop = [6, 6, 0, 0];
    const flat = [0, 0, 0, 0];

    const catSeries = cats.map((c, i) => ({
      name: c.name,
      type: "bar" as const,
      stack: "income",
      barMaxWidth: 28,
      data: c.net.map((v, m) => ({
        value: Math.round(v || 0),
        itemStyle: {
          color: pressedFill(c.color || "#807A72", true),
          borderRadius: i === topIdx[m] ? roundedTop : flat,
        },
      })),
      label: { show: false },
    }));
    const taxBar = {
      name: "Налог",
      type: "bar" as const,
      stack: "income",
      barMaxWidth: 28,
      data: taxSeries.map((v, m) => ({
        value: v,
        itemStyle: {
          color: pressedFill(taxColor, true),
          borderRadius: cats.length === topIdx[m] ? roundedTop : flat,
        },
      })),
      label: { show: false },
    };
    // Invisible cap carrying each month's total (net + tax) label.
    const totalCap = {
      type: "bar" as const,
      stack: "income",
      barMaxWidth: 28,
      silent: true,
      // Zero months carry no label so the pressed-in pill doesn't render empty.
      data: totalSeries.map((t) => (t > 0 ? 0 : { value: 0, label: { show: false } })),
      itemStyle: { color: "transparent" },
      label: {
        show: true,
        position: "top" as const,
        distance: 10,
        align: "center" as const,
        verticalAlign: "bottom" as const,
        color: "#2A2A2E",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontFeatureSettings: "'ss01'",
        fontSize: isMobile ? 11 : 12,
        lineHeight: isMobile ? 11 : 12,
        fontWeight: 550,
        ...PRESSED_LABEL_BOX,
        formatter: (p: unknown) => {
          const t = totalSeries[(p as { dataIndex: number }).dataIndex];
          return t > 0 ? fmtCompact(t) : "";
        },
      },
    };

    return {
      grid: { top: 25, right: 0, bottom: 5, left: 0, containLabel: true },
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
          const label = format(monthDate, "LLLL", { locale: ru });
          // Per-category breakdown (only in "Все категории" mode); the rows
          // sum to "Чистыми". A separator divides them from the totals.
          const catRows = cats
            .map((c) => ({
              name: c.name,
              color: c.color || "#807A72",
              val: Math.round(c.net[idx] || 0),
            }))
            .filter((c) => c.val)
            .sort((a, b) => b.val - a.val)
            .map(
              (c) =>
                `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c.color}"></span><span style="flex:1">${c.name}</span><span style="font-weight:500;font-feature-settings:'ss01'">${RUB(c.val)}</span></div>`,
            )
            .join("");
          const catBlock = catRows
            ? `${catRows}<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ECEAE3"></div>`
            : "";
          return (
            `<div style="font-weight:600;font-size:13px;text-transform:capitalize">${label} ${year}</div>` +
            catBlock +
            `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${netColor}"></span><span style="flex:1">Чистыми</span><span style="font-weight:500;font-feature-settings:'ss01'">${RUB(net)}</span></div>` +
            `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${taxColor}"></span><span style="flex:1">Налог</span><span style="font-weight:500;font-feature-settings:'ss01'">${RUB(tax)}</span></div>` +
            `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ECEAE3;display:flex;justify-content:space-between;font-size:12px"><span>Итого</span><span style="font-weight:600;font-feature-settings:'ss01'">${RUB(total)}</span></div>`
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
        axisLabel: { show: false },
      },
      series: [...catSeries, taxBar, totalCap],
    } as EChartsOption;
  }, [data.data, year, isMobile, categoryId]);

  // Hours by month — bars stacked by category, styled like the "Часы по
  // подкатегориям" bars (per-category colour + pressed-in gradient). Only the
  // topmost segment of each month is rounded; a transparent cap series carries
  // the month's total label above the stack.
  const hoursMonthly: EChartsOption | null = useMemo(() => {
    if (!data.data) return null;
    const monthsHours = data.data.monthly.map((m) =>
      Number((m.hours || 0).toFixed(2)),
    );
    if (monthsHours.reduce((s, v) => s + v, 0) <= 0) return null;
    const fmtHours = (v: number) =>
      v.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
    const cats = data.data.monthly_by_category ?? [];
    // Per month, the highest stacking index (topmost segment) that has hours —
    // only that one gets the rounded top so the whole stack reads as one bar.
    const topIdx = Array.from({ length: 12 }, (_, m) => {
      let top = -1;
      cats.forEach((c, i) => {
        if ((c.hours?.[m] || 0) > 0) top = i;
      });
      return top;
    });
    const catSeries = cats.map((c, i) => ({
      name: c.name,
      type: "bar" as const,
      stack: "hours",
      barMaxWidth: 28,
      data: c.hours.map((h, m) => ({
        value: Number((h || 0).toFixed(2)),
        itemStyle: {
          color: pressedFill(c.color || "#807A72", true),
          borderRadius: i === topIdx[m] ? [12, 12, 0, 0] : [0, 0, 0, 0],
        },
      })),
      label: { show: false },
    }));
    // Invisible cap carrying each month's total label above the stack.
    const totalCap = {
      name: "Часы",
      type: "bar" as const,
      stack: "hours",
      barMaxWidth: 28,
      silent: true,
      data: monthsHours.map(() => 0),
      itemStyle: { color: "transparent" },
      label: {
        show: true,
        position: "top" as const,
        distance: 6,
        color: "#2A2A2E",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        fontFeatureSettings: "'ss01'",
        fontSize: isMobile ? 10 : 11,
        formatter: (p: unknown) => {
          const t = monthsHours[(p as { dataIndex: number }).dataIndex];
          return t > 0 ? fmtHours(t) : "";
        },
      },
    };
    return {
      grid: { top: 25, right: 0, bottom: 5, left: 0, containLabel: true },
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
          const total = monthsHours[idx];
          if (!total) return "";
          const monthDate = parse(String(idx + 1), "M", new Date());
          const label = format(monthDate, "LLLL", { locale: ru });
          const catRows = cats
            .map((c) => ({
              name: c.name,
              color: c.color || "#807A72",
              val: c.hours?.[idx] || 0,
            }))
            .filter((c) => c.val > 0)
            .sort((a, b) => b.val - a.val)
            .map(
              (c) =>
                `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c.color}"></span><span style="flex:1">${c.name}</span><span style="font-weight:500;font-feature-settings:'ss01'">${fmtHours(c.val)} ч</span></div>`,
            )
            .join("");
          const catBlock = catRows
            ? `${catRows}<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ECEAE3"></div>`
            : "";
          return (
            `<div style="font-weight:600;font-size:13px;text-transform:capitalize">${label} ${year}</div>` +
            catBlock +
            `<div style="display:flex;justify-content:space-between;gap:16px;font-size:12px;margin-top:2px"><span>Итого</span><span style="font-weight:600;font-feature-settings:'ss01'">${fmtHours(total)} ч</span></div>`
          );
        },
      },
      xAxis: {
        type: "category",
        data: MONTH_ABBR,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: { ...ECHART_BASE_TEXT, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "#ECEAE3" } },
        axisLabel: { show: false },
      },
      series: [...catSeries, totalCap],
    } as EChartsOption;
  }, [data.data, year, isMobile]);

  const heatmapOption: EChartsOption | null = useMemo(
    () => weekdayMonthHeatmap(data.data?.weekday_month, isMobile),
    [data.data?.weekday_month, isMobile],
  );
  // Net income by weekday × month — same settings as the events heatmap,
  // rounded to whole rubles so the cell labels stay clean integers.
  const sumHeatmapOption: EChartsOption | null = useMemo(
    () =>
      weekdayMonthHeatmap(
        data.data?.weekday_month_net?.map((row) => row.map((v) => Math.round(v))),
        isMobile,
        true,
      ),
    [data.data?.weekday_month_net, isMobile],
  );
  const hourHeatmapOption: EChartsOption | null = useMemo(
    () => weekdayHourHeatmap(data.data?.weekday_hour, isMobile),
    [data.data?.weekday_hour, isMobile],
  );

  const hoursRowCount = subcatColored.filter((s) => s.hours > 0).length;
  const netRowCount = subcatColored.filter((s) => s.net > 0).length;
  const netTotal = subcatColored.reduce((sum, s) => sum + (s.net || 0), 0);
  const hoursTotal = subcatColored.reduce((sum, s) => sum + (s.hours || 0), 0);
  const barChartHeight = (rows: number) => Math.max(160, rows * 34 + 16);

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
  const yearHoursTotal = useMemo(
    () => (data.data?.monthly ?? []).reduce((s, m) => s + (m.hours || 0), 0),
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

      <Card padding="p-4" className="events-filters report-filters">
        <button
          type="button"
          className="events-filters-toggle"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          <span>Фильтры</span>
          {activeFilterCount > 0 && (
            <span className="events-filters-count">{activeFilterCount}</span>
          )}
          {activeFilterCount > 0 && (
            <span
              role="button"
              tabIndex={0}
              className="events-filters-clear-mobile"
              aria-label="Очистить фильтры"
              title="Очистить"
              onClick={(e) => {
                e.stopPropagation();
                clearAllFilters();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  clearAllFilters();
                }
              }}
            >
              <FilterX size={15} />
            </span>
          )}
          <ChevronDown
            size={16}
            className="events-filters-caret"
            style={{ transform: filtersOpen ? "rotate(180deg)" : "none" }}
          />
        </button>
        <div className="events-filters-body" data-open={filtersOpen ? "true" : "false"}>
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
        </div>
      </Card>

      <div className="grid grid-2 gap-md">
        <Card>
          <div className="card-head" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="card-title">Часы по подкатегориям</div>
              <div className="muted small" style={{ textTransform: "capitalize", marginTop: 2 }}>
                {periodLabel}
              </div>
            </div>
            {hoursBar && (
              <div style={{ textAlign: "right" }}>
                <div className="muted small">
                  <span className="mono">
                    {hoursTotal.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <PctChangePill
                    current={hoursTotal}
                    previous={data.data?.prev_subcategory_hours_total ?? null}
                    prevLabel="Прошлый месяц"
                    unit="ч"
                    formatPrev={(n) =>
                      n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })
                    }
                  />
                </div>
              </div>
            )}
          </div>
          {hoursBar ? (
            <Echart option={hoursBar} height={barChartHeight(hoursRowCount)} />
          ) : (
            <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>
          )}
        </Card>

        <Card>
          <div className="card-head" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="card-title">Чистый доход по подкатегориям</div>
              <div className="muted small" style={{ textTransform: "capitalize", marginTop: 2 }}>
                {periodLabel}
              </div>
            </div>
            {netBar && (
              <div style={{ textAlign: "right" }}>
                <div className="muted small">
                  <span className="mono">{fmt.money(netTotal)} ₽</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <PctChangePill
                    current={netTotal}
                    previous={data.data?.prev_subcategory_net_total ?? null}
                    prevLabel="Прошлый месяц"
                  />
                </div>
              </div>
            )}
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
            <PctChangePill
              current={yearTotal.net}
              previous={data.data?.prev_monthly_net_total ?? null}
              prevLabel={`${year - 1}`}
            />
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

      <Card>
        <div className="card-head" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="card-title">Часы по месяцам</div>
            <div className="muted small" style={{ marginTop: 2 }}>{year}</div>
          </div>
          {hoursMonthly && (
            <div style={{ textAlign: "right" }}>
              <div className="muted small">
                <span className="mono">
                  {yearHoursTotal.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч
                </span>
              </div>
              <div style={{ marginTop: 4 }}>
                <PctChangePill
                  current={yearHoursTotal}
                  previous={data.data?.prev_monthly_hours_total ?? null}
                  prevLabel={`${year - 1}`}
                  unit="ч"
                  formatPrev={(n) =>
                    n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })
                  }
                />
              </div>
            </div>
          )}
        </div>
        {hoursMonthly ? (
          <Echart option={hoursMonthly} height={300} />
        ) : (
          <div className="muted small" style={{ marginTop: 16 }}>Нет данных за {year}</div>
        )}
      </Card>

      {heatmapOption && (
        <Card>
          <div className="card-head" style={{ alignItems: "baseline" }}>
            <div className="card-title">События по дням недели</div>
            <div className="muted small">{year}</div>
          </div>
          <Echart option={heatmapOption} height={isMobile ? 420 : 290} />
        </Card>
      )}

      {hourHeatmapOption && (
        <Card>
          <div className="card-head" style={{ alignItems: "baseline" }}>
            <div className="card-title">События по часам</div>
            <div className="muted small">{year}</div>
          </div>
          <Echart option={hourHeatmapOption} height={isMobile ? 560 : 290} />
        </Card>
      )}

      {sumHeatmapOption && (
        <Card>
          <div className="card-head" style={{ alignItems: "baseline" }}>
            <div className="card-title">Сумма по дням недели</div>
            <div className="muted small">{year}</div>
          </div>
          <Echart option={sumHeatmapOption} height={isMobile ? 420 : 290} />
        </Card>
      )}

    </div>
  );
}
