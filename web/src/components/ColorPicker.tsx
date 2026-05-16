import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Metronic-style curated palette (5 cols × 4 rows = 20)
const PRESETS = [
  "#F1416C", "#FF6B6B", "#FFA94D", "#FFD43B", "#FACA15",
  "#7BB661", "#50CD89", "#00BFA5", "#0EA5E9", "#0969DA",
  "#6366F1", "#7239EA", "#A855F7", "#EC4899", "#D9A86C",
  "#C26B6B", "#94A3B8", "#5E6278", "#181C32", "#14110F",
];

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isSelected = (c: string) => value.toLowerCase() === c.toLowerCase();

  return (
    <div ref={ref} className="color-picker">
      <button
        type="button"
        className="color-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        style={{ background: value }}
        aria-label="Выбрать цвет"
        title={value}
      />
      {open && (
        <div className="color-picker-pop">
          <div className="color-picker-label">Палитра</div>
          <div className="color-picker-grid">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={cn("color-swatch", isSelected(c) && "selected")}
                style={{ background: c }}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                title={c}
              >
                {isSelected(c) && (
                  <Check size={12} strokeWidth={3} color="#FFFFFF" />
                )}
              </button>
            ))}
          </div>
          <div className="color-picker-custom">
            <span className="muted small">Свой:</span>
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="color-round"
              style={{ width: 28, height: 28 }}
            />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="input"
              style={{ fontFamily: "var(--font-mono)", flex: 1, minWidth: 0 }}
              maxLength={7}
            />
          </div>
        </div>
      )}
    </div>
  );
}
