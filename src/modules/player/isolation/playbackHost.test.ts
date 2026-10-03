import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedPlaybackHost } from './playbackHost'
import { playbackMessage, type PlaybackPayloads, type PlaybackType } from './playbackProtocol'
const SESSION='ec40c660-205d-4b63-b6b3-ac3888f8c9aa'
class Port {
  onmessage: ((e: MessageEvent)=>void)|null=null; onmessageerror:(()=>void)|null=null
  postMessage=vi.fn();start=vi.fn();close=vi.fn()
  receive(data:unknown){this.onmessage?.({data} as MessageEvent)}
}
const channels:Array<{port1:Port;port2:Port}>=[]
function setup(decodeCapture?: typeof createImageBitmap, useInlineFrameStyles = true) {
  const container=document.createElement('div');document.body.append(container)
  const failure=vi.fn(),status=vi.fn()
  const host=createIsolatedPlaybackHost({container,rendererUrl:'http://127.0.0.1:5181/',onFailure:failure,onStatus:status,startupTimeoutMs:100,progressTimeoutMs:1000,decodeCapture,useInlineFrameStyles})
  const frame=container.querySelector('iframe')!,post=vi.spyOn(frame.contentWindow!,'postMessage').mockImplementation(()=>{})
  frame.dispatchEvent(new Event('load'))
  const port=channels.at(-1)!.port1
  function reply<T extends PlaybackType>(type:T,payload:PlaybackPayloads[T],generation=1,requestId=0,session=SESSION){port.receive(playbackMessage(type,session,generation,requestId,payload))}
  reply('ready',null,0)
  async function load(){const promise=host.loadScene({visualizer:{shader:'sphere(0.5);'}});await Promise.resolve();const m=port.postMessage.mock.calls.at(-1)![0];reply('loaded',null,m.generation,m.requestId);await promise}
  return {host,frame,port,post,failure,status,reply,load,container}
}
beforeEach(()=>{
  vi.useFakeTimers();vi.stubEnv('DEV',true)
  vi.stubGlobal('window',{location:{href:'http://localhost:5178/'},addEventListener:vi.fn(),removeEventListener:vi.fn()})
  vi.stubGlobal('MessageChannel',class{port1=new Port();port2=new Port();constructor(){channels.push(this)}})
  vi.spyOn(crypto,'randomUUID').mockReturnValue(SESSION);channels.length=0
})
afterEach(()=>{document.body.replaceChildren();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals()})
describe('isolated playback host',()=>{
  it('coalesces music response changes and binds capability responses to the current request',async()=>{
    const s=setup();await s.load()
    for(let i=0;i<100;i++)s.host.setAudioResponse({mode:'mapped-v1',config:{version:1,sensitivity:1+i/100,mappings:[]}})
    await vi.advanceTimersByTimeAsync(34)
    const settings=s.port.postMessage.mock.calls.filter(([m])=>m.type==='audio-response')
    expect(settings).toHaveLength(1);expect(settings[0][0].payload.config.sensitivity).toBe(1.99)
    const result=s.host.getCapabilities(),command=s.port.postMessage.mock.calls.at(-1)![0]
    s.reply('capabilities-result',{supportedTargets:['bass']},1,command.requestId-1)
    s.reply('capabilities-result',{supportedTargets:['size']},1,command.requestId)
    await expect(result).resolves.toEqual({supportedTargets:['size']})
    const stale=s.host.getCapabilities(),rejected=expect(stale).rejects.toThrow(/Scene changed/)
    await s.load();await rejected;s.host.dispose()
  })
  it('can use an external stylesheet without introducing inline frame styles',()=>{
    const s=setup(undefined,false)
    expect(s.frame.hasAttribute('style')).toBe(false)
    expect(s.frame.getAttribute('sandbox')).toBe('allow-scripts')
    s.host.dispose()
  })
  it('sends bootstrap to the exact opaque frame with only a private port and session',async()=>{
    const s=setup();await s.host.ready
    expect(s.post).toHaveBeenCalledWith(playbackMessage('connect',SESSION,0,0,null),'*',[channels[0].port2])
    expect(s.frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(s.frame.getAttribute('allow')).toContain("microphone 'none'")
    s.host.dispose();expect(s.frame.isConnected).toBe(false);expect(s.port.close).toHaveBeenCalled()
  })
  it('ignores stale generations and rejects superseded scene work',async()=>{
    const s=setup(),old=s.host.loadScene({visualizer:{shader:'sphere(1);'}}),rejected=expect(old).rejects.toThrow(/Scene changed/)
    await Promise.resolve();const first=s.port.postMessage.mock.calls.at(-1)![0]
    const current=s.host.loadScene({visualizer:{shader:'box(1,1,1);'}});await Promise.resolve()
    const second=s.port.postMessage.mock.calls.at(-1)![0]
    s.reply('loaded',null,first.generation,first.requestId);expect(s.status).not.toHaveBeenCalledWith('playing')
    s.reply('error',{code:'render'},first.generation,first.requestId);expect(s.failure).not.toHaveBeenCalled()
    s.reply('loaded',null,second.generation,second.requestId);await current;await rejected;s.host.dispose()
  })
  it('tears down flooded/malformed output without dispatching child instructions',()=>{
    const s=setup();s.port.receive({url:'https://example.com',type:'navigate'});expect(s.failure).toHaveBeenCalledWith('runtime');expect(s.frame.isConnected).toBe(false)
    const t=setup();for(let i=0;i<46;i++)t.reply('progress',{frames:i},0)
    expect(t.failure).toHaveBeenCalledWith('runtime')
  })
  it('coalesces input and sizes to one pending value and bounds input values',async()=>{
    const s=setup();await s.load()
    const audio={frame:null,legacyAmplitude:0,audioTime:1,playing:false,loaded:false}
    for(let i=0;i<100;i++)s.host.update({time:i,audio,pointer:{x:0,y:0,down:false}})
    s.host.resize(800,600);s.host.resize(900,700)
    await vi.advanceTimersByTimeAsync(34)
    expect(s.port.postMessage.mock.calls.filter(([m])=>m.type==='input')).toHaveLength(1)
    expect(s.port.postMessage.mock.calls.find(([m])=>m.type==='input')![0].payload.time).toBe(99)
    expect(()=>s.host.update({time:Infinity,audio,pointer:{x:0,y:0,down:false}})).toThrow();s.host.dispose()
  })
  it('observes progress only while active, then reports loss through recovery callback',async()=>{
    const s=setup();await s.load();s.host.setPlayback(false);await vi.advanceTimersByTimeAsync(2000)
    expect(s.failure).not.toHaveBeenCalled();s.host.setPlayback(true)
    await vi.advanceTimersByTimeAsync(800);s.reply('progress',{frames:1})
    await vi.advanceTimersByTimeAsync(700);expect(s.failure).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000);expect(s.failure).toHaveBeenCalledWith('progress-timeout')
  })
  it('rejects pending capture on switch/disposal and ignores late response',async()=>{
    const s=setup();await s.load();const cap=s.host.capture(),reject=expect(cap).rejects.toThrow(/Scene changed/)
    await s.load();await reject
    s.reply('captured',{bytes:new ArrayBuffer(10),type:'image/png',width:1,height:1},1,2)
    expect(s.failure).not.toHaveBeenCalled()
    const second=s.host.capture(),disposed=expect(second).rejects.toThrow(/stopped/);s.host.dispose();await disposed
    expect(s.port.onmessage).toBeNull()
  })
  it('removes a renderer that navigates after bootstrap',()=>{
    const s=setup();s.frame.dispatchEvent(new Event('load'));expect(s.failure).toHaveBeenCalledWith('runtime')
  })
  it('keeps at most one decoder active across scene replacement',async()=>{
    let finish!: (image: ImageBitmap)=>void
    const decode=vi.fn().mockImplementation(()=>new Promise<ImageBitmap>(resolve=>{finish=resolve}))
    const s=setup(decode);await s.load()
    const cap=s.host.capture({width:1,height:1}),rejected=expect(cap).rejects.toThrow(/Scene changed/)
    const command=s.port.postMessage.mock.calls.at(-1)![0]
    const bytes=new ArrayBuffer(33),a=new Uint8Array(bytes),v=new DataView(bytes)
    a.set([137,80,78,71,13,10,26,10]);v.setUint32(8,13);a.set([73,72,68,82],12);v.setUint32(16,1);v.setUint32(20,1)
    s.reply('captured',{bytes,type:'image/png',width:1,height:1},1,command.requestId)
    await s.load();await rejected
    await expect(s.host.capture()).rejects.toThrow(/unavailable/)
    expect(decode).toHaveBeenCalledOnce()
    const close=vi.fn();finish({width:1,height:1,close} as unknown as ImageBitmap)
    await Promise.resolve();await Promise.resolve();await Promise.resolve()
    expect(close).toHaveBeenCalledOnce();s.host.dispose()
  })
  it('does not queue replacement captures after a hung request timeout',async()=>{
    const s=setup();await s.load();s.host.setPlayback(false)
    const capture=s.host.capture(),rejected=expect(capture).rejects.toThrow(/stopped/)
    await vi.advanceTimersByTimeAsync(5001);await rejected
    await expect(s.host.capture()).rejects.toThrow(/unavailable/)
    expect(s.frame.isConnected).toBe(false)
  })
})
