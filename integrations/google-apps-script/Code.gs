const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_NAME_LENGTH = 80;
const IDEMPOTENCY_TTL_SECONDS = 10 * 60;
const JPEG_PREFIX = "data:image/jpeg;base64,";

function doGet() {
  return jsonResponse({ ok: true, service: "smart-smile-email" });
}

function doPost(event) {
  try {
    const request = parseRequest(event);
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const cache = CacheService.getScriptCache();
      if (cache.get(request.idempotencyKey) !== null) {
        return jsonResponse({ duplicate: true, ok: true });
      }

      if (MailApp.getRemainingDailyQuota() < 1) {
        throw new Error("daily-quota-exhausted");
      }

      const attachment = createJpegAttachment(request.image);
      const displayName = [request.firstName, request.lastName].join(" ");
      MailApp.sendEmail({
        attachments: [attachment],
        body: [
          `Hello ${request.firstName},`,
          "",
          "Your Smart Smile photo is attached.",
          "",
          `Name: ${displayName}`,
          request.nickname ? `Nickname: ${request.nickname}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        htmlBody: [
          `<p>Hello ${escapeHtml(request.firstName)},</p>`,
          "<p>Your Smart Smile photo is attached.</p>",
          `<p><strong>Name:</strong> ${escapeHtml(displayName)}<br>`,
          request.nickname
            ? `<strong>Nickname:</strong> ${escapeHtml(request.nickname)}</p>`
            : "</p>",
        ].join(""),
        name: "Smart Smile",
        subject: `Your Smart Smile photo — ${displayName}`,
        to: request.email,
      });
      cache.put(request.idempotencyKey, "sent", IDEMPOTENCY_TTL_SECONDS);
      return jsonResponse({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({
      error: "Photo delivery was not accepted.",
      ok: false,
    });
  }
}

function parseRequest(event) {
  const contents = event && event.postData && event.postData.contents;
  if (typeof contents !== "string" || contents.length === 0) {
    throw new Error("missing-request-body");
  }
  const request = JSON.parse(contents);
  if (request.consent !== true) throw new Error("consent-required");
  if (
    typeof request.email !== "string" ||
    request.email.length > 254 ||
    /[\r\n,\u0000-\u001f]/.test(request.email) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(request.email)
  ) {
    throw new Error("invalid-email");
  }
  request.firstName = parseName(request.firstName, true, "first-name");
  request.lastName = parseName(request.lastName, true, "last-name");
  request.nickname = parseName(request.nickname, false, "nickname");
  if (
    typeof request.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9._:-]{8,160}$/.test(request.idempotencyKey)
  ) {
    throw new Error("invalid-idempotency-key");
  }
  if (
    typeof request.image !== "string" ||
    !request.image.startsWith(JPEG_PREFIX)
  ) {
    throw new Error("invalid-image");
  }
  if (request.image.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100) {
    throw new Error("image-too-large");
  }
  return request;
}

function parseName(value, required, errorCode) {
  if (typeof value !== "string") throw new Error(`invalid-${errorCode}`);
  const name = value.trim();
  if (
    (required && name.length === 0) ||
    name.length > MAX_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`invalid-${errorCode}`);
  }
  return name;
}

function createJpegAttachment(image) {
  const encoded = image.slice(JPEG_PREFIX.length);
  const bytes = Utilities.base64Decode(encoded);
  if (bytes.length < 4 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("image-size-out-of-range");
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("image-is-not-jpeg");
  }
  return Utilities.newBlob(bytes, "image/jpeg", "smart-smile.jpg");
}

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
