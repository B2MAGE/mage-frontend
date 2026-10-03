import { BRIDGE_LIMITS, CAPTURE_BUDGET, type CaptureRequest } from './playbackProtocol'

/** Inspect dimensions before invoking an image decoder; do not decode SVG/HTML or URLs. */
export function rasterDimensions(bytes: ArrayBuffer, type: CaptureRequest['type']) {
  if (!bytes.byteLength || bytes.byteLength > BRIDGE_LIMITS.captureBytes) throw new Error('Capture size is invalid.')
  const b = new Uint8Array(bytes), v = new DataView(bytes)
  const text = (at: number, length: number) => String.fromCharCode(...b.subarray(at, at + length))
  let width = 0, height = 0
  if (type === 'image/png' && b.length >= 33 && b[0] === 137 && text(1, 7) === 'PNG\r\n\x1a\n'
    && v.getUint32(8) === 13 && text(12, 4) === 'IHDR') {
    width = v.getUint32(16); height = v.getUint32(20)
  } else if (type === 'image/jpeg' && b[0] === 255 && b[1] === 216) {
    let at = 2
    while (at + 4 <= b.length) {
      if (b[at++] !== 255) break
      while (b[at] === 255) at++
      const marker = b[at++]
      if (marker === 217 || marker === 218) break
      const size = v.getUint16(at)
      if (size < 2 || at + size > b.length) break
      if ([192, 193, 194].includes(marker) && size >= 8) {
        height = v.getUint16(at + 3); width = v.getUint16(at + 5); break
      }
      at += size
    }
  } else if (type === 'image/webp' && b.length >= 30 && text(0, 4) === 'RIFF'
    && v.getUint32(4, true) + 8 === b.length && text(8, 4) === 'WEBP') {
    const chunk = text(12, 4)
    if (chunk === 'VP8X') {
      // Animated WebP is not a single-frame preview.
      if (b[20] & 2) throw new Error('Animated captures are not supported.')
      width = 1 + b[24] + (b[25] << 8) + (b[26] << 16)
      height = 1 + b[27] + (b[28] << 8) + (b[29] << 16)
    } else if (chunk === 'VP8 ' && b[23] === 157 && b[24] === 1 && b[25] === 42) {
      width = v.getUint16(26, true) & 0x3fff; height = v.getUint16(28, true) & 0x3fff
    } else if (chunk === 'VP8L' && b[20] === 47) {
      const bits = v.getUint32(21, true)
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1
    }
  }
  if (width < 1 || height < 1 || width > CAPTURE_BUDGET.maxLongestEdge || height > CAPTURE_BUDGET.maxLongestEdge || width * height > CAPTURE_BUDGET.maxRenderPixels) {
    throw new Error('Capture format or dimensions are invalid.')
  }
  return { width, height }
}

export async function validateRasterCapture(payload: { bytes: ArrayBuffer; type: CaptureRequest['type']; width: number; height: number },
  request: CaptureRequest, decode: typeof createImageBitmap = createImageBitmap): Promise<Blob> {
  if (payload.type !== request.type) throw new Error('Unexpected capture type.')
  const dimensions = rasterDimensions(payload.bytes, payload.type)
  if (dimensions.width !== payload.width || dimensions.height !== payload.height
    || dimensions.width > request.width || dimensions.height > request.height) throw new Error('Unexpected capture dimensions.')
  const blob = new Blob([payload.bytes], { type: payload.type })
  const bitmap = await decode(blob)
  try {
    if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height) throw new Error('Decoded capture dimensions differ.')
  } finally { bitmap.close() }
  return blob
}
