import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export const fmt = {
  money(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(n)) return String(value);
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
  },

  duration(minutes: number): string {
    if (minutes < 60) return `${minutes} мин`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
  },

  date(value: string | Date | null | undefined): string {
    if (!value) return "";
    const d = typeof value === "string" ? parseISO(value) : value;
    return format(d, "d MMM", { locale: ru });
  },

  dateTime(value: string | Date | null | undefined): string {
    if (!value) return "";
    const d = typeof value === "string" ? parseISO(value) : value;
    return format(d, "d MMM, HH:mm", { locale: ru });
  },

  time(value: string | Date | null | undefined): string {
    if (!value) return "";
    const d = typeof value === "string" ? parseISO(value) : value;
    return format(d, "HH:mm");
  },

  weekday(value: string | Date | null | undefined): string {
    if (!value) return "";
    const d = typeof value === "string" ? parseISO(value) : value;
    return format(d, "EEEEEE", { locale: ru });
  },

  fullDate(value: string | Date | null | undefined): string {
    if (!value) return "";
    const d = typeof value === "string" ? parseISO(value) : value;
    return format(d, "d MMMM yyyy", { locale: ru });
  },

  monthYear(value: Date): string {
    return format(value, "LLLL yyyy", { locale: ru });
  },

  monthShort(value: string | Date): string {
    const d = typeof value === "string" ? parseISO(value) : value;
    return format(d, "MMM", { locale: ru });
  },

  todayHeader(value: Date): string {
    return format(value, "EEEE, d MMMM", { locale: ru });
  },
};

// Russian pluralization
export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// Initials from a full name
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Stable soft-pastel background derived from a string
export function stringToColor(s: string): string {
  const palette = ["#E8E2D5", "#DDE5D5", "#D8E0E5", "#E5D8DC", "#E0D5E5", "#E5DDD5", "#D5E5E0"];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

export function toDatetimeLocalValue(iso: string): string {
  const d = parseISO(iso);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

// Legacy aliases (kept for components still using direct names)
export const formatMoney = fmt.money;
export const formatDuration = fmt.duration;
export const formatDateTime = fmt.dateTime;
export const formatDate = fmt.date;
