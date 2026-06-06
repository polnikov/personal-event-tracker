import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Modal } from "@/components/design";
import { clubs as clubsApi, OfflineQueuedError } from "@/lib/api";
import type { Club } from "@/types/api";

const schema = z.object({
  name: z.string().min(1, "Введите название"),
  address: z.string(),
});
type FormValues = z.infer<typeof schema>;

export function ClubFormModal({
  club,
  onClose,
  onSaved,
}: {
  club: Club | null;
  onClose: () => void;
  onSaved?: (saved: Club) => void;
}) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: club?.name || "",
      address: club?.address || "",
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = { name: values.name.trim(), address: values.address.trim() || null };
      return club ? clubsApi.update(club.id, payload) : clubsApi.create(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      // A club's name/address can change the label shown on events/categories.
      qc.invalidateQueries({ queryKey: ["events"] });
      onSaved?.(saved);
      onClose();
    },
    onError: (err: Error) => {
      if (err instanceof OfflineQueuedError) {
        qc.invalidateQueries({ queryKey: ["clubs"] });
        onClose();
      }
    },
  });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={club ? "Редактирование клуба" : "Новый клуб"}
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
        <Field label="Название" error={form.formState.errors.name?.message}>
          <Input placeholder="Например, Корт №1" {...form.register("name")} />
        </Field>
        <Field label="Адрес">
          <Input placeholder="Город, улица, дом" {...form.register("address")} />
        </Field>
      </form>
    </Modal>
  );
}
