import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Edit3, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Modal,
} from "@/components/design";
import { ColorPicker } from "@/components/ColorPicker";
import { IconPicker } from "@/components/IconPicker";
import { AppIcon } from "@/components/phosphor";
import { categories as categoriesApi } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { Category, Subcategory } from "@/types/api";

export function CategoriesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });

  const [creatingCat, setCreatingCat] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [addingSubFor, setAddingSubFor] = useState<Category | null>(null);
  const [editingSub, setEditingSub] = useState<{ cat: Category; sub: Subcategory } | null>(null);
  const [editingPriceFor, setEditingPriceFor] = useState<{ cat: Category; sub: Subcategory } | null>(null);

  const removeCat = useMutation({
    mutationFn: (id: number) => categoriesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
  const removeSub = useMutation({
    mutationFn: (id: number) => categoriesApi.removeSubcategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Категории</h1>
          <div className="muted">Услуги и тарифы</div>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setCreatingCat(true)}>
          Новая категория
        </Button>
      </div>

      <div className="grid grid-2 gap-md">
        {list.data?.map((cat) => (
          <Card key={cat.id}>
            <div className="cat-card-head">
              <div className="cat-card-title">
                <span
                  className="cat-color-block"
                  style={{
                    background: cat.color,
                    color: "#FFFFFF",
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {cat.icon && <AppIcon name={cat.icon} size={16} weight="duotone" color="#FFFFFF" />}
                </span>
                <span className="h3">{cat.name}</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <IconButton
                  onClick={() => setEditingCat(cat)}
                  aria-label="Редактировать"
                >
                  <Edit3 size={15} strokeWidth={1.6} />
                </IconButton>
                <IconButton
                  danger
                  onClick={() => {
                    if (confirm(`Удалить категорию "${cat.name}" со всеми подкатегориями?`)) {
                      removeCat.mutate(cat.id);
                    }
                  }}
                  aria-label="Удалить"
                >
                  <Trash2 size={15} strokeWidth={1.6} />
                </IconButton>
              </div>
            </div>
            <div className="subcat-list">
              {cat.subcategories.map((sub) => (
                <div key={sub.id} className="subcat-row">
                  <div className="subcat-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {sub.icon && (
                      <AppIcon name={sub.icon} size={16} weight="duotone" color={cat.color} />
                    )}
                    <span>{sub.name}</span>
                  </div>
                  <div className="subcat-price mono">
                    {sub.current_price ? `${fmt.money(sub.current_price)} ₽` : "—"}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <IconButton
                      small
                      onClick={() => setEditingSub({ cat, sub })}
                      aria-label="Имя/иконка"
                    >
                      <Edit3 size={13} />
                    </IconButton>
                    <IconButton
                      small
                      onClick={() => setEditingPriceFor({ cat, sub })}
                      aria-label="Новая цена"
                    >
                      <Coins size={13} />
                    </IconButton>
                    <IconButton
                      small
                      danger
                      onClick={() => {
                        if (confirm(`Удалить подкатегорию "${sub.name}"?`)) removeSub.mutate(sub.id);
                      }}
                      aria-label="Удалить"
                    >
                      <Trash2 size={13} strokeWidth={1.6} />
                    </IconButton>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="add-sub-btn"
                onClick={() => setAddingSubFor(cat)}
              >
                <Plus size={13} /> Добавить подкатегорию
              </button>
            </div>
          </Card>
        ))}
      </div>

      {creatingCat && <CategoryFormModal onClose={() => setCreatingCat(false)} />}
      {editingCat && (
        <CategoryFormModal category={editingCat} onClose={() => setEditingCat(null)} />
      )}
      {addingSubFor && (
        <NewSubcategoryModal cat={addingSubFor} onClose={() => setAddingSubFor(null)} />
      )}
      {editingSub && (
        <EditSubcategoryModal
          cat={editingSub.cat}
          sub={editingSub.sub}
          onClose={() => setEditingSub(null)}
        />
      )}
      {editingPriceFor && (
        <NewPriceModal
          cat={editingPriceFor.cat}
          sub={editingPriceFor.sub}
          onClose={() => setEditingPriceFor(null)}
        />
      )}
    </div>
  );
}

/**
 * Dual-purpose modal: creates a new category when `category` is null/absent;
 * edits the existing one when a category is passed in.
 */
function CategoryFormModal({
  category,
  onClose,
}: {
  category?: Category | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? "#7BB661");
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null);

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), color, icon };
      return isEdit
        ? categoriesApi.update(category!.id, payload)
        : categoriesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? "Редактирование категории" : "Новая категория"}
      footer={
        <>
          <Button variant="danger" onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => name.trim() && save.mutate()}
            disabled={save.isPending}
          >
            {isEdit ? "Сохранить" : "Создать"}
          </Button>
        </>
      }
    >
      <div className="form">
        <Field label="Название">
          <Input
            placeholder="Йога, Массаж, ..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Цвет">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Иконка">
          <IconPicker value={icon} onChange={setIcon} color={color} />
        </Field>
      </div>
    </Modal>
  );
}

