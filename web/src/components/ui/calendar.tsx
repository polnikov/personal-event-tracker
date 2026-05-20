import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ru } from "react-day-picker/locale";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/** Shadcn-style Calendar — DayPicker themed via plain CSS classes that
 *  follow the app's tokens (no Tailwind utility classes). Month nav and
 *  Monday-first layout are wired by default; pass props through to allow
 *  single / range / multiple selection on the consumer side. */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  startMonth,
  endMonth,
  ...props
}: CalendarProps) {
  // Default month/year range for the caption dropdowns: ±10 years from
  // today. Consumers can override via startMonth / endMonth.
  const fallbackStart = React.useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear() - 10, 0, 1);
  }, []);
  const fallbackEnd = React.useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear() + 10, 11, 31);
  }, []);
  return (
    <DayPicker
      locale={ru}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      navLayout="around"
      startMonth={startMonth ?? fallbackStart}
      endMonth={endMonth ?? fallbackEnd}
      className={cn("rdp-app", className)}
      classNames={{
        months: "rdp-months",
        month: "rdp-month",
        month_caption: "rdp-caption",
        caption_label: "rdp-caption-label",
        dropdowns: "rdp-dropdowns",
        dropdown_root: "rdp-dropdown-root",
        dropdown: "rdp-dropdown",
        months_dropdown: "rdp-dropdown rdp-dropdown-months",
        years_dropdown: "rdp-dropdown rdp-dropdown-years",
        nav: "rdp-nav",
        button_previous: "rdp-nav-btn rdp-nav-prev",
        button_next: "rdp-nav-btn rdp-nav-next",
        month_grid: "rdp-grid",
        weekdays: "rdp-weekdays",
        weekday: "rdp-weekday",
        week: "rdp-week",
        day: "rdp-cell",
        day_button: "rdp-day",
        outside: "rdp-day-outside",
        today: "rdp-day-today",
        selected: "rdp-day-selected",
        range_start: "rdp-day-range-start",
        range_end: "rdp-day-range-end",
        range_middle: "rdp-day-range-middle",
        disabled: "rdp-day-disabled",
        hidden: "rdp-day-hidden",
        ...(classNames ?? {}),
      }}
      components={{
        Chevron: ({ orientation, size = 16 }) => {
          if (orientation === "left") return <ChevronLeft size={size} />;
          if (orientation === "right") return <ChevronRight size={size} />;
          return <ChevronDown size={Math.max(size - 4, 12)} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";
