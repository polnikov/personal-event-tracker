import { useMemo, useState } from "react";
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
} from "@/components/design";
import { categories as categoriesApi, clients as clientsApi, events as eventsApi } from "@/lib/api";
import { fmt, pluralize } from "@/lib/format";
import type { EventItem } from "@/types/api";

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

function buildDayGroups(events: EventItem[], todayKey: string): DayGroup[] {
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
  return groups;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function EventsPage() {
  const nav = useNavigate();
  const [catFilter, setCatFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");

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

  const groups = useMemo(() => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");
    const all = buildDayGroups(filtered, todayKey);
    // All days descending (newest first); within each day events are already sorted by time ASC.
    const ordered = all.sort((a, b) => b.key.localeCompare(a.key));
    return { ordered, todayKey };
  }, [filtered]);

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
            placeholder="Поиск: подкат., клиент, заметка, дата (15, мая, 2026, пн)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
          />
        </div>
      </Card>

      {groups.ordered.map((g) => (
        <div key={g.key} className="day-group">
          <div className="day-group-head">
            <div>
              <span className="day-group-weekday">
                {capitalize(format(g.date, "EEEE", { locale: ru }))}
              </span>
              <span className="day-group-date muted">
                {" · "}
                {format(g.date, "d MMMM", { locale: ru })}
                {g.key === groups.todayKey ? " · сегодня" : ""}
              </span>
            </div>
            {g.events.length >= 2 && (
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

      {groups.ordered.length === 0 && list.isFetched && (
        <Card>
          <div className="empty">
            <div className="empty-title">Событий не найдено</div>
            <div className="empty-hint">Попробуйте сбросить фильтры или создать новое</div>
          </div>
        </Card>
      )}
    </div>
  );
}