function NewSubcategoryModal({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const create = useMutation({
    mutationFn: () =>
      categoriesApi.createSubcategory(cat.id, {
        name: name.trim(),
        initial_price: Number(price),
        icon,
        effective_from: effectiveFrom ? `${effectiveFrom}T00:00:00` : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
  });
  const canSubmit = !!name.trim() && !!price && !!effectiveFrom && !create.isPending;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Новая подкатегория · ${cat.name}`}
      footer={
        <>
          <Button variant="danger" onClick={onClose}>Отмена</Button>
          <Button onClick={() => canSubmit && create.mutate()} disabled={!canSubmit}>
            Создать
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        <Field label="Название">
          <Input
            placeholder="Индивидуально, Парная, ..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="form-grid-2">
          <Field label="Цена за час, ₽">
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="2500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Действует с">
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Иконка">
          <IconPicker value={icon} onChange={setIcon} color={cat.color} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Edit name and icon of an existing subcategory. Price is managed
    separately (NewPriceModal) since it has its own history table. */
function EditSubcategoryModal({
  cat,
  sub,
  onClose,
}: {
  cat: Category;
  sub: Subcategory;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(sub.name);
  const [icon, setIcon] = useState<string | null>(sub.icon);

  const save = useMutation({
    mutationFn: () =>
      categoriesApi.updateSubcategory(sub.id, { name: name.trim(), icon }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
  });
  const canSubmit = !!name.trim() && !save.isPending;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Редактирование подкатегории · ${cat.name}`}
      footer={
        <>
          <Button variant="danger" onClick={onClose}>Отмена</Button>
          <Button onClick={() => canSubmit && save.mutate()} disabled={!canSubmit}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) save.mutate();
        }}
      >
        <Field label="Название">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Иконка">
          <IconPicker value={icon} onChange={setIcon} color={cat.color} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function NewPriceModal({
  cat,
  sub,
  onClose,
}: {
  cat: Category;
  sub: Subcategory;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [price, setPrice] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const create = useMutation({
    mutationFn: () =>
      categoriesApi.addPrice(sub.id, {
        price_per_hour: Number(price),
        effective_from: `${effectiveFrom}T00:00:00`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
  });
  const canSubmit = !!price && Number(price) > 0 && !!effectiveFrom && !create.isPending;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Новая цена · ${cat.name} | ${sub.name}`}
      footer={
        <>
          <Button variant="danger" onClick={onClose}>Отмена</Button>
          <Button onClick={() => canSubmit && create.mutate()} disabled={!canSubmit}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
      >
        <div className="form-grid-2">
          <Field label="Цена за час, ₽">
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="2500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Действует с">
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </Field>
        </div>
        {sub.prices.length > 0 && (
          <div>
            <div className="field-label" style={{ marginBottom: 8 }}>История цен</div>
            <div className="subcat-list">
              {sub.prices.map((p) => (
                <div key={p.id} className="subcat-row" style={{ margin: 0, padding: "6px 0" }}>
                  <span className="subcat-name">{fmt.fullDate(p.effective_from)}</span>
                  <span className="subcat-price mono">{fmt.money(p.price_per_hour)} ₽</span>
                  <span />
                </div>
              ))}
            </div>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
