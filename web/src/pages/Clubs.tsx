import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Search, Trash2 } from "lucide-react";
import { Button, Card, IconButton, Input } from "@/components/design";
import { ClubFormModal } from "@/components/ClubFormModal";
import { clubs as clubsApi, OfflineQueuedError } from "@/lib/api";
import type { Club } from "@/types/api";

export function ClubsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  // null = closed; { club: null } = create; { club } = edit
  const [editing, setEditing] = useState<{ club: Club | null } | null>(null);

  const list = useQuery({
    queryKey: ["clubs", ""],
    queryFn: () => clubsApi.list(""),
  });

  const remove = useMutation({
    mutationFn: (id: number) => clubsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err: Error) => {
      if (err instanceof OfflineQueuedError) {
        qc.invalidateQueries({ queryKey: ["clubs"] });
      }
    },
  });

  const filtered = useMemo(() => {
    const all = list.data ?? [];
    const needle = q.trim().toLowerCase();
    const narrowed = needle
      ? all.filter((c) =>
          [c.name, c.address || ""].join(" ").toLowerCase().includes(needle),
        )
      : all;
    return [...narrowed].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [list.data, q]);

  const PAGE = 12;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [q]);
  const visible = filtered.slice(0, limit);
  const hasMore = limit < filtered.length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Клубы</h1>
          <div className="muted mobile-hide">{list.data?.length ?? 0} клубов</div>
        </div>
        <div className="page-head-actions">
          <Button icon={<Plus size={16} />} onClick={() => setEditing({ club: null })}>
            Новый клуб
          </Button>
        </div>
      </div>

      <div className="clients-search">
        <Input
          icon={<Search size={16} />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => setQ("")}
          placeholder="Поиск…"
        />
      </div>

      <div className="grid grid-3 gap-md clients-grid">
        {visible.map((c) => (
          <Card
            key={c.id}
            className="client-card"
            interactive
            onClick={() => setEditing({ club: c })}
          >
            <div className="client-card-top">
              <div className="club-card-icon">
                <MapPin size={20} strokeWidth={1.7} />
              </div>
              <IconButton
                small
                danger
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Удалить клуб "${c.name}"?`)) remove.mutate(c.id);
                }}
                aria-label="Удалить"
              >
                <Trash2 size={15} strokeWidth={1.6} />
              </IconButton>
            </div>
            <div className="client-card-name">{c.name}</div>
            <div className="client-card-meta">
              {c.address ? (
                <div className="client-meta-row">
                  <MapPin size={13} strokeWidth={1.6} />
                  <span>{c.address}</span>
                </div>
              ) : (
                <div className="client-card-no-contacts small">Адрес не указан</div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
            Загрузить ещё ({filtered.length - limit})
          </Button>
        </div>
      )}

      {list.isFetched && (list.data?.length ?? 0) === 0 && (
        <Card>
          <div className="empty">
            <div className="empty-title">Клубов нет</div>
            <div className="empty-hint">Добавьте первый клуб кнопкой выше</div>
          </div>
        </Card>
      )}

      {editing && (
        <ClubFormModal club={editing.club} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
