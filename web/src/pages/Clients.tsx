import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Plus, Search, Send, Trash2 } from "lucide-react";
import { UserPlus } from "@phosphor-icons/react";
import {
  Avatar,
  Button,
  Card,
  IconButton,
  Input,
} from "@/components/design";
import { ClientFormModal } from "@/components/ClientFormModal";
import { clients as clientsApi } from "@/lib/api";
import { fmt } from "@/lib/format";

export function ClientsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const qc = useQueryClient();
  // Server returns the full list; narrowing happens client-side so the
  // search can hit every visible field (name, phone, telegram, notes).
  const list = useQuery({
    queryKey: ["clients", ""],
    queryFn: () => clientsApi.list(""),
  });

  const remove = useMutation({
    mutationFn: (id: number) => clientsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const filtered = useMemo(() => {
    const all = list.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((c) => {
      const hay = [c.full_name, c.phone || "", c.telegram || "", c.notes || ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [list.data, q]);

  // Sort by event count desc; ties broken by name for a stable order.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (b.events_count !== a.events_count) return b.events_count - a.events_count;
      return a.full_name.localeCompare(b.full_name, "ru");
    });
  }, [filtered]);

  const PAGE = 10;
  const [limit, setLimit] = useState(PAGE);
  // Reset visible page when the filtered list shrinks/grows underneath us
  useEffect(() => setLimit(PAGE), [q]);
  const visible = sorted.slice(0, limit);
  const hasMore = limit < sorted.length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Клиенты</h1>
          <div className="muted">{list.data?.length ?? 0} клиентов</div>
        </div>
        <div className="page-head-actions">
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            Новый клиент
          </Button>
        </div>
      </div>

      <Input
        icon={<Search size={16} />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onClear={() => setQ("")}
        placeholder="Поиск…"
      />

      <div className="grid grid-3 gap-md clients-grid">
        {visible.map((c) => (
          <Card
            key={c.id}
            className="client-card"
            interactive
            onClick={() => nav(`/clients/${c.id}`)}
          >
            <div className="client-card-top">
              <Avatar name={c.full_name} size={44} />
              <IconButton
                small
                danger
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Удалить клиента "${c.full_name}"?`)) remove.mutate(c.id);
                }}
                aria-label="Удалить"
              >
                <Trash2 size={15} strokeWidth={1.6} />
              </IconButton>
            </div>
            <div className="client-card-name">{c.full_name}</div>
            <div className="client-card-meta">
              {c.phone && (
                <div className="client-meta-row">
                  <Phone size={13} strokeWidth={1.6} />
                  <span>{c.phone}</span>
                </div>
              )}
              {c.telegram && (
                <div className="client-meta-row">
                  <Send size={13} strokeWidth={1.6} />
                  <span>@{c.telegram}</span>
                </div>
              )}
              {!c.phone && !c.telegram && (
                <div className="client-card-no-contacts small">Контакты не заполнены</div>
              )}
            </div>
            {c.notes && <div className="client-card-note">{c.notes}</div>}
            <div className="client-card-foot">
              <div>
                <div className="client-stat-num mono">{c.events_count}</div>
                <div className="client-stat-lab muted small">событий</div>
              </div>
              <div>
                <div className="client-stat-num mono">{fmt.money(c.total_spent)} ₽</div>
                <div className="client-stat-lab muted small">всего</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
            Загрузить ещё ({sorted.length - limit})
          </Button>
        </div>
      )}

      {list.isFetched && (list.data?.length ?? 0) === 0 && (
        <Card>
          <div className="empty">
            <div className="empty-title">Клиентов нет</div>
            <div className="empty-hint">Создайте первого клиента кнопкой выше</div>
          </div>
        </Card>
      )}

      {creating && (
        <ClientFormModal client={null} onClose={() => setCreating(false)} />
      )}

      <button
        type="button"
        className="mobile-fab mobile-fab-client"
        onClick={() => setCreating(true)}
        aria-label="Новый клиент"
      >
        <UserPlus size={24} weight="duotone" />
      </button>
    </div>
  );
}
