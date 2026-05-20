import * as React from "react";
import { format, parse } from "date-fns";
import { ru } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const LOCAL = "yyyy-MM-dd'T'HH:mm";
const DATE_ONLY = "yyyy-MM-dd";

function parseLocal(v: string | undefined | null): Date | undefined {
  if (!v) return undefined;
  const d = parse(v, LOCAL, new Date());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

interface DateTimePickerProps {
  /** Local "yyyy-MM-ddTHH:mm" string. */
  value: string;
  /** Receives local "yyyy-MM-ddTHH:mm" string. */
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Combined date + time picker: button opens the same Shadcn-style
 *  Calendar popover, and a native time input handles HH:mm input. The
 *  pair always emits a local ISO ("yyyy-MM-ddTHH:mm") string so it can
 *  drop into the existing `type="datetime-local"` slots. */
export function DateTimePicker({
  value,
  onChange,
  placeholder = "Дата и время",
  disabled,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const current = parseLocal(value);
  const datePart = current ? format(current, DATE_ONLY) : "";
  const timePart = current ? format(current, "HH:mm") : "00:00";
  const label = current
    ? format(current, "d MMMM yyyy", { locale: ru })
    : "";

  const emit = (date: string, time: string) => {
    if (!date) {
      onChange("");
      return;
    }
    const t = time && /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
    onChange(`${date}T${t}`);
  };

  return (
    <div className={cn("datetimepicker", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn("datepicker-trigger", "datetimepicker-date", !current && "is-empty")}
            disabled={disabled}
          >
            <CalendarIcon size={15} className="datepicker-icon" />
            <span className="datepicker-label">{label || placeholder}</span>
            {current && (
              <span
                className="datepicker-clear"
                role="button"
                tabIndex={-1}
                aria-label="Очистить"
                onPointerDown={(e) => {
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
            selected={current}
            defaultMonth={current}
            onSelect={(d) => {
              if (d) {
                emit(format(d, DATE_ONLY), timePart);
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
      <input
        type="time"
        className="input datetimepicker-time"
        value={timePart}
        disabled={disabled || !datePart}
        onChange={(e) => emit(datePart, e.target.value)}
      />
    </div>
  );
}
