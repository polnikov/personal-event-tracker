import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { calcEvent } from "./eventCalc";
import { fmt } from "./format";

// Mirrors how EventForm surfaces the live net total, exercised through a real
// DOM render so the calc + money formatting path is covered end-to-end.
function NetPreview(props: { price: number; minutes: number; tax: number; royalty: number }) {
  const { net } = calcEvent(props);
  return <output aria-label="net">{fmt.money(net)} ₽</output>;
}

describe("event calc (Testing Library render)", () => {
  it("shows the net total for the entered values", () => {
    render(<NetPreview price={200} minutes={60} tax={10} royalty={5} />);
    expect(screen.getByLabelText("net")).toHaveTextContent("170 ₽");
  });

  it("updates when re-rendered with different inputs", () => {
    const { rerender } = render(<NetPreview price={100} minutes={90} tax={0} royalty={0} />);
    expect(screen.getByLabelText("net")).toHaveTextContent("150 ₽");
    rerender(<NetPreview price={100} minutes={30} tax={0} royalty={0} />);
    expect(screen.getByLabelText("net")).toHaveTextContent("50 ₽");
  });
});
