import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/design";
import { categories as categoriesApi, clients as clientsApi, OfflineQueuedError } from "@/lib/api";
import { effectivePrice } from "@/lib/eventCalc";
import type { Subscription } from "@/types/api";

const schema = z.object({
  category_id: z.string().min(1, "Выберите категорию"),
  subcategory_id: z.string().min(1, "Выберите подкатегорию"),
  lessons_total: z.coerce.number().gt(0, "Больше нуля"),
  price_per_lesson: z.coerce.number().min(0),
  notes: z.string(),
});
type FormValues = z.infer<typeof schema>;

/**
 * Create/edit a prepaid package on a client. One lesson equals one hour, so
 * "стоимость занятия" is also the hourly rate charged to events booked
 * against the package.
 */
export function SubscriptionFormModal({
  clientId,
  subscription,
  onClose,
}: {
  clientId: number;
  subscription: Subscription | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category_id: subscription ? String(subscription.category_id) : "",
      subcategory_id: subscription ? String(subscription.subcategory_id) : "",
      lessons_total: subscription ? subscription.lessons_total : 10,
      price_per_lesson: subscription ? parseFloat(subscription.price_per_lesson) || 0 : 0,
      notes: subscription?.notes || "",
    },
  });

  const categoryValue = form.watch("category_id");
  const subcatValue = form.watch("subcategory_id");
  const priceTouched = useRef(subscription !== null);

  const subOptions = useMemo(() => {
    const cat = (cats.data ?? []).find((c) => String(c.id) === categoryValue);
    return (cat?.subcategories ?? []).map((s) => ({ value: String(s.id), label: s.name }));
  }, [cats.data, categoryValue]);

  // Changing the category invalidates the subcategory choice.
  useEffect(() => {
    if (subcatValue && !subOptions.some((o) => o.value === subcatValue)) {
      form.setValue("subcategory_id", "");
    }
  }, [subOptions, subcatValue]);

  // Seed the lesson price from the subcategory's current tariff until the
  // user types their own number.
  useEffect(() => {
    if (priceTouched.current || !subcatValue) return;
    const sub = (cats.data ?? [])
      .flatMap((c) => c.subcategories)
      .find((s) => String(s.id) === subcatValue);
    if (sub) form.setValue("price_per_lesson", effectivePrice(sub, Date.now()));
  }, [cats.data, subcatValue]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        subcategory_id: Number(values.subcategory_id),
        lessons_total: values.lessons_total,
        price_per_lesson: values.price_per_lesson,
        notes: values.notes.trim() || null,
      };
      return subscription
        ? clientsApi.updateSubscription(subscription.id, payload)
        : clientsApi.createSubscription(clientId, payload);
    },
  });

  const remove = useMutation({
    mutationFn: () => clientsApi.removeSubscription(subscription!.id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["events"] });
  };

  const run = (mut: typeof save | typeof remove, values?: FormValues) => {
    setError(null);
    mut.mutate(values as never, {
      onSuccess: () => {
        invalidate();
        onClose();
      },
      onError: (err: Error) => {
        // Offline — queued in the outbox; close so the user can keep working.
        if (err instanceof OfflineQueuedError) {
          invalidate();
          onClose();
          return;
        }
        setError(err.message);
      },
    });
  };

  const pending = save.isPending || remove.isPending;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={subscription ? "Редактирование абонемента" : "Новый абонемент"}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          {subscription && (
            <Button
              type="button"
              variant="danger"
              onClick={() => run(remove)}
              disabled={pending}
            >
              Удалить
            </Button>
          )}
          <Button
            type="button"
            onClick={form.handleSubmit((v) => run(save, v))}
            disabled={pending}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={form.handleSubmit((v) => run(save, v))}>
        {error && <div className="login-error">{error}</div>}
        <div className="form-grid-2">
          <Field label="Категория" error={form.formState.errors.category_id?.message}>
            <Select
              value={categoryValue}
              onChange={(v) => form.setValue("category_id", v)}
              placeholder="Выберите"
              options={(cats.data ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
            />
          </Field>
          <Field label="Подкатегория" error={form.formState.errors.subcategory_id?.message}>
            <Select
              value={subcatValue}
              onChange={(v) => form.setValue("subcategory_id", v)}
              placeholder="Выберите"
              options={subOptions}
            />
          </Field>
        </div>
        <div className="form-grid-2">
          <Field label="Занятий" error={form.formState.errors.lessons_total?.message}>
            <Input
              type="number"
              step="0.5"
              min="0.5"
              {...form.register("lessons_total")}
            />
          </Field>
          <Field
            label="Стоимость занятия, ₽"
            error={form.formState.errors.price_per_lesson?.message}
          >
            <Input
              type="number"
              step="10"
              min="0"
              {...form.register("price_per_lesson", {
                onChange: () => {
                  priceTouched.current = true;
                },
              })}
            />
          </Field>
        </div>
        <Field label="Примечание">
          <Textarea rows={2} placeholder="Что важно помнить" {...form.register("notes")} />
        </Field>
        <div className="muted small">
          Одно занятие равно одному часу: событие на 1,5 часа спишет 1,5 занятия.
        </div>
      </form>
    </Modal>
  );
}
