import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SubscriptionPill } from "./design";
import type { Subscription } from "@/types/api";

function makeSub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 1,
    client_id: 1,
    subcategory_id: 2,
    subcategory_name: "Персональная",
    category_id: 3,
    category_name: "Тренировки",
    category_color: "#3b82f6",
    price_per_lesson: "500.00",
    lessons_total: 10,
    lessons_used: 1,
    lessons_remaining: 9,
    remaining_minutes: 540,
    is_exhausted: false,
    created_at: "2026-01-01T00:00:00",
    ...over,
  };
}

describe("SubscriptionPill", () => {
  it("renders nothing without packages", () => {
    const { container } = render(<SubscriptionPill subs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("toggles the popover on click", () => {
    render(<SubscriptionPill subs={[makeSub()]} />);
    expect(screen.queryByText("Персональная")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Персональная")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Персональная")).toBeNull();
  });

  it("nets out a future event but leaves a past one alone", () => {
    const { unmount } = render(
      <SubscriptionPill subs={[makeSub()]} eventMinutes={90} eventEnded={false} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("7,5 из 10")).toBeTruthy();
    unmount();

    render(<SubscriptionPill subs={[makeSub()]} eventMinutes={90} eventEnded />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("9 из 10")).toBeTruthy();
  });

  it("reads as завершён once nothing is left", () => {
    render(
      <SubscriptionPill
        subs={[makeSub({ lessons_remaining: 0, remaining_minutes: 0, is_exhausted: true })]}
      />,
    );
    const pill = screen.getByRole("button");
    expect(pill.className).toContain("is-done");
    fireEvent.click(pill);
    expect(screen.getByText("завершён")).toBeTruthy();
  });

  it("does not bubble the click to the surrounding row", () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <SubscriptionPill subs={[makeSub()]} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
