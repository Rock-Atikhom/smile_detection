import { describe, expect, it, vi } from "vitest";
import { sendPhoto } from "./delivery";

const request = {
  consent: true as const,
  email: "person@example.com",
  idempotencyKey: "capture-123",
  image: "data:image/jpeg;base64,photo",
};

describe("photo delivery", () => {
  it("uses local demo mode without sending the photo anywhere", async () => {
    const fetch = vi.fn();

    const result = await sendPhoto(request, { fetch, mode: "mock" });

    expect(result).toEqual({ mode: "mock" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the selected photo to the configured PHP endpoint", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    const result = await sendPhoto(request, {
      endpoint: "/api/send-photo.php",
      fetch,
      mode: "server",
    });

    expect(result).toEqual({ mode: "server" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/send-photo.php",
      expect.objectContaining({
        body: JSON.stringify(request),
        headers: expect.objectContaining({
          "Idempotency-Key": "capture-123",
        }),
        method: "POST",
      }),
    );
  });

  it("submits an Apps Script request without triggering a CORS preflight", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    const result = await sendPhoto(request, {
      endpoint: "https://script.google.com/macros/s/demo/exec",
      fetch,
      mode: "apps-script",
    });

    expect(result).toEqual({ mode: "apps-script" });
    expect(fetch).toHaveBeenCalledWith(
      "https://script.google.com/macros/s/demo/exec",
      expect.objectContaining({
        body: JSON.stringify(request),
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        method: "POST",
        mode: "no-cors",
      }),
    );
  });

  it("reports an endpoint failure to the preview flow", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Email provider unavailable" }), {
        status: 503,
      }),
    );

    await expect(
      sendPhoto(request, {
        endpoint: "/api/send-photo.php",
        fetch,
        mode: "server",
      }),
    ).rejects.toThrow("Email provider unavailable");
  });
});
