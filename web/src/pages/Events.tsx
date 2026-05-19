import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Button,
  Card,
  EventLineRow,
  Input,
  Select,
  Tabs,
  Toggle,
  buildEventLineIconMaps,
} from "@/components/design";
import { categories as categoriesApi, clients as clientsApi, events as eventsApi } from "@/lib/api";
import { fmt, pluralize } from "@/lib/format";
import type { EventItem } from "@/types/api";

type TabKey = "future" | "past";
const PAGE_SIZE = 10;

function netOf(e: EventItem): number {
  const gross = parseFloat(e.total_cost) || 0;
  const tax = (gross * (parseFloat(e.tax) || 0)) / 100;
  const royalty = (gross * (parseFloat(e.royalty) || 0)) / 100;
  return gross - tax - royalty;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

interface DayGroup {
  key: string;
  date: Date;
  events: EventItem[];
  net: number;
  isPast: boolean;
}

function buildDayGroups(events: EventItem[], todayKey: string, orderDesc = true): DayGroup[] {
  const map = new Map<string, EventItem[]>();
  for (const e of events) {
    const k = dayKey(e.start_at);
    const list = map.get(k) ?? [];
    list.push(e);
    map.set(k, list);
  }
  const groups: DayGroup[] = [];
  for (const [k, evs] of map.entries()) {
    evs.sort((a, b) => a.start_at.localeCompare(b.start_at));
    const net = evs.reduce((s, e) => s + netOf(e), 0);
    groups.push({
      key: k,
      date: parseISO(`${k}T00:00:00`),
      events: evs,
      net,
      isPast: k < todayKey,
    });
  }
  groups.sort((a, b) =>
    orderDesc ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key),
  );
  return groups;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Trim a list of day groups so that at most `limit` events total are shown. */
function paginateGroups(groups: DayGroup[], limit: number): { groups: DayGroup[]; total: number } {
  const total = groups.reduce((s, g) => s + g.events.length, 0);
  if (limit >= total) return { groups, total };
  const out: DayGroup[] = [];
  let remaining = limit;
  for (const g of groups) {
    if (remaining <= 0) break;
    if (g.events.length <= remaining) {
      out.push(g);
      remaining -= g.events.length;
    } else {
      out.push({ ...g, events: g.events.slice(0, remaining) });
      remaining = 0;
    }
  }
  return { groups: out, total };
}


export function EventsPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("future");
  const [catFilter, setCatFilter] = useState<string>("");
  const [subcatFilter, setSubcatFilter] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [royaltyOnly, setRoyaltyOnly] = useState(false);
  const [search, setSearch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount =
    (catFilter ? 1 : 0) +
    (subcatFilter ? 1 : 0) +
    (yearFilter ? 1 : 0) +
    (monthFilter ? 1 : 0) +
    (clientFilter ? 1 : 0) +
    (royaltyOnly ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });
  const clientsList = useQuery({ queryKey: ["clients", ""], queryFn: () => clientsApi.list("") });

  // Server fetch ignores filters — all narrowing happens client-side so the
  // dropdowns can derive their option pools from the actual event data.
  const list = useQuery({
    queryKey: ["events", "list"],
    queryFn: () => eventsApi.list({}),
  });

  const icons = useMemo(() => buildEventLineIconMaps(cats.data), [cats.data]);

  const todayKey = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const all = useMemo(
    () => [...(list.data?.future ?? []), ...(list.data?.past ?? [])],
    [list.data],
  );

  // --- Cascading dropdown option pools ---

  // Subcategories: when a category is picked, restrict to its subcategories;
  // otherwise show all. Category is already in its own filter, so the label
  // is the subcategory name only.
  const subcatOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const c of cats.data ?? []) {
      if (catFilter && c.id !== Number(catFilter)) continue;
      for (const s of c.subcategories) {
        out.push({ value: String(s.id), label: s.name });
      }
    }
    out.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return out;
  }, [cats.data, catFilter]);

  // Year/Month — derived from events; month is further constrained by year.
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const e of all) set.add(parseISO(e.start_at).getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [all]);

  const availableMonths = useMemo(() => {
    const set = new Set<number>();
    for (const e of all) {
      const d = parseISO(e.start_at);
      if (yearFilter && d.getFullYear() !== Number(yearFilter)) continue;
      set.add(d.getMonth() + 1);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [all, yearFilter]);

  // Reset dependent filters that fell out of range.
  useEffect(() => {
    if (subcatFilter && !subcatOptions.find((o) => o.value === subcatFilter)) {
      setSubcatFilter("");
    }
  }, [subcatOptions, subcatFilter]);
  useEffect(() => {
    if (monthFilter && !availableMonths.includes(Number(monthFilter))) {
      setMonthFilter("");
    }
  }, [availableMonths, monthFilter]);

  // Reset pagination whenever the visible slice changes underneath us.
  useEffect(
    () => setLimit(PAGE_SIZE),
    [tab, catFilter, subcatFilter, yearFilter, monthFilter, clientFilter, royaltyOnly, search, dateFrom, dateTo],
  );

  // --- Filter pipeline ---
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return all.filter((e) => {
      const d = parseISO(e.start_at);
      const dKey = dayKey(e.start_at);
      if (catFilter && e.subcategory.category_id !== Number(catFilter)) return false;
      if (subcatFilter && e.subcategory.id !== Number(subcatFilter)) return false;
      if (yearFilter && d.getFullYear() !== Number(yearFilter)) return false;
      if (monthFilter && d.getMonth() + 1 !== Number(monthFilter)) return false;
      if (clientFilter && (e.client?.id ?? -1) !== Number(clientFilter)) return false;
      if (royaltyOnly && (parseFloat(e.royalty) || 0) <= 0) return false;
      if (dateFrom && dKey < dateFrom) return false;
      if (dateTo && dKey > dateTo) return false;
      if (q) {
        const dateHaystack = [
          format(d, "d MMMM yyyy", { locale: ru }),  // 15 мая 2026
          format(d, "EEEE", { locale: ru }),          // понедельник
          format(d, "EEE", { locale: ru }),           // пн
          format(d, "MMM yyyy", { locale: ru }),      // май 2026
          format(d, "dd.MM.yyyy"),
          format(d, "yyyy-MM-dd"),
        ].join(" ");
        const haystacks = [
          e.subcategory.name,
          e.subcategory.category_name,
          e.client?.full_name || "",
          e.notes || "",
          dateHaystack,
        ];
        if (!haystacks.some((h) => h.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [all, catFilter, subcatFilter, yearFilter, monthFilter, clientFilter, royaltyOnly, dateFrom, dateTo, q]);

  const counts = useMemo(() => {
    let future = 0, past = 0;
    for (const e of filtered) {
      const k = dayKey(e.start_at);
      if (k > todayKey) future++;
      else if (k < todayKey) past++;
    }
    return { future, past };
  }, [filtered, todayKey]);

  const slice = useMemo(() => {
    return filtered.filter((e) => {
      const k = dayKey(e.start_at);
      if (tab === "future") return k > todayKey;   // from tomorrow onwards
      return k < todayKey;                          // strictly past, today excluded
    });
  }, [filtered, tab, todayKey]);

  // Future → ASC (closest day first), Past → DESC (newest day first)
  const groups = useMemo(
    () => buildDayGroups(slice, todayKey, tab === "past"),
    [slice, todayKey, tab],
  );

  const paginated = useMemo(
    () => paginateGroups(groups, limit),
    [groups, limit],
  );

  // --- Select options ---
  const catOptions = (cats.data ?? []).map((c) => ({ value: String(c.id), label: c.name }));
  const yearOptions = availableYears.map((y) => ({ value: String(y), label: String(y) }));
  const monthOptions = availableMonths.map((m) => ({
    value: String(m),
    label: format(parse(String(m), "M", new Date()), "LLLL", { locale: ru }),
  }));
  const clientOptions = (clientsList.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.full_name,
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">События</h1>
          <div className="muted">
            {filtered.length} {pluralize(filtered.length, "событие", "события", "событий")}
          </div>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => nav("/events/new")}>
          Новое событие
        </Button>
      </div>

      <div className="events-controls">
        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          options={[
            {
              value: "future",
              label: (
                <>
                  Будущие
                  {counts.future > 0 && <span className="tab-badge">{counts.future}</span>}
                </>
              ),
            },
            {
              value: "past",
              label: (
                <>
                  Прошедшие
                  {counts.past > 0 && <span className="tab-badge">{counts.past}</span>}
                </>
              ),
            },
          ]}
        />
        <div className="events-search">
          <Input
            icon={<Search size={16} />}
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
          />
        </div>
      </div>

      <Card padding="p-4" className="events-filters">
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
          <ChevronDown
            size={16}
            className="events-filters-caret"
            style={{ transform: filtersOpen ? "rotate(180deg)" : "none" }}
          />
        </button>
        <div className="events-filters-body" data-open={filtersOpen ? "true" : "false"}>
          <div className="filter-row-4">
            <Select
              value={catFilter}
              onChange={setCatFilter}
              placeholder="Все категории"
              options={catOptions}
            />
            <Select
              value={subcatFilter}
              onChange={setSubcatFilter}
              placeholder="Все подкатегории"
              options={subcatOptions}
            />
            <Select
              value={yearFilter}
              onChange={setYearFilter}
              placeholder="Все годы"
              options={yearOptions}
            />
            <Select
              value={monthFilter}
              onChange={setMonthFilter}
              placeholder="Все месяцы"
              options={monthOptions}
            />
          </div>
          <div className="filter-row-events-3">
            <Select
              value={clientFilter}
              onChange={setClientFilter}
              placeholder="Все клиенты"
              options={clientOptions}
            />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="С"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="По"
            />
          </div>
          <div className="events-filter-foot">
            <Toggle
              checked={royaltyOnly}
              onChange={setRoyaltyOnly}
              label="Только с роялти"
            />
          </div>
        </div>
      </Card>

      {paginated.groups.map((g) => (
        <div key={g.key} className="day-group">
          <div className="day-group-head">
            <div>
              <span className="day-group-weekday">
                {capitalize(format(g.date, "EEEE", { locale: ru }))}
              </span>
              <span className="day-group-date muted">
                {" · "}
                {format(g.date, "d MMMM", { locale: ru })}
                {g.key === todayKey ? " · сегодня" : ""}
              </span>
            </div>
            {g.events.length >= 2 && (
              <div className="day-group-net mono">{fmt.money(g.net)} ₽</div>
            )}
          </div>
          <Card padding="p-0">
            <div className={`event-table${g.isPast ? " dim" : ""}`}>
              {g.events.map((e) => (
                <EventLineRow
                  key={e.id}
                  ev={e}
                  icons={icons}
                  onClick={() => nav(`/events/${e.id}/edit`)}
                  onClient={(id) => nav(`/clients/${id}`)}
                />
              ))}
            </div>
          </Card>
        </div>
      ))}

      {paginated.total > limit && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Загрузить ещё ({paginated.total - limit})
          </Button>
        </div>
      )}

      {paginated.groups.length === 0 && list.isFetched && (
        <Card>
          <div className="empty">
            <div className="empty-title">
              {tab === "future"
                ? "Будущих событий нет"
                : "Прошедших событий нет"}
            </div>
            <div className="empty-hint">Попробуйте сбросить фильтры или создать новое</div>
          </div>
        </Card>
      )}
    </div>
  );
}
