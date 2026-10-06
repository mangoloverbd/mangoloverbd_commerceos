import { act, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { lazyPage } from "@/lib/lazyPage";

function Settings({ tab }: { tab: string }) {
  return <p>Settings: {tab}</p>;
}

describe("lazyPage", () => {
  it("renders straight away, with no loading state, once its code was preloaded", async () => {
    const Page = lazyPage(async () => ({ default: Settings }));
    await Page.preload();
    render(
      <Suspense fallback={<p>Loading…</p>}>
        <Page tab="general" />
      </Suspense>,
    );
    // Synchronously on the first render: no fallback flash.
    expect(screen.getByText("Settings: general")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("still loads on demand when it was not preloaded", async () => {
    const Page = lazyPage(async () => ({ default: Settings }));
    render(
      <Suspense fallback={<p>Loading…</p>}>
        <Page tab="team" />
      </Suspense>,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("Settings: team")).toBeInTheDocument();
  });

  it("downloads the code once however often it is preloaded or opened", async () => {
    const load = vi.fn(async () => ({ default: Settings }));
    const Page = lazyPage(load);
    await Promise.all([Page.preload(), Page.preload()]);
    render(<Page tab="x" />);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed download instead of staying broken", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ default: Settings });
    const Page = lazyPage(load);
    await expect(Page.preload()).rejects.toThrow("offline");
    await act(async () => { await Page.preload(); });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
