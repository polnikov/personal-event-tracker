import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMinutes, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Copy, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from "@/components/design";
import { categories as categoriesApi, clients as clientsApi, events as eventsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

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

export function EventFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const eventId = isEdit ? Number(id) : undefined;
  const nav = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const copyId = searchParams.get("copy");
  const prefillClient = searchParams.get("client");
  const [error, setError] = useState<string | null>(null);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [royaltyEnabled, setRoyaltyEnabled] = useState(false);

  // Tracks the last subcategory id we synced price from. Used to detect
  // user-driven changes vs. initial reset from existing/copy data.
  const lastSyncedSubcat = useRef<string>("");

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.list() });
  const clientsList = useQuery({ queryKey: ["clients", ""], queryFn: () => clientsApi.list("") });
  const existing = useQuery({
    queryKey: ["events", "detail", eventId],
    queryFn: () => eventsApi.detail(eventId!),
    enabled: isEdit,
  });
  const sourceForCopy = useQuery({
    queryKey: ["events", "detail", "copy", copyId],
    queryFn: () => eventsApi.detail(Number(copyId)),
    enabled: !isEdit && !!copyId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      subcategory_id: "",
      client_id: "",
      start_at: "",
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
      lastSyncedSubcat.current = String(e.subcategory_id);
    } else if (sourceForCopy.data) {
      const e = sourceForCopy.data;
      const tax = parseFloat(e.tax) || 0;
      const royalty = parseFloat(e.royalty) || 0;
      form.reset({
        subcategory_id: String(e.subcategory_id),
        client_id: e.client_id ? String(e.client_id) : "",
        start_at: "",
        duration_minutes: e.duration_minutes,
        notes: e.notes || "",
        recalculate_price: false,
        price_per_hour: parseFloat(e.hourly_rate_snapshot) || 0,
        tax,
        royalty,
      });
      setTaxEnabled(tax > 0);
      setRoyaltyEnabled(royalty > 0);
      lastSyncedSubcat.current = String(e.subcategory_id);
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
        nav("/events");
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

  // Update price whenever the user changes the subcategory.
  // Skip the initial sync triggered by loading an existing event or a copy
  // (lastSyncedSubcat is set to that value so we don't overwrite the snapshot price).
  useEffect(() => {
    if (!subcatValue || !cats.data) return;
    if (subcatValue === lastSyncedSubcat.current) return;
    const subId = Number(subcatValue);
    for (const c of cats.data) {
      const s = c.subcategories.find((s) => s.id === subId);
      if (s) {
        form.setValue(
          "price_per_hour",
          s.current_price ? parseFloat(s.current_price) || 0 : 0,
          { shouldDirty: true },
        );
        lastSyncedSubcat.current = subcatValue;
        break;
      }
    }
  }, [subcatValue, cats.data, form]);

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
    <div className="page">
      <div className="back-link" onClick={() => nav("/events")}>← События</div>
      <div className="page-head">
        <h1 className="h1">{isEdit ? "Редактирование события" : "Новое событие"}</h1>
      </div>

      <Card style={{ maxWidth: 640 }}>
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
              <Select
                value={clientValue}
                onChange={(v) => form.setValue("client_id", v)}
                placeholder="— без клиента —"
                options={(clientsList.data ?? []).map((c) => ({ value: String(c.id), label: c.full_name }))}
              />
            </Field>
          </div>

          <div className="form-grid-2">
            <Field label="Дата и время" error={form.formState.errors.start_at?.message}>
              <Input type="datetime-local" {...form.register("start_at")} />
              {endLabel && <span className="muted small">Окончание: {endLabel}</span>}
            </Field>
            <Field label="Длительность" error={form.formState.errors.duration_minutes?.message}>
              <div className="dur-row">
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Input
                  type="number"
                  min={1}
                  className="!w-24"
                  style={{ width: "6rem" }}
                  {...form.register("duration_minutes")}
                />
                <span className="muted small">мин</span>
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

          <div className="form-grid-2">
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

          <Field label="Примечания">
            <Textarea rows={3} placeholder="Дополнительная информация" {...form.register("notes")} />
          </Field>

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
            <Button type="button" variant="danger" onClick={() => nav("/events")}>
              Отмена
            </Button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isEdit && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="btn-collapse-mobile"
                    icon={<Copy size={14} />}
                    onClick={() => nav(`/events/new?copy=${eventId}`)}
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
                            nav("/events");
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
      </Card>
    </div>
  );
}
