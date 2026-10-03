/** A fixed, quiet 30-second rhythm generated locally; no media request or upload. */
export function createTestRhythm(): Blob {
  const rate = 22050, frames = rate * 30
  const bytes = new ArrayBuffer(44 + frames * 2), view = new DataView(bytes)
  const ascii = (at: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)) }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, 'data'); view.setUint32(40, frames * 2, true)
  for (let i = 0; i < frames; i++) {
    const time = i / rate, beat = time % 0.5
    view.setInt16(44 + i * 2, Math.sin(time * 2 * Math.PI * 85) * Math.exp(-beat * 18) * 15000, true)
  }
  return new Blob([bytes], { type: 'audio/wav' })
}
