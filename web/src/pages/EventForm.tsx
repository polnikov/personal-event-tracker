import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMinutes, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronDown, Copy, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  SearchableSelect,
  Select,
  Textarea,
  Toggle,
} from "@/components/design";
import { categories as categoriesApi, clients as clientsApi, events as eventsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DateTimePicker } from "@/components/DateTimePicker";

const schema = z.object({
  subcategory_id: z.string().min(1, "Выберите подкатегорию"),
  client_id: z.string(),
  start_at: z.string().min(1, "Укажите дату/время"),
  duration_minutes: z.coerce.number().int().positive("Длительность > 0"),
  notes: z.string(),
  recalculate_price: z.boolean().optional(),
  price_per_hour: z.coerce.number().min(0, "Цена ≥ 0"),
  tax: z.coerce.number().min(0).max(100),
  royalty: z.coerce.number().min(0).max(100),
});
type FormValues = z.infer<typeof schema>;

const DURATION_PRESETS = [
  { value: 30, label: "30 мин" },
  { value: 45, label: "45 мин" },
  { value: 60, label: "1 ч" },
  { value: 90, label: "1,5 ч" },
  { value: 120, label: "2 ч" },
];

interface EventFormProps {
  /** When set, the form is in edit mode for this event id. */
  eventId?: number;
  /** When set (and eventId is not), seed the form from this event id. */
  copyId?: number;
  /** Optional client id prefill for a brand-new event. */
  prefillClient?: string;
  /** Called when the user cancels. */
  onCancel: () => void;
  /** Called after a successful create / update / delete. */
  onSaved: () => void;
  /** Optional handler for the "Copy" action; falls back to opening a
   *  fresh form in copy mode via onSaved-style navigation if not provided. */
  onCopy?: (id: number) => void;
}

/** Pure form body — no page chrome, no URL coupling. Render inside a
 *  Card on the page route, or inside a Modal from the Events list. */
