import rawManifest from "./generated/release-manifest.json";
import manifestUrl from "./generated/release-manifest.json?url";
import { parseVisionManifest } from "./manifest";

export const VISION_MANIFEST = parseVisionManifest(rawManifest);
export const VISION_MANIFEST_URL = manifestUrl;
