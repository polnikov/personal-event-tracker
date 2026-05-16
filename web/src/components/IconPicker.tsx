import { useState } from "react";
import { Check, Search, X } from "lucide-react";
import { AppIcon, PHOSPHOR_ICONS, PHOSPHOR_NAMES } from "@/components/phosphor";
import { cn } from "@/lib/utils";

export function IconPicker({
  value,
  onChange,
  color,
}: {
  value: string | null | undefined;
  onChange: (icon: string | null) => void;
  color?: string;
}) {
  const [q, setQ] = useState("");
  const filter = q.trim().toLowerCase();
  const items = filter
    ? PHOSPHOR_NAMES.filter((n) => n.includes(filter))
    : PHOSPHOR_NAMES;

  return (
    <div className="icon-picker">
      <div className="input-wrap has-icon" style={{ marginBottom: 10 }}>
        <span className="input-icon"><Search size={14} /></span>
        <input
          className="input"
          placeholder="Поиск иконки…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {value && (
          <button
            type="button"
            className="input-clear"
            onClick={() => onChange(null)}
            aria-label="Сбросить иконку"
            tabIndex={-1}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
      <div className="icon-grid">
        {items.map((name) => {
          const Cmp = PHOSPHOR_ICONS[name];
          const selected = value === name;
          return (
            <button
              key={name}
              type="button"
              className={cn("icon-cell", selected && "selected")}
              onClick={() => onChange(name)}
              title={name}
              style={selected && color ? { color, borderColor: color } : undefined}
            >
              <Cmp size={20} weight="duotone" />
              {selected && (
                <span className="icon-cell-check">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
        {items.length === 0 && <div className="muted small">Ничего не найдено</div>}
      </div>
      {value && (
        <div className="icon-picker-preview">
          <span className="muted small">Выбрано:</span>
          <span className="icon-cell selected" style={{ width: 28, height: 28, color }}>
            <AppIcon name={value} size={18} color={color} />
          </span>
          <span className="small mono muted">{value}</span>
        </div>
      )}
    </div>
  );
}
