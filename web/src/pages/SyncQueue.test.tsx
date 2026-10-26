import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { enqueue } from "@/lib/outbox";
import { SyncQueuePage } from "./SyncQueue";

function renderPage(qc = new QueryClient()) {
  return render(
    <QueryClientProvider client={qc}>
      <SyncQueuePage />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await db.outbox.clear();
});

afterEach(async () => {
  await db.outbox.clear();
});

describe("SyncQueuePage", () => {
  it("shows the empty state when the outbox is empty", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Очередь пуста")).toBeInTheDocument();
    });
  });

  it("lists a pending entry with its method and url", async () => {
    await enqueue({ method: "POST", url: "/events", body: { x: 1 } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("POST")).toBeInTheDocument();
    });
    expect(screen.getByText("/events")).toBeInTheDocument();
    expect(screen.getByText(/Ожидают отправки/)).toBeInTheDocument();
  });

  it("shows a queued event as client and time instead of its url", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["clients", ""], [{ id: 7, full_name: "Иванов Иван" }]);
    await enqueue({
      method: "PUT",
      url: "/events/1855",
      body: { client_id: 7, start_at: "2026-09-15T13:00:00", duration_minutes: 60 },
    });
    renderPage(qc);
    await waitFor(() => {
      expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    });
    expect(screen.getByText("15 сент. 2026, 13:00–14:00")).toBeInTheDocument();
    expect(screen.queryByText("/events/1855")).toBeNull();
  });
});
