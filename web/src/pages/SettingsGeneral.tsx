import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, Input } from "@/components/design";
import { settings as settingsApi, OfflineQueuedError } from "@/lib/api";

/** Percent input guard: empty and out-of-range values block the save. */
function pctError(raw: string): string | null {
  if (raw.trim() === "") return "Укажите значение";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Число от 0 до 100";
  if (n < 0 || n > 100) return "От 0 до 100";
  return null;
}

/** Настройки → Общие. Currently one block: the percentages the event form
 *  pre-fills when the Налог / Роялти toggles are switched on. */
export function SettingsGeneralPage() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["settings"], queryFn: () => settingsApi.get() });

  const [tax, setTax] = useState("");
  const [royalty, setRoyalty] = useState("");
  // "queued" = saved offline; the outbox replays it once the app is back on.
  const [saved, setSaved] = useState<null | "ok" | "queued">(null);

  // Seed the inputs once the values land (and after a refetch).
  useEffect(() => {
    if (!data.data) return;
    setTax(String(Number(data.data.default_tax)));
    setRoyalty(String(Number(data.data.default_royalty)));
  }, [data.data]);

  const taxError = pctError(tax);
  const royaltyError = pctError(royalty);
  const invalid = Boolean(taxError || royaltyError);

  const save = useMutation({
    mutationFn: () =>
      settingsApi.update({ default_tax: Number(tax), default_royalty: Number(royalty) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSaved("ok");
    },
    onError: (err: Error) => {
      if (err instanceof OfflineQueuedError) {
        qc.invalidateQueries({ queryKey: ["settings"] });
        setSaved("queued");
      }
    },
  });

  const failed = save.isError && !(save.error instanceof OfflineQueuedError);

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="h2">Значения по умолчанию</h2>
          <div className="muted">
            Подставляются в форме события при включении тоглов Налог и Роялти
          </div>
        </div>
      </div>

      <Card>
        {data.isLoading ? (
          <div className="muted small">Загрузка…</div>
        ) : data.isError ? (
          <div className="muted small">Не удалось загрузить настройки</div>
        ) : (
          <div className="form">
            <div className="form-grid-2">
              <Field label="Налог, %" error={taxError ?? undefined}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  style={{ maxWidth: "8rem" }}
                  value={tax}
                  onChange={(e) => {
                    setTax(e.target.value);
                    setSaved(null);
                  }}
                />
              </Field>
              <Field label="Роялти, %" error={royaltyError ?? undefined}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  style={{ maxWidth: "8rem" }}
                  value={royalty}
                  onChange={(e) => {
                    setRoyalty(e.target.value);
                    setSaved(null);
                  }}
                />
              </Field>
            </div>
            <div className="form-actions">
              {saved === "ok" && <span className="muted small">Сохранено</span>}
              {saved === "queued" && (
                <span className="muted small">Сохранится, когда появится сеть</span>
              )}
              {failed && <span className="field-error">Не удалось сохранить</span>}
              <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
                {save.isPending ? "Сохранение…" : "Сохранить"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
