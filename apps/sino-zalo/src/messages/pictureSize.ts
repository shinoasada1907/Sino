/**
 * The size in pixels of a JPEG, PNG, GIF or WebP, read from its first bytes, which Zalo wants beside a photo
 * (zalo-send-files, D-375); null when the bytes say no size, and the picture then goes as a file.
 */
export function pictureSize(data: Buffer): { width: number; height: number } | null {
  const size = pngSize(data) ?? gifSize(data) ?? webpSize(data) ?? jpegSize(data);
  return size !== null && size.width > 0 && size.height > 0 ? size : null;
}

function pngSize(data: Buffer) {
  const isPng = data.length >= 24 && data.readUInt32BE(0) === 0x89504e47 && data.toString("latin1", 12, 16) === "IHDR";
  return isPng ? { width: data.readUInt32BE(16), height: data.readUInt32BE(20) } : null;
}

function gifSize(data: Buffer) {
  const isGif = data.length >= 10 && data.toString("latin1", 0, 3) === "GIF";
  return isGif ? { width: data.readUInt16LE(6), height: data.readUInt16LE(8) } : null;
}

function webpSize(data: Buffer) {
  if (data.length < 30 || data.toString("latin1", 0, 4) !== "RIFF" || data.toString("latin1", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = data.toString("latin1", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  }
  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === "VP8 ") {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

// A JPEG keeps its size in the first start-of-frame marker (SOF0…SOF15, but not DHT, JPG or DAC).
function jpegSize(data: Buffer) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }
  let at = 2;
  while (at + 9 < data.length) {
    if (data[at] !== 0xff) {
      return null;
    }
    const marker = data[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = data.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: data.readUInt16BE(at + 7), height: data.readUInt16BE(at + 5) };
    }
    at += 2 + length;
  }
  return null;
}
