const PHOTO_FILENAME_PREFIX = "smart-smile";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function createPhotoFilename(date = new Date()): string {
  const timestamp = [
    date.getFullYear().toString().padStart(4, "0"),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("");
  const time = [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
  return `${PHOTO_FILENAME_PREFIX}-${timestamp}-${time}.jpg`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?((?:;base64)?),(.*)$/s.exec(dataUrl);
  if (match === null) {
    throw new Error("Photo data is unavailable");
  }

  const [, declaredType, encoding, payload] = match;
  const type = declaredType ?? "image/jpeg";
  if (encoding === ";base64") {
    let binary: string;
    try {
      binary = atob(payload);
    } catch {
      throw new Error("Photo data is invalid");
    }
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new Blob([bytes], { type });
  }

  try {
    return new Blob([decodeURIComponent(payload)], { type });
  } catch {
    throw new Error("Photo data is invalid");
  }
}

export function downloadPhoto(
  imageUrl: string,
  filename = createPhotoFilename(),
  documentRef: Document = document,
  urlRef: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void {
  const blob = dataUrlToBlob(imageUrl);
  if (blob.size === 0) {
    throw new Error("Photo data is empty");
  }

  const objectUrl = urlRef.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.download = filename;
  link.href = objectUrl;
  link.rel = "noopener";
  link.click();
  globalThis.setTimeout(() => urlRef.revokeObjectURL(objectUrl), 0);
}
