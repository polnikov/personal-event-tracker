import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useIsRestoring } from "@tanstack/react-query";
import { Button, Card, Field, Input } from "@/components/design";
import { useLogin, useMe } from "@/hooks/useAuth";

const schema = z.object({
  username: z.string().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль"),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const isRestoring = useIsRestoring();
  const me = useMe();
  const login = useLogin();
  const nav = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  // Don't flash the login form while the persisted cache is still restoring —
  // an already-authenticated session may be about to hydrate (e.g. a cold
  // offline reload landing here), in which case we redirect home below.
  if (isRestoring) {
    return <div className="login-shell muted">Загрузка…</div>;
  }

  if (me.data?.authenticated) return <Navigate to="/" replace />;

  const onSubmit = (values: FormValues) => {
    setError(null);
    login.mutate(values, {
      onSuccess: () => nav(location.state?.from?.pathname || "/", { replace: true }),
      onError: (err: Error) => setError(err.message || "Ошибка входа"),
    });
  };

  return (
    <div className="login-shell">
      <Card className="login-card">
        <div className="login-brand">
          <img src="/icon.png" alt="Tracker" className="brand-mark brand-mark-lg" />
          <div className="brand-name" style={{ fontSize: 20 }}>Tracker</div>
        </div>
        <h2 className="h2" style={{ marginTop: 28 }}>Вход в трекер</h2>
        <div className="muted" style={{ marginBottom: 24 }}>Введите данные, чтобы продолжить</div>
        {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
        <form onSubmit={form.handleSubmit(onSubmit)} className="form">
          <Field label="Логин" error={form.formState.errors.username?.message}>
            <Input autoComplete="username" {...form.register("username")} />
          </Field>
          <Field label="Пароль" error={form.formState.errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
          </Field>
          <Button type="submit" block disabled={login.isPending}>
            {login.isPending ? "Вход…" : "Войти"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
