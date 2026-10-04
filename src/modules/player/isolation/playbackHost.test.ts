import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedPlaybackHost, type PlaybackHostDiagnostic } from './playbackHost'
import { playbackMessage, type PlaybackPayloads, type PlaybackType } from './playbackProtocol'
const SESSION='ec40c660-205d-4b63-b6b3-ac3888f8c9aa'
class Port {
  onmessage: ((e: MessageEvent)=>void)|null=null; onmessageerror:(()=>void)|null=null
  postMessage=vi.fn();start=vi.fn();close=vi.fn()
  receive(data:unknown){this.onmessage?.({data} as MessageEvent)}
}
const channels:Array<{port1:Port;port2:Port}>=[]
function setup(decodeCapture?: typeof createImageBitmap, useInlineFrameStyles = true, progressTimeoutMs = 1000, onDiagnostic?: (diagnostic: PlaybackHostDiagnostic) => void) {
  const container=document.createElement('div');document.body.append(container)
  const failure=vi.fn(),status=vi.fn(),healthy=vi.fn()
  const host=createIsolatedPlaybackHost({container,rendererUrl:'http://127.0.0.1:5181/',onFailure:failure,onStatus:status,onHealthy:healthy,startupTimeoutMs:100,progressTimeoutMs,decodeCapture,useInlineFrameStyles,onDiagnostic})
  const frame=container.querySelector('iframe')!,post=vi.spyOn(frame.contentWindow!,'postMessage').mockImplementation(()=>{})
  frame.dispatchEvent(new Event('load'))
  const port=channels.at(-1)!.port1
  function reply<T extends PlaybackType>(type:T,payload:PlaybackPayloads[T],generation=1,requestId=0,session=SESSION){port.receive(playbackMessage(type,session,generation,requestId,payload))}
  reply('ready',null,0)
  async function load(){const promise=host.loadScene({visualizer:{shader:'sphere(0.5);'}});await Promise.resolve();const m=port.postMessage.mock.calls.at(-1)![0];reply('loaded',null,m.generation,m.requestId);await promise}
  let frames=0
  const progress=(generation=1)=>reply('progress',{frames:++frames},generation)
  async function advanceProgress(milliseconds:number,generation=1) {
    for(let time=0;time<milliseconds;time+=500){await vi.advanceTimersByTimeAsync(500);progress(generation)}
  }
  return {host,frame,port,post,failure,status,healthy,reply,load,container,progress,advanceProgress}
}
beforeEach(()=>{
  vi.useFakeTimers();vi.stubEnv('DEV',true)
  vi.spyOn(document,'visibilityState','get').mockReturnValue('visible')
  vi.stubGlobal('window',{location:{href:'http://localhost:5178/'},addEventListener:vi.fn(),removeEventListener:vi.fn()})
  vi.stubGlobal('MessageChannel',class{port1=new Port();port2=new Port();constructor(){channels.push(this)}})
  vi.spyOn(crypto,'randomUUID').mockReturnValue(SESSION);channels.length=0
})
afterEach(()=>{document.body.replaceChildren();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals()})
describe('isolated playback host',()=>{
  it('removes a compiler-rejected frame and reports the fixed actionable reason without retrying',async()=>{
    const s=setup()
    const promise=s.host.loadScene({visualizer:{shader:'sphere(0.5);'}})
    const rejected=expect(promise).rejects.toThrow('Isolated player stopped.')
    await Promise.resolve()
    const request=s.port.postMessage.mock.calls.at(-1)![0]
    s.reply('error',{code:'compile'},request.generation,request.requestId)
    await rejected
    expect(s.failure).toHaveBeenCalledExactlyOnceWith('compile')
    expect(s.frame.isConnected).toBe(false)
    expect(s.port.close).toHaveBeenCalledOnce()
    expect(s.status).toHaveBeenLastCalledWith('error')
    await vi.advanceTimersByTimeAsync(30000)
    expect(s.container.querySelector('iframe')).toBeNull()
    expect(s.port.postMessage.mock.calls.filter(([message])=>message.type==='load')).toHaveLength(1)
    expect(s.healthy).not.toHaveBeenCalled()
  })
  it('does not accept a compile classification for an unrelated request',async()=>{
    const s=setup();await s.load()
    s.reply('error',{code:'compile'},1,999)
    expect(s.failure).toHaveBeenCalledExactlyOnceWith('runtime')
    expect(s.frame.isConnected).toBe(false)
  })
  it('reports only lifecycle labels and the parent time of accepted progress',async()=>{
    const clock=vi.spyOn(performance,'now').mockReturnValue(0),diagnostics:PlaybackHostDiagnostic[]=[]
    const s=setup(undefined,true,1000,diagnostic=>diagnostics.push(diagnostic));await s.load()
    clock.mockReturnValue(25);s.progress()
    s.reply('progress',{frames:1})
    s.reply('progress',{frames:2},0)
    s.reply('progress',{frames:2},1,99)
    s.host.dispose()
    expect(diagnostics).toEqual([
      {type:'status',at:0,status:'starting'},
      {type:'status',at:0,status:'ready'},
      {type:'status',at:0,status:'loading'},
      {type:'status',at:0,status:'playing'},
      {type:'progress',at:25},
      {type:'status',at:25,status:'disposed'},
    ])
  })
  it('reports a parent scheduling gap resetting silence before the unchanged timeout removes the frame',async()=>{
    const clock=vi.spyOn(performance,'now').mockReturnValue(0),diagnostics:PlaybackHostDiagnostic[]=[]
    const s=setup(undefined,true,1000,diagnostic=>diagnostics.push(diagnostic));await s.load()
    for(const at of [250,500,4500,4750,5000,5250]){
      clock.mockReturnValue(at);await vi.advanceTimersByTimeAsync(250)
      expect(s.failure).not.toHaveBeenCalled()
      expect(s.frame.isConnected).toBe(true)
    }
    clock.mockReturnValue(5500);await vi.advanceTimersByTimeAsync(250)
    expect(diagnostics.filter(diagnostic=>diagnostic.type==='watchdog')).toEqual([
      {type:'watchdog',at:250,deltaMs:250,silenceMs:0,progressAgeMs:250,resetReason:'recent-progress'},
      {type:'watchdog',at:500,deltaMs:250,silenceMs:250,progressAgeMs:500,resetReason:'none'},
      {type:'watchdog',at:4500,deltaMs:4000,silenceMs:0,progressAgeMs:4500,resetReason:'parent-gap'},
      {type:'watchdog',at:4750,deltaMs:250,silenceMs:250,progressAgeMs:4750,resetReason:'none'},
      {type:'watchdog',at:5000,deltaMs:250,silenceMs:500,progressAgeMs:5000,resetReason:'none'},
      {type:'watchdog',at:5250,deltaMs:250,silenceMs:750,progressAgeMs:5250,resetReason:'none'},
      {type:'watchdog',at:5500,deltaMs:250,silenceMs:1000,progressAgeMs:5500,resetReason:'none'},
    ])
    expect(diagnostics.slice(-2)).toEqual([
      {type:'status',at:5500,status:'error'},
      {type:'failure',at:5500,reason:'progress-timeout'},
    ])
    expect(s.failure).toHaveBeenCalledExactlyOnceWith('progress-timeout')
    expect(s.frame.isConnected).toBe(false)
    expect(s.port.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('labels inactive and backwards-clock watchdog resets',async()=>{
    const clock=vi.spyOn(performance,'now').mockReturnValue(0),diagnostics:PlaybackHostDiagnostic[]=[]
    const s=setup(undefined,true,1000,diagnostic=>diagnostics.push(diagnostic))
    clock.mockReturnValue(250);await vi.advanceTimersByTimeAsync(250)
    await s.load();s.host.setPlayback(false)
    clock.mockReturnValue(500);await vi.advanceTimersByTimeAsync(250)
    s.host.setPlayback(true)
    vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden')
    clock.mockReturnValue(750);await vi.advanceTimersByTimeAsync(250)
    vi.spyOn(document,'visibilityState','get').mockReturnValue('visible')
    clock.mockReturnValue(700);await vi.advanceTimersByTimeAsync(250)
    expect(diagnostics.filter(diagnostic=>diagnostic.type==='watchdog')).toEqual([
      {type:'watchdog',at:250,deltaMs:250,silenceMs:0,progressAgeMs:250,resetReason:'not-loaded'},
      {type:'watchdog',at:500,deltaMs:250,silenceMs:0,progressAgeMs:250,resetReason:'paused'},
      {type:'watchdog',at:750,deltaMs:250,silenceMs:0,progressAgeMs:250,resetReason:'hidden'},
      {type:'watchdog',at:700,deltaMs:-50,silenceMs:0,progressAgeMs:200,resetReason:'invalid-clock'},
    ])
    expect(s.failure).not.toHaveBeenCalled();s.host.dispose()
  })
  it.each(['absent','throwing'] as const)('preserves pause, timeout and cleanup with an %s diagnostic observer',async observer=>{
    const onDiagnostic=observer==='throwing'?vi.fn((diagnostic:PlaybackHostDiagnostic)=>{throw new Error(`Observer failed for ${diagnostic.type}.`)}):undefined
    const s=setup(undefined,true,1000,onDiagnostic);await s.load();s.progress()
    s.host.setPlayback(false);await vi.advanceTimersByTimeAsync(1500)
    expect(s.failure).not.toHaveBeenCalled();expect(s.frame.isConnected).toBe(true)
    s.host.setPlayback(true);await vi.advanceTimersByTimeAsync(1249)
    expect(s.failure).not.toHaveBeenCalled();expect(s.frame.isConnected).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.failure).toHaveBeenCalledExactlyOnceWith('progress-timeout')
    expect(s.status.mock.calls.map(([status])=>status)).toEqual(['starting','ready','loading','playing','paused','playing','error'])
    expect(s.frame.isConnected).toBe(false);expect(s.port.onmessage).toBeNull();expect(s.port.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    if(onDiagnostic)expect(onDiagnostic.mock.calls.map(([diagnostic])=>diagnostic.type)).toEqual(expect.arrayContaining(['status','progress','watchdog','failure']))
  })
  it('requires ten seconds between fresh frame reports and reports subsequent healthy intervals',async()=>{
    const s=setup(undefined,true,30000);await s.load()
    expect(s.healthy).not.toHaveBeenCalled()
    s.progress()
    await vi.advanceTimersByTimeAsync(12000)
    expect(s.healthy).not.toHaveBeenCalled()
    expect(s.failure).not.toHaveBeenCalled()
    s.progress()
    await s.advanceProgress(9500)
    expect(s.healthy).not.toHaveBeenCalled()
    await s.advanceProgress(500)
    expect(s.healthy).toHaveBeenCalledOnce()
    await s.advanceProgress(10000)
    expect(s.healthy).toHaveBeenCalledTimes(2)
    s.host.dispose()
  })
  it('starts a new healthy streak after pauses and foreground visibility changes',async()=>{
    const s=setup(undefined,true,30000);await s.load();s.progress()
    await s.advanceProgress(9000)
    s.host.setPlayback(false)
    await s.advanceProgress(12000)
    expect(s.healthy).not.toHaveBeenCalled()
    s.host.setPlayback(true);s.progress()
    await s.advanceProgress(9000)
    vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await s.advanceProgress(12000)
    expect(s.healthy).not.toHaveBeenCalled()
    vi.spyOn(document,'visibilityState','get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'));s.progress()
    await s.advanceProgress(9500)
    expect(s.healthy).not.toHaveBeenCalled()
    await s.advanceProgress(500)
    expect(s.healthy).toHaveBeenCalledOnce();s.host.dispose()
  })
  it('discards partial health after a frame gap longer than two seconds',async()=>{
    const s=setup(undefined,true,30000);await s.load();s.progress()
    await s.advanceProgress(9000)
    await vi.advanceTimersByTimeAsync(2500);s.progress()
    await s.advanceProgress(9500)
    expect(s.healthy).not.toHaveBeenCalled()
    await s.advanceProgress(500)
    expect(s.healthy).toHaveBeenCalledOnce();s.host.dispose()
  })
  it('does not count old generations or duplicate progress, and resets when the scene loads',async()=>{
    const s=setup(undefined,true,30000);await s.load();s.progress()
    await s.advanceProgress(9000)
    await s.load()
    await s.advanceProgress(12000,1)
    expect(s.healthy).not.toHaveBeenCalled()
    s.progress(2)
    for(let i=0;i<20;i++){
      await vi.advanceTimersByTimeAsync(500)
      s.reply('progress',{frames:1},2)
    }
    expect(s.healthy).not.toHaveBeenCalled()
    s.progress(2)
    await s.advanceProgress(10000,2)
    expect(s.healthy).toHaveBeenCalledOnce();s.host.dispose()
  })
  it('does not count browser suspension even when queued progress arrives on resume',async()=>{
    const s=setup(undefined,true,30000);await s.load();s.progress()
    await s.advanceProgress(9000)
    const resumeAt=performance.now()+60000
    const suspendedClock=vi.spyOn(performance,'now').mockReturnValue(resumeAt)
    await vi.advanceTimersByTimeAsync(250)
    s.progress()
    expect(s.healthy).not.toHaveBeenCalled()
    for(let i=1;i<=19;i++){
      suspendedClock.mockReturnValue(resumeAt+i*500)
      await vi.advanceTimersByTimeAsync(500);s.progress()
    }
    expect(s.healthy).not.toHaveBeenCalled()
    suspendedClock.mockReturnValue(resumeAt+10000)
    await vi.advanceTimersByTimeAsync(500);s.progress()
    expect(s.healthy).toHaveBeenCalledOnce();s.host.dispose()
  })
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
