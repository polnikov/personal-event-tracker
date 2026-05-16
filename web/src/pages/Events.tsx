import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Button,
  Card,
  EventTableRow,
  Input,
  Select,
  Tabs,
} from "@/components/design";
import { categories as categoriesApi, clients as clientsApi, events as eventsApi } from "@/lib/api";
import { fmt, pluralize } from "@/lib/format";
import type { EventItem } from "@/types/api";

type TabKey = "today" | "future" | "past";
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
  const [tab, setTab] = useState<TabKey>("today");
  const [catFilter, setCatFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });
  const clientsList = useQuery({ queryKey: ["clients", ""], queryFn: () => clientsApi.list("") });

  const list = useQuery({
    queryKey: ["events", "list", { catFilter, clientFilter }],
    queryFn: () =>
      eventsApi.list({
        category_id: catFilter ? Number(catFilter) : undefined,
        client_id: clientFilter ? Number(clientFilter) : undefined,
      }),
  });

  // Reset pagination when the visible slice changes underneath us.
  useEffect(() => setLimit(PAGE_SIZE), [tab, catFilter, clientFilter, search]);

  const todayKey = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const all = useMemo(
    () => [...(list.data?.future ?? []), ...(list.data?.past ?? [])],
    [list.data],
  );

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return all;
    return all.filter((e) => {
      const d = parseISO(e.start_at);
      const dateHaystack = [
        format(d, "d MMMM yyyy", { locale: ru }),  // 15 мая 2026
        format(d, "EEEE", { locale: ru }),          // понедельник
        format(d, "EEE", { locale: ru }),           // пн
        format(d, "MMM yyyy", { locale: ru }),      // май 2026
        format(d, "dd.MM.yyyy"),                     // 15.05.2026
        format(d, "yyyy-MM-dd"),                     // 2026-05-15
      ].join(" ");
      const haystacks = [
        e.subcategory.name,
        e.subcategory.category_name,
        e.client?.full_name || "",
        e.notes || "",
        dateHaystack,
      ];
      return haystacks.some((h) => h.toLowerCase().includes(q));
    });
  }, [all, q]);

  const counts = useMemo(() => {
    let today = 0, future = 0, past = 0;
    for (const e of filtered) {
      const k = dayKey(e.start_at);
      if (k === todayKey) today++;
      else if (k > todayKey) future++;
      else past++;
    }
    return { today, future, past };
  }, [filtered, todayKey]);

  const slice = useMemo(() => {
    return filtered.filter((e) => {
      const k = dayKey(e.start_at);
      if (tab === "today") return k === todayKey;
      if (tab === "future") return k > todayKey;
      return k < todayKey;
    });
  }, [filtered, tab, todayKey]);

  // Today → ascending (morning first), past/future → newest first
  const groups = useMemo(
    () => buildDayGroups(slice, todayKey, tab !== "today"),
    [slice, todayKey, tab],
  );

  const paginated = useMemo(
    () => (tab === "today" ? { groups, total: slice.length } : paginateGroups(groups, limit)),
    [groups, limit, tab, slice.length],
  );

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

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          {
            value: "today",
            label: (
              <>
                Сегодня
                {counts.today > 0 && <span className="tab-badge">{counts.today}</span>}
              </>
            ),
          },
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

      <Card padding="p-4">
        <div className="filter-row">
          <Select
            value={catFilter}
            onChange={setCatFilter}
            placeholder="Все категории"
            options={cats.data?.map((c) => ({ value: String(c.id), label: c.name })) ?? []}
          />
          <Select
            value={clientFilter}
            onChange={setClientFilter}
            placeholder="Все клиенты"
            options={clientsList.data?.map((c) => ({ value: String(c.id), label: c.full_name })) ?? []}
          />
          <Input
            icon={<Search size={16} />}
            placeholder="…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
          />
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
            {(tab === "today" || g.events.length >= 2) && (
              <div className="day-group-net mono">{fmt.money(g.net)} ₽</div>
            )}
          </div>
          <Card padding="p-0">
            <div className={`event-table${g.isPast ? " dim" : ""}`}>
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
      ))}

      {tab !== "today" && paginated.total > limit && (
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
              {tab === "today"
                ? "Сегодня событий нет"
                : tab === "future"
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
