import { createIsolatedPlayer } from '../src/modules/player/isolation/isolatedPlayer'
import { hasVerifiedParentBoundary } from '../src/modules/player/isolation/live-check/boundaryCheck'

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const container = element('player'), status = element('status')
const button = (id: string) => element<HTMLButtonElement>(id)
let player: ReturnType<typeof createIsolatedPlayer> | null = null
let alternate = false, paused = false, generation = 0, captureUrl: string | null = null
const controls = ['stop','switch','pause','reset','test-audio','clear','audio','simulate','response','volume','seek','capture-button']
const enable = (yes: boolean) => { controls.forEach(id => { (element(id) as HTMLInputElement).disabled = !yes }); button('start').disabled = yes }
function scene() {
  return { schemaVersion: 1, kind: 'custom', scene: { visualizer: { skyboxPreset: 6, scale: 1, shader: `let size = input(); let pointerDown = input();
setMaxIterations(80); setStepSize(0.7); rotateY(time * 0.4); rotateX(mouse.y * 0.4 + 0.35);
color(${alternate ? '0.12,0.7,0.65' : '0.45,0.16,0.9'}); ${alternate ? 'sphere(0.55 + size * 0.18 + pointerDown * 0.15);' : 'torus(0.7 + size * 0.15,0.16 + pointerDown * 0.1);'}` },
    controls: { target0: {x:0,y:0,z:0}, position0: {x:0,y:0,z:4.5},zoom0:1 },
    intent: {time_multiplier:0.5,autoRotate:false,fov:50,base_speed:0.2,minimizing_factor:0.8,power_factor:8,pointerDownMultiplier:1,easing_speed:0.6},
    fx: { passOrder:['bloom','outputPass'],bloom:{enabled:false},passes:{outputPass:true} },
    audioResponse: element<HTMLSelectElement>('response').value,
    audioResponseConfig: {version:1,sensitivity:1,mappings:[{target:'size',source:'bass-hit',amount:0.8,attack:0.02,release:0.35}]} } }
}
const reportError = (error: unknown) => { status.textContent = error instanceof Error ? error.message : 'The player could not complete this action.' }
async function action(run: () => void | Promise<unknown>) { try { await run() } catch (error) { reportError(error) } }
function stop() { generation++; player?.dispose(); player=null;enable(false);status.textContent='Player stopped and removed.' }
button('start').onclick=()=>void action(async()=>{
  stop();const current=generation
  player=createIsolatedPlayer({container,rendererUrl:import.meta.env.VITE_ISOLATED_RENDERER_URL || 'http://localhost:5181/index.html',profile:'preview',wheelZoom:true,
    onStatus:state=>{if(current===generation)status.textContent=`Player: ${state}.`},
    onFailure:()=>{if(current===generation){status.textContent='The player stopped safely. Start it again to retry.';enable(false)}}})
  await player.ready;await player.loadScene(scene());player.setVolume(0.4);enable(true);paused=false
  element('boundary').textContent=hasVerifiedParentBoundary(container.querySelector('iframe'))?'Verified: this page cannot access the separate renderer document.':'Isolation could not be verified.'
})
button('stop').onclick=stop
button('switch').onclick=()=>void action(async()=>{alternate=!alternate;await player?.loadScene(scene())})
button('pause').onclick=()=>void action(async()=>{paused=!paused;if(paused)player?.pause();else await player?.play();button('pause').textContent=paused?'Play':'Pause'})
button('reset').onclick=()=>void action(()=>{player?.reset();paused=true;button('pause').textContent='Play'})
button('clear').onclick=()=>player?.clearAudio()
element<HTMLInputElement>('simulate').onchange=event=>player?.setSynthetic((event.target as HTMLInputElement).checked,17,1)
element<HTMLSelectElement>('response').onchange=()=>void action(()=>player?.loadScene(scene()))
element<HTMLInputElement>('volume').oninput=event=>player?.setVolume(Number((event.target as HTMLInputElement).value))
element<HTMLInputElement>('audio').onchange=event=>void action(async()=>{const file=(event.target as HTMLInputElement).files?.[0];if(file)await player?.loadAudio(file)})
button('seek').onclick=()=>player?.seek(Math.max(0,(player.getAudioState().time)-5))
button('capture-button').onclick=()=>void action(async()=>{
  const current=generation, blob=await player?.capture({width:320,height:180,type:'image/png'})
  if(!blob || current!==generation)return
  if(captureUrl)URL.revokeObjectURL(captureUrl)
  captureUrl=URL.createObjectURL(blob);const image=element<HTMLImageElement>('capture');image.src=captureUrl;image.hidden=false
  status.textContent='Frame captured from the separate player.'
})
// A generated rhythm provides repeatable local audio without uploading user media.
function testRhythm() {
  const rate=22050,seconds=30,frames=rate*seconds,data=new ArrayBuffer(44+frames*2),v=new DataView(data)
  const ascii=(at:number,text:string)=>{for(let i=0;i<text.length;i++)v.setUint8(at+i,text.charCodeAt(i))}
  ascii(0,'RIFF');v.setUint32(4,36+frames*2,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,frames*2,true)
  for(let i=0;i<frames;i++){const t=i/rate,beat=t%0.5;v.setInt16(44+i*2,Math.sin(t*2*Math.PI*85)*Math.exp(-beat*18)*15000,true)}
  return new Blob([data],{type:'audio/wav'})
}
button('test-audio').onclick=()=>void action(async()=>{await player?.loadAudio(testRhythm());await player?.play();paused=false;button('pause').textContent='Pause'})
const timer=setInterval(()=>{if(!player)return;const state=player.getAudioState();element('audio-status').textContent=state.loaded?`${state.playing?'Music playing':'Music paused'} · ${state.time.toFixed(1)} / ${state.duration.toFixed(1)} seconds`:'No music loaded.'},250)
window.addEventListener('pagehide',()=>{clearInterval(timer);stop();if(captureUrl)URL.revokeObjectURL(captureUrl)})
