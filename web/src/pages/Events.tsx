import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, FilterX, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format, parse, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Button,
  Card,
  EventLineRow,
  Input,
  MultiSelect,
  SearchableSelect,
  Select,
  Tabs,
  Toggle,
  buildEventLineIconMaps,
} from "@/components/design";
import { categories as categoriesApi, clients as clientsApi, events as eventsApi } from "@/lib/api";
import { fmt, pluralize } from "@/lib/format";
import type { EventItem } from "@/types/api";
import { EventFormModal } from "@/pages/EventForm";
import { EventDetailModal } from "@/components/EventDetailModal";
import { DatePicker } from "@/components/DatePicker";

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

interface VisibleDayGroup extends DayGroup {
  /** Total events for the day BEFORE pagination — drives the count badge. */
  totalEvents: number;
}

/** Trim a list of day groups so that at most `limit` events total are shown,
 *  while preserving each day's full count so the badge always reflects the
 *  whole day even when the last group is paginated. */
function paginateGroups(
  groups: DayGroup[],
  limit: number,
): { groups: VisibleDayGroup[]; total: number } {
  const total = groups.reduce((s, g) => s + g.events.length, 0);
  if (limit >= total) {
    return {
      groups: groups.map((g) => ({ ...g, totalEvents: g.events.length })),
      total,
    };
  }
  const out: VisibleDayGroup[] = [];
  let remaining = limit;
  for (const g of groups) {
    if (remaining <= 0) break;
    if (g.events.length <= remaining) {
      out.push({ ...g, totalEvents: g.events.length });
      remaining -= g.events.length;
    } else {
      out.push({ ...g, events: g.events.slice(0, remaining), totalEvents: g.events.length });
      remaining = 0;
    }
  }
  return { groups: out, total };
}


export function EventsPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>("future");
  const [catFilter, setCatFilter] = useState<string>("");
  const [subcatFilter, setSubcatFilter] = useState<string[]>([]);
  const [yearFilter, setYearFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [royaltyOnly, setRoyaltyOnly] = useState(false);
  const [search, setSearch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Modal state: { eventId } for edit, { copyId } for duplicate, "new" for create.
  const [modal, setModal] = useState<
    | { kind: "new"; prefillClient?: string }
    | { kind: "edit"; eventId: number }
    | { kind: "copy"; copyId: number }
    | null
  >(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const activeFilterCount =
    (catFilter ? 1 : 0) +
    (subcatFilter.length ? 1 : 0) +
    (yearFilter ? 1 : 0) +
    (monthFilter ? 1 : 0) +
    (clientFilter ? 1 : 0) +
    (royaltyOnly ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const clearAllFilters = () => {
    setCatFilter("");
    setSubcatFilter([]);
    setYearFilter("");
    setMonthFilter("");
    setClientFilter("");
    setRoyaltyOnly(false);
    setDateFrom("");
    setDateTo("");
  };

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
    setSubcatFilter((prev) => prev.filter((v) => subcatOptions.some((o) => o.value === v)));
  }, [subcatOptions]);
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
      if (subcatFilter.length && !subcatFilter.includes(String(e.subcategory.id))) return false;
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

  // "Future" includes events whose end time is still ahead of now — that
  // covers tomorrow's events, today's not-yet-started events, and events
  // currently in progress. "Past" is the strict complement.
  // A 10-second ticker re-runs the partitioning memos so finished events
  // slide into "Прошедшие" automatically without a page reload. We also
  // bump the tick whenever the tab regains visibility — background tabs
  // throttle setInterval to ~1Hz and may have missed the transition.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNowTick(Date.now());
    const id = setInterval(tick, 10_000);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const isFuture = (e: EventItem) => new Date(e.end_at).getTime() > nowTick;

  const counts = useMemo(() => {
    let future = 0, past = 0;
    for (const e of filtered) {
      if (isFuture(e)) future++;
      else past++;
    }
    return { future, past };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, nowTick]);

  const slice = useMemo(() => {
    return filtered.filter((e) => (tab === "future" ? isFuture(e) : !isFuture(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tab, nowTick]);

  // Future → ASC (closest day first), Past → DESC (newest day first)
  const groups = useMemo(
    () => buildDayGroups(slice, todayKey, tab === "past"),
    [slice, todayKey, tab],
  );

  const paginated = useMemo(
    () => paginateGroups(groups, limit),
    [groups, limit],
  );

  // Net income across everything matching the current filters (both tabs),
  // shown next to the royalty toggle in the filters block.
  const netTotal = useMemo(
    () => filtered.reduce((s, e) => s + netOf(e), 0),
    [filtered],
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
          <div className="muted mobile-hide">
            {filtered.length} {pluralize(filtered.length, "событие", "события", "событий")}
          </div>
        </div>
        <div className="page-head-actions">
          <div className="muted mobile-only page-head-mobile-meta">
            {filtered.length} {pluralize(filtered.length, "событие", "события", "событий")}
          </div>
          <Button
            className="mobile-hide"
            icon={<Plus size={16} />}
            onClick={() => setModal({ kind: "new" })}
          >
            Новое событие
          </Button>
        </div>
      </div>

      <div className="events-toolbar">
      <div className="events-controls">
        <Tabs<TabKey>
          className="events-tabs"
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
              label: "Прошедшие",
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
          {activeFilterCount > 0 && (
            <span
              role="button"
              tabIndex={0}
              className="events-filters-clear-mobile"
              aria-label="Очистить все фильтры"
              title="Очистить всё"
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
          <div className="events-filters-row">
          <div className="filter-row-events-7">
            <Select
              value={catFilter}
              onChange={setCatFilter}
              placeholder="Все категории"
              options={catOptions}
            />
            <MultiSelect
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
            <SearchableSelect
              value={clientFilter}
              onChange={setClientFilter}
              placeholder="Все клиенты"
              options={clientOptions}
            />
            <DatePicker
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="Начало"
              ariaLabel="Начало"
            />
            <DatePicker
              value={dateTo}
              onChange={setDateTo}
              placeholder="Конец"
              ariaLabel="Конец"
            />
          </div>
            <button
              type="button"
              className="events-filter-clear"
              onClick={clearAllFilters}
              disabled={activeFilterCount === 0}
              aria-label="Очистить все фильтры"
              title="Очистить всё"
            >
              <FilterX size={16} />
            </button>
          </div>
          <div className="events-filter-foot">
            <Toggle
              checked={royaltyOnly}
              onChange={setRoyaltyOnly}
              label="Роялти"
            />
            <div className="events-filter-net">
              <span className="muted small">Чистыми</span>
              <span className="mono">{fmt.money(netTotal)} ₽</span>
            </div>
          </div>
        </div>
      </Card>
      </div>

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
              </span>
              <span className="day-group-count-badge">{g.totalEvents}</span>
              {g.key === todayKey && (
                <span className="day-group-today"> · сегодня</span>
              )}
            </div>
            {g.totalEvents >= 2 && (
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
                  onClick={() => setDetailId(e.id)}
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

      <EventFormModal
        open={modal !== null}
        eventId={modal?.kind === "edit" ? modal.eventId : undefined}
        copyId={modal?.kind === "copy" ? modal.copyId : undefined}
        prefillClient={modal?.kind === "new" ? modal.prefillClient : undefined}
        onClose={() => setModal(null)}
        onSaved={() => setModal(null)}
        onCopy={(srcId) => setModal({ kind: "copy", copyId: srcId })}
      />
      {detailId !== null && (
        <EventDetailModal eventId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
