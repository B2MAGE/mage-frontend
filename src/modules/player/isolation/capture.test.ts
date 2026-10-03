import { describe, expect, it, vi } from 'vitest'
import { rasterDimensions, validateRasterCapture } from './capture'
export function pngHeader(width: number, height: number) {
  const bytes = new ArrayBuffer(33), a = new Uint8Array(bytes), v = new DataView(bytes)
  a.set([137,80,78,71,13,10,26,10]); v.setUint32(8,13); a.set([73,72,68,82],12)
  v.setUint32(16,width); v.setUint32(20,height); return bytes
}
describe('untrusted raster capture', () => {
  it('rejects oversized dimensions before decoding, even with small encoded bytes', async () => {
    const decode = vi.fn()
    await expect(validateRasterCapture({ bytes: pngHeader(40000,40000),type:'image/png',width:10,height:10 },
      {width:10,height:10,type:'image/png',quality:1},decode)).rejects.toThrow(/dimensions/)
    expect(decode).not.toHaveBeenCalled()
  })
  it('rejects HTML/SVG, format lies and bigger-than-requested images', async () => {
    for (const text of ['<svg xmlns="http://www.w3.org/2000/svg"/>','https://private.example/capture','<html>']) {
      expect(() => rasterDimensions(new TextEncoder().encode(text).buffer,'image/png')).toThrow()
    }
    const request = {width:10,height:10,type:'image/png' as const,quality:1}
    await expect(validateRasterCapture({bytes:pngHeader(11,10),type:'image/png',width:11,height:10},request,vi.fn())).rejects.toThrow(/dimensions/)
    expect(() => rasterDimensions(pngHeader(10,10),'image/jpeg')).toThrow()
  })
  it('requires decoded dimensions too and always closes the decoded bitmap', async () => {
    const close=vi.fn(),decode=vi.fn().mockResolvedValue({width:11,height:10,close})
    await expect(validateRasterCapture({bytes:pngHeader(10,10),type:'image/png',width:10,height:10},
      {width:10,height:10,type:'image/png',quality:1},decode)).rejects.toThrow(/Decoded/)
    expect(close).toHaveBeenCalledOnce()
    decode.mockResolvedValue({width:10,height:10,close})
    expect((await validateRasterCapture({bytes:pngHeader(10,10),type:'image/png',width:10,height:10},
      {width:10,height:10,type:'image/png',quality:1},decode)).type).toBe('image/png')
  })
})
