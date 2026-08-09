export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

function encodeSrgb(channel: number): number {
  const clamped = Math.max(0, Math.min(1, channel));
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function parseAlpha(value: string | undefined): number {
  if (value === undefined) return 1;
  return value.endsWith("%")
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value);
}

function parseRgbFunction(value: string): Rgba | undefined {
  const match = value.match(
    /^rgba?\(\s*([\d.]+)(%?)\s*[ ,/]\s*([\d.]+)(%?)\s*[ ,/]\s*([\d.]+)(%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i,
  );
  if (!match) return undefined;
  const channel = (raw: string, percent: string) =>
    (Number.parseFloat(raw) / (percent ? 100 : 255)) * 255;
  return [
    channel(match[1]!, match[2]!),
    channel(match[3]!, match[4]!),
    channel(match[5]!, match[6]!),
    parseAlpha(match[7]),
  ];
}

function parseOklch(value: string): Rgba | undefined {
  const match = value.match(
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)(%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/i,
  );
  if (!match) return undefined;

  const lightness = Number.parseFloat(match[1]!) / (match[2] ? 100 : 1);
  const chroma = Number.parseFloat(match[3]!) / (match[4] ? 100 : 1);
  const hue = (Number.parseFloat(match[5]!) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [
    encodeSrgb(red) * 255,
    encodeSrgb(green) * 255,
    encodeSrgb(blue) * 255,
    parseAlpha(match[6]),
  ];
}

export function parseCssColor(value: string): Rgba {
  const parsed = parseRgbFunction(value) ?? parseOklch(value);
  if (parsed === undefined) throw new Error(`Unsupported CSS color: ${value}`);
  return parsed;
}

export function relativeLuminance([red, green, blue]: Rgb): number {
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

export function contrast(first: Rgb, second: Rgb): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}
