import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Modal, Textarea } from "@/components/design";
import { clients as clientsApi } from "@/lib/api";
import type { Client } from "@/types/api";

const schema = z.object({
  first_name: z.string().min(1, "Введите имя"),
  last_name: z.string(),
  phone: z.string(),
  telegram: z.string(),
  notes: z.string(),
});
type FormValues = z.infer<typeof schema>;

export function ClientFormModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client | null;
  onClose: () => void;
  onSaved?: (saved: Client) => void;
}) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: client?.first_name || "",
      last_name: client?.last_name || "",
      phone: client?.phone || "",
      telegram: client?.telegram || "",
      notes: client?.notes || "",
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      client ? clientsApi.update(client.id, values) : clientsApi.create(values),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      onSaved?.(saved);
      onClose();
    },
  });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={client ? "Редактирование клиента" : "Новый клиент"}
      footer={
        <>
          <Button type="button" variant="danger" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={form.handleSubmit((v) => save.mutate(v))}
            disabled={save.isPending}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <form className="form" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        {save.isError && (
          <div className="login-error">
            {(save.error as Error).message || "Не удалось сохранить"}
          </div>
        )}
        <div className="form-grid-2">
          <Field label="Имя" error={form.formState.errors.first_name?.message}>
            <Input placeholder="Анна" {...form.register("first_name")} />
          </Field>
          <Field label="Фамилия">
            <Input placeholder="Морозова" {...form.register("last_name")} />
          </Field>
        </div>
        <Field label="Телефон">
          <Input type="tel" placeholder="+7 ..." {...form.register("phone")} />
        </Field>
        <Field label="Telegram">
          <Input placeholder="username" {...form.register("telegram")} />
        </Field>
        <Field label="Примечание">
          <Textarea rows={2} placeholder="Что важно помнить" {...form.register("notes")} />
        </Field>
      </form>
    </Modal>
  );
}
