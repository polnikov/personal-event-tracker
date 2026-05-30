import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { enqueue } from "@/lib/outbox";
import { SyncQueuePage } from "./SyncQueue";

function renderPage() {
  const qc = new QueryClient();
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
});