export function EventForm({
  eventId,
  copyId,
  prefillClient,
  onCancel,
  onSaved,
  onCopy,
}: EventFormProps) {
  const isEdit = eventId !== undefined;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [royaltyEnabled, setRoyaltyEnabled] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // Tracks the last (subcategory, start_at) pair we synced price from.
  // Used to skip the initial reset from existing/copy data while letting
  // subsequent subcategory OR date changes drive a re-sync.
  const lastSyncedKey = useRef<string>("");

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });
  const clientsList = useQuery({ queryKey: ["clients", ""], queryFn: () => clientsApi.list("") });
  const existing = useQuery({
    queryKey: ["events", "detail", eventId],
    queryFn: () => eventsApi.detail(eventId!),
    enabled: isEdit,
  });
  const sourceForCopy = useQuery({
    queryKey: ["events", "detail", "copy", copyId],
    queryFn: () => eventsApi.detail(copyId!),
    enabled: !isEdit && copyId !== undefined,
  });

  // Default datetime-local value for "new" / "copy" — today's date with the
  // current local time. Computed once at first render so it stays stable.
  const nowLocal = useMemo(
    () => format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    [],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      subcategory_id: "",
      client_id: "",
      start_at: nowLocal,
      duration_minutes: 60,
      notes: "",
      recalculate_price: false,
      price_per_hour: 0,
      tax: 0,
      royalty: 0,
    },
  });

  useEffect(() => {
    if (existing.data) {
      const e = existing.data;
      const tax = parseFloat(e.tax) || 0;
      const royalty = parseFloat(e.royalty) || 0;
      form.reset({
        subcategory_id: String(e.subcategory_id),
        client_id: e.client_id ? String(e.client_id) : "",
        start_at: format(parseISO(e.start_at), "yyyy-MM-dd'T'HH:mm"),
        duration_minutes: e.duration_minutes,
        notes: e.notes || "",
        recalculate_price: false,
        price_per_hour: parseFloat(e.hourly_rate_snapshot) || 0,
        tax,
        royalty,
      });
      setTaxEnabled(tax > 0);
      setRoyaltyEnabled(royalty > 0);
      lastSyncedKey.current = `${e.subcategory_id}@${format(parseISO(e.start_at), "yyyy-MM-dd'T'HH:mm")}`;
    } else if (sourceForCopy.data) {
      const e = sourceForCopy.data;
      const tax = parseFloat(e.tax) || 0;
      const royalty = parseFloat(e.royalty) || 0;
      // Copy keeps the source event's time-of-day but moves the date to today.
      const sourceTime = format(parseISO(e.start_at), "HH:mm");
      const todayDate = format(new Date(), "yyyy-MM-dd");
      const copyStartAt = `${todayDate}T${sourceTime}`;
      form.reset({
        subcategory_id: String(e.subcategory_id),
        client_id: e.client_id ? String(e.client_id) : "",
        start_at: copyStartAt,
        duration_minutes: e.duration_minutes,
        notes: e.notes || "",
        recalculate_price: false,
        price_per_hour: parseFloat(e.hourly_rate_snapshot) || 0,
        tax,
        royalty,
      });
      setTaxEnabled(tax > 0);
      setRoyaltyEnabled(royalty > 0);
      lastSyncedKey.current = `${e.subcategory_id}@${copyStartAt}`;
    } else if (prefillClient) {
      form.setValue("client_id", prefillClient);
    }
  }, [existing.data, sourceForCopy.data, prefillClient, form]);

  // datetime-local already gives us "yyyy-MM-ddTHH:mm" in local time;
  // pass it through as a naive ISO string so the backend stores exactly what the
  // user typed (no UTC shift).
  const localIso = (s: string) => (s.length === 16 ? `${s}:00` : s);

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      eventsApi.create({
        subcategory_id: Number(values.subcategory_id),
        client_id: values.client_id ? Number(values.client_id) : null,
        start_at: localIso(values.start_at),
        duration_minutes: values.duration_minutes,
        notes: values.notes || null,
        price_per_hour: values.price_per_hour,
        tax: taxEnabled ? values.tax : 0,
        royalty: royaltyEnabled ? values.royalty : 0,
      }),
  });

  const update = useMutation({
    mutationFn: (values: FormValues) =>
      eventsApi.update(eventId!, {
        subcategory_id: Number(values.subcategory_id),
        client_id: values.client_id ? Number(values.client_id) : null,
        start_at: localIso(values.start_at),
        duration_minutes: values.duration_minutes,
        notes: values.notes || null,
        recalculate_price: !!values.recalculate_price,
        price_per_hour: values.price_per_hour,
        tax: taxEnabled ? values.tax : 0,
        royalty: royaltyEnabled ? values.royalty : 0,
      }),
  });

  const remove = useMutation({ mutationFn: () => eventsApi.remove(eventId!) });

  const invalidateAfterEventMutation = () => {
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["report"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
  };

  const onSubmit = (values: FormValues) => {
    setError(null);
    const mut = isEdit ? update : create;
    mut.mutate(values, {
      onSuccess: () => {
        invalidateAfterEventMutation();
        onSaved();
      },
      onError: (err: Error) => setError(err.message),
    });
  };

  const startAtValue = form.watch("start_at");
  const durationValue = form.watch("duration_minutes");
  const subcatValue = form.watch("subcategory_id");
  const clientValue = form.watch("client_id");
  const recalculateValue = form.watch("recalculate_price");
  const priceValue = form.watch("price_per_hour");
  const taxValue = form.watch("tax");
  const royaltyValue = form.watch("royalty");

  // Re-sync the price whenever the subcategory OR start_at changes.
  // Picks the most recent historical price whose effective_from ≤ the
  // chosen start_at (mirrors backend get_price_at). Falls back to the
  // subcategory's current_price if no historical row matches.
  // Initial load from an existing event / copy seeds lastSyncedKey with
  // the loaded pair so the very first run is skipped — the snapshot
  // price stays put until the user actually edits subcategory or date.
  useEffect(() => {
    if (!subcatValue || !cats.data) return;
    const key = `${subcatValue}@${startAtValue}`;
    if (key === lastSyncedKey.current) return;
    const subId = Number(subcatValue);
    for (const c of cats.data) {
      const s = c.subcategories.find((s) => s.id === subId);
      if (!s) continue;
      const startMs = startAtValue ? new Date(startAtValue).getTime() : Date.now();
      const applicable = (s.prices ?? [])
        .filter((p) => new Date(p.effective_from).getTime() <= startMs)
        .sort(
          (a, b) =>
            new Date(b.effective_from).getTime() -
            new Date(a.effective_from).getTime(),
        )[0];
      const priceStr = applicable?.price_per_hour ?? s.current_price;
      form.setValue(
        "price_per_hour",
        priceStr ? parseFloat(priceStr) || 0 : 0,
        { shouldDirty: true },
      );
      lastSyncedKey.current = key;
      break;
    }
  }, [subcatValue, startAtValue, cats.data, form]);

  const subcatGroups = useMemo(
    () =>
      (cats.data ?? []).map((c) => ({
        label: c.name,
        options: c.subcategories.map((s) => ({ value: String(s.id), label: s.name })),
      })),
    [cats.data],
  );

  const endLabel = useMemo(() => {
    if (!startAtValue || !durationValue) return "";
    try {
      const d = parseISO(startAtValue);
      if (Number.isNaN(d.getTime())) return "";
      return format(addMinutes(d, durationValue), "d MMMM, HH:mm", { locale: ru });
    } catch {
      return "";
    }
  }, [startAtValue, durationValue]);

  // Live calculation
  const calc = useMemo(() => {
    const price = Number(priceValue) || 0;
    const minutes = Number(durationValue) || 0;
    const gross = (price * minutes) / 60;
    const taxAmt = taxEnabled ? (gross * (Number(taxValue) || 0)) / 100 : 0;
    const royaltyAmt = royaltyEnabled ? (gross * (Number(royaltyValue) || 0)) / 100 : 0;
    const net = gross - taxAmt - royaltyAmt;
    return { gross, taxAmt, royaltyAmt, net };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceValue, durationValue, taxEnabled, taxValue, royaltyEnabled, royaltyValue]);

  const fmtMoney = (v: number) =>
    v.toLocaleString("ru-RU", { maximumFractionDigits: 0 });

  return (
    <>
      {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
      <form onSubmit={form.handleSubmit(onSubmit)} className="form">
        <div className="form-grid-2">
          <Field label="Подкатегория" error={form.formState.errors.subcategory_id?.message}>
            <Select
              value={subcatValue}
              onChange={(v) => form.setValue("subcategory_id", v)}
              placeholder="—"
              options={[]}
              groups={subcatGroups}
            />
          </Field>
          <Field label="Клиент">
            <SearchableSelect
              value={clientValue}
              onChange={(v) => form.setValue("client_id", v)}
              placeholder="— без клиента —"
              options={(clientsList.data ?? []).map((c) => ({ value: String(c.id), label: c.full_name }))}
            />
          </Field>
        </div>

        <div className="form-grid-2">
          <Field label="Дата и время" error={form.formState.errors.start_at?.message}>
            <DateTimePicker
              value={startAtValue}
              onChange={(v) => form.setValue("start_at", v, { shouldValidate: true })}
            />
            {endLabel && <span className="muted small">Окончание: {endLabel}</span>}
          </Field>
          <Field label="Длительность" error={form.formState.errors.duration_minutes?.message}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Input
                type="number"
                min={1}
                className="!w-24"
                style={{ width: "6rem" }}
                {...form.register("duration_minutes")}
              />
              <span className="muted small">мин</span>
            </div>
            <div className="dur-row" style={{ marginTop: 6 }}>
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={cn("chip", durationValue === p.value && "on")}
                  onClick={() => form.setValue("duration_minutes", p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Цена за час, ₽" error={form.formState.errors.price_per_hour?.message}>
          <Input
            type="number"
            min={0}
            step={1}
            style={{ maxWidth: "12rem" }}
            {...form.register("price_per_hour")}
          />
        </Field>

        <div className="form-grid-2 tax-royalty-row">
          <div className="field">
            <Toggle checked={taxEnabled} onChange={setTaxEnabled} label="Налог" />
            {taxEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  style={{ maxWidth: "6rem" }}
                  {...form.register("tax")}
                />
                <span className="muted small">% · {fmtMoney(calc.taxAmt)} ₽</span>
              </div>
            )}
          </div>

          <div className="field">
            <Toggle checked={royaltyEnabled} onChange={setRoyaltyEnabled} label="Роялти" />
            {royaltyEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  style={{ maxWidth: "6rem" }}
                  {...form.register("royalty")}
                />
                <span className="muted small">% · {fmtMoney(calc.royaltyAmt)} ₽</span>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            padding: "10px 12px",
            background: "var(--bg)",
            borderRadius: "var(--r-md)",
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <div>
            <span className="muted small">Сумма: </span>
            <span className="mono" style={{ fontWeight: 500 }}>
              {fmtMoney(calc.gross)} ₽
            </span>
          </div>
          {(taxEnabled || royaltyEnabled) && (
            <div>
              <span className="muted small">Чистыми: </span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {fmtMoney(calc.net)} ₽
              </span>
            </div>
          )}
        </div>

        <div className={cn("collapsible", notesOpen && "is-open")}>
          <button
            type="button"
            className="collapsible-head"
            onClick={() => setNotesOpen((o) => !o)}
            aria-expanded={notesOpen}
          >
            <span>Примечания</span>
            <ChevronDown size={16} className="collapsible-caret" />
          </button>
          {notesOpen && (
            <div className="collapsible-body">
              <Textarea
                rows={3}
                placeholder="Дополнительная информация"
                {...form.register("notes")}
              />
            </div>
          )}
        </div>

        {isEdit && (
          <label className="meta-row" style={{ cursor: "pointer", alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={!!recalculateValue}
              onChange={(e) => form.setValue("recalculate_price", e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ flex: 1 }}>
              Пересчитать цену по текущему тарифу
              <span className="muted small" style={{ display: "block" }}>
                По умолчанию сохраняется зафиксированная стоимость
              </span>
            </span>
          </label>
        )}

        <div className="form-actions">
          <Button type="button" variant="danger" onClick={onCancel}>
            Отмена
          </Button>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isEdit && eventId !== undefined && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="btn-collapse-mobile"
                  icon={<Copy size={14} />}
                  onClick={() => onCopy?.(eventId)}
                  aria-label="Копировать"
                >
                  Копировать
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="btn-collapse-mobile"
                  icon={<Trash2 size={14} />}
                  onClick={() => {
                    if (confirm("Удалить событие?")) {
                      remove.mutate(undefined, {
                        onSuccess: () => {
                          invalidateAfterEventMutation();
                          onSaved();
                        },
                      });
                    }
                  }}
                  aria-label="Удалить"
                >
                  Удалить
                </Button>
              </>
            )}
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {isEdit ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

/** URL-driven page wrapper around <EventForm>. Routes still point here so
 *  direct links (`/events/new`, `/events/:id/edit`) keep working. */
export function EventFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const eventId = isEdit ? Number(id) : undefined;
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const copyId = searchParams.get("copy");
  const prefillClient = searchParams.get("client");

  return (
    <div className="page">
      <div className="back-link" onClick={() => nav("/events")}>← События</div>
      <div className="page-head">
        <h1 className="h1">{isEdit ? "Редактирование события" : "Новое событие"}</h1>
      </div>
      <Card style={{ maxWidth: 640 }}>
        <EventForm
          eventId={eventId}
          copyId={copyId ? Number(copyId) : undefined}
          prefillClient={prefillClient ?? undefined}
          onCancel={() => nav(-1)}
          onSaved={() => nav("/events")}
          onCopy={(srcId) => nav(`/events/new?copy=${srcId}`)}
        />
      </Card>
    </div>
  );
}

/** Modal wrapper that hosts the same EventForm for Events list flows. */
export function EventFormModal({
  open,
  eventId,
  copyId,
  prefillClient,
  onClose,
  onSaved,
  onCopy,
}: {
  open: boolean;
  eventId?: number;
  copyId?: number;
  prefillClient?: string;
  onClose: () => void;
  onSaved: () => void;
  onCopy?: (id: number) => void;
}) {
  const title = eventId !== undefined ? "Редактирование события" : "Новое событие";
  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={title}
      size="lg"
    >
      <EventForm
        eventId={eventId}
        copyId={copyId}
        prefillClient={prefillClient}
        onCancel={onClose}
        onSaved={onSaved}
        onCopy={onCopy}
      />
    </Modal>
  );
}
