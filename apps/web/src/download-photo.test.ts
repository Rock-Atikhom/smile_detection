import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPhotoFilename, downloadPhoto } from "./download-photo";

describe("photo download", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("creates the approved timestamp filename", () => {
    expect(createPhotoFilename(new Date(2026, 7, 16, 9, 4, 5))).toBe(
      "smart-smile-20260816-090405.jpg",
    );
  });

  it("starts a browser download for the supplied photo artifact", () => {
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    const urlRef = {
      createObjectURL: vi.fn(() => "blob:smart-smile"),
      revokeObjectURL: vi.fn(),
    };

    downloadPhoto(
      "data:image/jpeg;base64,/9j/",
      "smart-smile-20260816-090405.jpg",
      document,
      urlRef,
    );

    expect(urlRef.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.download).toBe("smart-smile-20260816-090405.jpg");
    expect(anchor.href).toBe("blob:smart-smile");
    expect(click).toHaveBeenCalledOnce();

    vi.runAllTimers();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith("blob:smart-smile");
  });

  it("rejects an unavailable photo artifact", () => {
    expect(() => downloadPhoto("not-a-photo")).toThrow(
      "Photo data is unavailable",
    );
  });
});
