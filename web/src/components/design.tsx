import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt, initials, stringToColor } from "@/lib/format";
import type { EventItem } from "@/types/api";
import { AppIcon } from "@/components/phosphor";

// Icon lookup maps used by EventLineRow. Build once per page via
// useMemo over the categories query response and pass in.
export interface EventLineIconMaps {
  catColors: Map<number, string>;
  catIcons: Map<number, string | null>;
  subcatIcons: Map<number, string | null>;
}

export function buildEventLineIconMaps(
  cats:
    | Array<{
        id: number;
        color: string;
        icon: string | null;
        subcategories: Array<{ id: number; icon: string | null }>;
      }>
    | undefined,
): EventLineIconMaps {
  const catIcons = new Map<number, string | null>();
  const catColors = new Map<number, string>();
  const subcatIcons = new Map<number, string | null>();
  for (const c of cats ?? []) {
    catIcons.set(c.id, c.icon);
    catColors.set(c.id, c.color);
    for (const s of c.subcategories) subcatIcons.set(s.id, s.icon);
  }
  return { catIcons, catColors, subcatIcons };
}

// ──────────────────────────────────────────────────────────
// Card

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "p-0" | "p-4" | "p-6";
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding = "p-6", interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("card", padding, interactive && "card-hover", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

// ──────────────────────────────────────────────────────────
// Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  block?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", icon, iconRight, block, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn("btn", `btn-${variant}`, `btn-${size}`, block && "btn-block", className)}
      {...props}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      {children && <span>{children}</span>}
      {iconRight && <span className="btn-icon">{iconRight}</span>}
    </button>
  ),
);
Button.displayName = "Button";

// ──────────────────────────────────────────────────────────
// IconButton

export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean; danger?: boolean }
>(({ className, small, danger, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn("icon-btn", small && "small", danger && "tone-danger", className)}
    {...props}
  />
));
IconButton.displayName = "IconButton";

