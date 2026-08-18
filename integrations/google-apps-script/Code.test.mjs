import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./Code.gs", import.meta.url), "utf8");

function loadAttachmentFactory() {
  const context = {
    console: { error() {} },
    Utilities: {
      base64Decode() {
        return [-1, -40, 0, 0];
      },
      newBlob(bytes, contentType, name) {
        return { bytes, contentType, name };
      },
    },
  };
  vm.runInNewContext(source, context);
  return context.createJpegAttachment;
}

test("accepts a JPEG header returned as signed Apps Script bytes", () => {
  const createJpegAttachment = loadAttachmentFactory();

  assert.deepEqual(
    createJpegAttachment("data:image/jpeg;base64,valid").bytes,
    [-1, -40, 0, 0],
  );
});
