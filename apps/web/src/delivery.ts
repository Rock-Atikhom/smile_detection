export type PhotoDeliveryMode = "mock" | "server" | "apps-script";

export interface PhotoDeliveryRequest {
  consent: true;
  email: string;
  idempotencyKey: string;
  image: string;
}

export interface PhotoDeliveryDependencies {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  mode?: PhotoDeliveryMode;
}

export interface PhotoDeliveryResult {
  mode: PhotoDeliveryMode;
}

function configuredMode(): PhotoDeliveryMode {
  if (import.meta.env.VITE_SMART_SMILE_EMAIL_MODE === "apps-script") {
    return "apps-script";
  }
  return import.meta.env.VITE_SMART_SMILE_EMAIL_MODE === "server"
    ? "server"
    : "mock";
}

function configuredEndpoint(): string {
  return (
    import.meta.env.VITE_SMART_SMILE_EMAIL_ENDPOINT ?? "/api/send-photo.php"
  );
}

export async function sendPhoto(
  request: PhotoDeliveryRequest,
  dependencies: PhotoDeliveryDependencies = {},
): Promise<PhotoDeliveryResult> {
  if (!request.consent || request.email.trim() === "" || request.image === "") {
    throw new Error("Email, photo, and consent are required");
  }

  const mode = dependencies.mode ?? configuredMode();
  if (mode === "mock") return { mode };

  if (mode === "apps-script") {
    await (dependencies.fetch ?? globalThis.fetch)(
      dependencies.endpoint ?? configuredEndpoint(),
      {
        body: JSON.stringify(request),
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
        },
        method: "POST",
        mode: "no-cors",
      },
    );
    return { mode };
  }

  const response = await (dependencies.fetch ?? globalThis.fetch)(
    dependencies.endpoint ?? configuredEndpoint(),
    {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": request.idempotencyKey,
      },
      method: "POST",
    },
  );

  let body: { error?: string } = {};
  try {
    body = (await response.json()) as { error?: string };
  } catch {
    // The status code remains the source of truth when the endpoint has no JSON body.
  }
  if (!response.ok) {
    throw new Error(body.error ?? "The photo could not be sent. Try again.");
  }
  return { mode };
}