// ──────────────────────────────────────────────────────────
// Input

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  onClear?: () => void;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, onClear, className, value, ...props }, ref) => {
    const showClear = !!onClear && value !== undefined && value !== "" && value !== null;
    return (
      <div className={cn("input-wrap", icon && "has-icon", showClear && "has-clear")}>
        {icon && <span className="input-icon">{icon}</span>}
        <input ref={ref} className={cn("input", className)} value={value} {...props} />
        {showClear && (
          <button
            type="button"
            className="input-clear"
            onClick={onClear}
            aria-label="Очистить"
            tabIndex={-1}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("textarea", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

// ──────────────────────────────────────────────────────────
// Select (native)

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  groups?: { label: string; options: SelectOption[] }[];
}

export function Select({ value, onChange, options, placeholder, className, groups }: SelectProps) {
  return (
    <div className={cn("select-wrap", className)}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {groups
          ? groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))
          : options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
      </select>
      <span className="select-chev">
        <ChevronDown size={14} />
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Avatar — colorful initials block

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const inits = initials(name || "?");
  const bg = color || stringToColor(name || "?");
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
    >
      {inits}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// CategoryDot / Badge

export function CategoryDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="cat-dot" style={{ width: size, height: size, background: color }} />;
}

export function CategoryBadge({
  categoryName,
  categoryColor,
  subcategoryName,
}: {
  categoryName: string;
  categoryColor: string;
  subcategoryName?: string;
}) {
  return (
    <span className="cat-badge">
      <CategoryDot color={categoryColor} />
      <span className="cat-name">{categoryName}</span>
      {subcategoryName && <span className="cat-sub">· {subcategoryName}</span>}
    </span>
  );
}

// ──────────────────────────────────────────────────────────
// Tabs — pill-style segmented control

interface TabOption<V extends string> {
  value: V;
  label: React.ReactNode;
}

export function Tabs<V extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  options: TabOption<V>[];
  className?: string;
}) {
  return (
    <div className={cn("view-switcher", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cn("view-switch-btn", value === o.value && "on")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Toggle — pill switch with label to the right

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("toggle", disabled && "is-disabled")}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="toggle-input"
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}

// ──────────────────────────────────────────────────────────
// Field

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <div className="field-label">{label}</div>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

// ──────────────────────────────────────────────────────────
// Empty

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
      {action}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Modal — Radix Dialog wrapped with design styling

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  hideTitle?: boolean;
  ariaLabel?: string;
  size?: "md" | "lg";
  footer?: React.ReactNode;
  children: React.ReactNode;
  noFooterBorder?: boolean;
  bodyClassName?: string;
}

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function Modal({
  open,
  onOpenChange,
  title,
  hideTitle,
  ariaLabel,
  size = "md",
  footer,
  children,
  noFooterBorder,
  bodyClassName,
}: ModalProps) {
  const a11yTitle = title || ariaLabel || "Диалог";
  const visualTitle = !hideTitle && title;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay" />
        <DialogPrimitive.Content className={cn("modal-content", size === "lg" && "modal-lg")}>
          {visualTitle ? (
            <div className="modal-head">
              <DialogPrimitive.Title className="modal-title">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <IconButton aria-label="Закрыть"><X size={16} /></IconButton>
              </DialogPrimitive.Close>
            </div>
          ) : (
            <>
              <DialogPrimitive.Title style={srOnly}>{a11yTitle}</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <IconButton aria-label="Закрыть" className="modal-close-floating">
                  <X size={16} />
                </IconButton>
              </DialogPrimitive.Close>
            </>
          )}
          <div className={cn("modal-body", !visualTitle && "modal-body-no-head", bodyClassName)}>{children}</div>
          {footer && (
            <div className={cn("modal-foot", noFooterBorder && "modal-foot-no-border")}>{footer}</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ──────────────────────────────────────────────────────────
// MiniBars

export function MiniBars({
  data,
  height = 60,
  color = "var(--accent)",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="mini-bars" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="mini-bar-col" title={`${d.label}: ${d.value}`}>
          <div
            className="mini-bar-fill"
            style={{ height: `${(d.value / max) * 100}%`, background: color }}
          />
          <div className="mini-bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// StackedBars — стек по категориям, по одному столбцу на каждую дату

interface StackedBarsSeries {
  name: string;
  color: string;
  values: number[];
}

export function StackedBars({
  dates,
  series,
  height = 180,
}: {
  dates: string[];
  series: StackedBarsSeries[];
  height?: number;
}) {
  if (dates.length === 0) {
    return <div className="muted small" style={{ marginTop: 16 }}>Нет данных</div>;
  }
  const totals = dates.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] || 0), 0));
  const max = Math.max(...totals, 1);
  const labelEvery = dates.length > 14 ? Math.ceil(dates.length / 10) : 1;

  return (
    <div className="stacked-bars" style={{ height }}>
      {dates.map((d, i) => {
        const total = totals[i];
        const totalPct = (total / max) * 100;
        const day = parseInt(d.slice(8, 10), 10);
        const showLabel = i % labelEvery === 0;
        return (
          <div key={d} className="stacked-bar-col" title={`${d}: ${total.toLocaleString("ru-RU")} ₽`}>
            <div className="stacked-bar-stack" style={{ height: `${totalPct}%` }}>
              {total > 0 &&
                series.map((s) => {
                  const v = s.values[i] || 0;
                  if (!v) return null;
                  const segPct = (v / total) * 100;
                  return (
                    <div
                      key={s.name}
                      className="stacked-bar-seg"
                      style={{ height: `${segPct}%`, background: s.color }}
                    />
                  );
                })}
            </div>
            <div className="stacked-bar-label">{showLabel ? day : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Donut

export function Donut({
  data,
  size = 160,
  thickness = 18,
}: {
  data: { value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
      {data.map((d, i) => {
        const frac = d.value / total;
        const dash = frac * C;
        const offset = -acc * C;
        acc += frac;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          />
        );
      })}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────
// KPI

import { ArrowDown, ArrowUp } from "lucide-react";

export function KPI({ label, value, delta }: { label: string; value: React.ReactNode; delta?: number }) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta !== undefined && (
        <div className={cn("kpi-delta", positive ? "pos" : "neg")}>
          {positive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          <span>{Math.abs(delta).toFixed(1)}%</span>
          <span className="muted small">за период</span>
        </div>
      )}
    </Card>
  );
}

// ──────────────────────────────────────────────────────────
// EventRow — compact (used on Dashboard, ClientDetail)

export function EventRow({
  ev,
  onClick,
  showDate = true,
}: {
  ev: EventItem;
  onClick?: () => void;
  showDate?: boolean;
}) {
  const d = new Date(ev.start_at);
  return (
    <div className={cn("event-row", !showDate && "no-date")} onClick={onClick}>
      {showDate && (
        <div className="event-date">
          <div className="event-day">{d.getDate()}</div>
          <div className="event-mon">{fmt.monthShort(ev.start_at)}</div>
        </div>
      )}
      <div className="event-time">
        <CategoryDot color={ev.subcategory.category_color} size={6} />
        <span>{fmt.time(ev.start_at)}</span>
      </div>
      <div className="event-info">
        <div className="event-title">{ev.subcategory.name}</div>
        <div className="event-sub muted small">
          {ev.client ? ev.client.full_name : "Без клиента"}
        </div>
      </div>
      <div className="event-cost mono">{fmt.money(ev.total_cost)} ₽</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// EventTableRow — wider (used on Events page)

export function EventTableRow({
  ev,
  onClick,
  onClient,
  showDate = true,
  notesInsteadOfClient = false,
  costOverride,
  dateLabel,
}: {
  ev: EventItem;
  onClick?: () => void;
  onClient?: (id: number) => void;
  showDate?: boolean;
  notesInsteadOfClient?: boolean;
  costOverride?: number | string;
  /** Override the formatted date in the when-cell (e.g. "12 пн"). */
  dateLabel?: React.ReactNode;
}) {
  return (
    <div className="event-trow" onClick={onClick}>
      <div className="event-trow-when">
        {showDate && (
          <div className="event-trow-date">
            {dateLabel ?? fmt.date(ev.start_at)}
          </div>
        )}
        <div className="event-trow-time">{fmt.time(ev.start_at)}</div>
      </div>
      <div className="event-trow-cat">
        <CategoryBadge
          categoryName={ev.subcategory.category_name}
          categoryColor={ev.subcategory.category_color}
          subcategoryName={ev.subcategory.name}
        />
      </div>
      <div className="event-trow-client">
        {notesInsteadOfClient ? (
          ev.notes ? (
            <span className="muted small" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ev.notes}>
              {ev.notes}
            </span>
          ) : (
            <span className="muted">—</span>
          )
        ) : ev.client ? (
          <span
            className="link"
            onClick={(e) => {
              e.stopPropagation();
              onClient?.(ev.client!.id);
            }}
          >
            {ev.client.full_name}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div className="event-trow-dur muted small">{fmt.duration(ev.duration_minutes)}</div>
      <div className="event-trow-cost mono">
        {fmt.money(costOverride !== undefined ? costOverride : ev.total_cost)} ₽
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// EventLineRow — single-line row used on Events page and (via this
// shared component) on Dashboard "Ближайшие", Calendar List,
// ClientDetail past/future and Report royalty. Variant props:
//   - dateLabel  → prefix the time block with a custom date label
//                  (e.g. "12 пн" for month-grouped lists)
//   - costOverride → replace the right-side cost amount
//                  (e.g. royalty amount on the Report page)
//   - clientOverride → replace the clickable client pill with custom
//                  text (e.g. notes on ClientDetail); pass null to hide
//   - hideClient → omit the client cell entirely

export function EventLineRow({
  ev,
  icons,
  onClick,
  onClient,
  dateLabel,
  costOverride,
  clientOverride,
  hideClient,
}: {
  ev: EventItem;
  icons: EventLineIconMaps;
  onClick?: () => void;
  onClient?: (id: number) => void;
  dateLabel?: React.ReactNode;
  costOverride?: number | string;
  clientOverride?: React.ReactNode;
  hideClient?: boolean;
}) {
  const catId = ev.subcategory.category_id;
  const catColor = icons.catColors.get(catId) || ev.subcategory.category_color;
  const subcatIcon = icons.subcatIcons.get(ev.subcategory.id);
  return (
    <div className="events-row" onClick={onClick}>
      {dateLabel !== undefined ? (
        <span className="events-row-date">{dateLabel}</span>
      ) : null}
      <span className="events-row-time-start">{fmt.time(ev.start_at)}</span>
      <span className="events-row-time-sep">–</span>
      <span className="events-row-time-end">{fmt.time(ev.end_at)}</span>
      <span className="events-row-cat">
        <span className="events-row-cat-dot" style={{ background: catColor }} />
        <span className="events-row-cat-name">{ev.subcategory.category_name}</span>
      </span>
      <span className="events-row-sub">
        {subcatIcon && (
          <span className="events-row-sub-icon">
            <AppIcon name={subcatIcon} size={14} weight="duotone" color={catColor} />
          </span>
        )}
        <span className="events-row-sub-name">{ev.subcategory.name}</span>
      </span>
      {!hideClient && (
        clientOverride !== undefined ? (
          <span className="events-row-client events-row-client-static">
            {clientOverride}
          </span>
        ) : ev.client ? (
          <span
            className="events-row-client"
            onClick={(e) => {
              e.stopPropagation();
              onClient?.(ev.client!.id);
            }}
          >
            {ev.client.full_name}
          </span>
        ) : null
      )}
      <span className="events-row-cost">
        {fmt.money(costOverride !== undefined ? costOverride : ev.total_cost)} ₽
      </span>
    </div>
  );
}
