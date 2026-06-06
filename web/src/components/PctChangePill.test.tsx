import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PctChangePill } from "./PctChangePill";

describe("PctChangePill", () => {
  it("renders nothing when there is no previous value", () => {
    const { container } = render(<PctChangePill current={100} previous={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when previous is 0 but current is positive (no baseline)", () => {
    const { container } = render(<PctChangePill current={50} previous={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a neutral 0% when both are 0", () => {
    const { container } = render(<PctChangePill current={0} previous={0} />);
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe("0%");
    expect(el.className).toContain("neutral");
  });

  it("shows a positive green delta when income grew", () => {
    const { container } = render(<PctChangePill current={120} previous={100} />);
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe("+20.0%");
    expect(el.className).toContain("up");
  });

  it("shows a negative red delta when income shrank", () => {
    const { container } = render(<PctChangePill current={80} previous={100} />);
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe("-20.0%");
    expect(el.className).toContain("down");
  });

  it("shows a neutral 0.0% on an exact match", () => {
    const { container } = render(<PctChangePill current={100} previous={100} />);
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe("0.0%");
    expect(el.className).toContain("neutral");
  });

  it("builds the tooltip from prevLabel, formatPrev and unit", () => {
    const { container } = render(
      <PctChangePill
        current={12}
        previous={10}
        prevLabel="Прошлый месяц"
        unit="ч"
        formatPrev={(n) => n.toFixed(1)}
      />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("title")).toBe("Прошлый месяц: 10.0 ч");
  });

  it("applies an extra className", () => {
    const { container } = render(
      <PctChangePill current={120} previous={100} className="x-tra" />,
    );
    expect((container.firstChild as HTMLElement).className).toContain("x-tra");
  });
});
