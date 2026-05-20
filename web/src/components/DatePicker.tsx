import * as React from "react";
import { format, parse } from "date-fns";
import { ru } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ISO = "yyyy-MM-dd";

function isoToDate(v: string | undefined | null): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, ISO, new Date());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

interface DatePickerProps {
  /** ISO yyyy-MM-dd string (empty = no value). */
  value: string;
  /** Receives "" when the user clears, or ISO yyyy-MM-dd. */
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Date input that opens a Shadcn-style Calendar popover. Value/onChange
 *  use ISO yyyy-MM-dd strings to stay compatible with the existing form
 *  state and the `type="date"` inputs it replaces. */
export function DatePicker({
  value,
  onChange,
  placeholder = "Выберите дату",
  allowClear = true,
  disabled,
  className,
  ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = isoToDate(value);
  const label = selected ? format(selected, "d MMMM yyyy", { locale: ru }) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("datepicker-trigger", !selected && "is-empty", className)}
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
        >
          <CalendarIcon size={15} className="datepicker-icon" />
          <span className="datepicker-label">{label || placeholder}</span>
          {allowClear && selected && (
            <span
              className="datepicker-clear"
              role="button"
              tabIndex={-1}
              aria-label="Очистить"
              onPointerDown={(e) => {
                // Prevent Radix from opening the popover when the X is hit.
                e.stopPropagation();
                e.preventDefault();
                onChange("");
              }}
            >
              <X size={13} strokeWidth={1.8} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="datepicker-popover">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) {
              onChange(format(d, ISO));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
