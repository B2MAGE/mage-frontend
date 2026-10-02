import type { ShaderSceneOption } from './sceneEditor'

// Fixed presets: keep their authored audio response in the shader itself.
export const ADDITIONAL_SHADER_SCENES: ShaderSceneOption[] = [
  {
    id: 'reaction-rings-v1',
    label: 'Ripple Rings',
    description: 'Three luminous rings breathe gently and ripple independently with sound.',
    shader: `setMaxIterations(100); setStepSize(0.65);
let size = input(); let pointerDown = input();
let reactionAudio = max(size, 0) * 3;
let reactionEnvelope = reactionAudio / (1 + reactionAudio * 0.65);
let reactionPulse = reactionEnvelope * 1;
let reactionDeformation = reactionEnvelope * 1;
let reactionTime = time * 0.4;
let reactionScale = (1 + sin(reactionTime * 0.8) * 0.025) * (1 + reactionPulse * 0.2);
noLighting();

reset(); union(); rotateY(mouse.x * 0.2); rotateX(PI / 2 + mouse.y * 0.15);
let ringSpace0 = getSpace();
let ringAngle0 = atan(ringSpace0.z, ringSpace0.x + 0.00001);
let ringWave0 = sin(ringAngle0 * 3 + reactionTime * 0.45 + 0) * 0.65
  + sin(ringAngle0 * 5 - reactionTime * 0.3) * 0.35;
color(0.48, 0.26, 0.95);
torus((0.135 + ringWave0 * (0.0018 + reactionDeformation * 0.032 + pointerDown * 0.003)) * reactionScale, 0.0038 * reactionScale);

reset(); union(); rotateY(mouse.x * 0.2); rotateX(PI / 2 + mouse.y * 0.15);
let ringSpace1 = getSpace();
let ringAngle1 = atan(ringSpace1.z, ringSpace1.x + 0.00001);
let ringWave1 = sin(ringAngle1 * 4 + reactionTime * 0.45 + 1.7) * 0.65
  + sin(ringAngle1 * 6 - reactionTime * 0.3) * 0.35;
color(0.08, 0.65, 0.58);
torus((0.093 + ringWave1 * (0.0013 + reactionDeformation * 0.021 + pointerDown * 0.003)) * reactionScale, 0.0034 * reactionScale);

reset(); union(); rotateY(mouse.x * 0.2); rotateX(PI / 2 + mouse.y * 0.15);
let ringSpace2 = getSpace();
let ringAngle2 = atan(ringSpace2.z, ringSpace2.x + 0.00001);
let ringWave2 = sin(ringAngle2 * 2 + reactionTime * 0.45 + 3.4) * 0.65
  + sin(ringAngle2 * 4 - reactionTime * 0.3) * 0.35;
color(0.95, 0.3, 0.5);
torus((0.055 + ringWave2 * (0.0009 + reactionDeformation * 0.012 + pointerDown * 0.003)) * reactionScale, 0.003 * reactionScale);

reset(); union(); color(0.65, 0.48, 1);
sphere(0.018 * reactionScale);
`,
  },
  {
    id: 'reaction-lantern-v1',
    label: 'Tidal Lantern',
    description: 'An iridescent bell and flowing strands ripple with the music.',
    shader: `setMaxIterations(100); setStepSize(0.65);
let size = input(); let pointerDown = input();
let reactionAudio = max(size, 0) * 3;
let reactionEnvelope = reactionAudio / (1 + reactionAudio * 0.65);
let reactionPulse = reactionEnvelope * 1;
let reactionDeformation = reactionEnvelope * 1;
let reactionTime = time * 0.4;
let reactionScale = (1 + sin(reactionTime * 0.8) * 0.025) * (1 + reactionPulse * 0.2);
metal(0.25); shine(0.6);
reset(); rotateY(mouse.x * 0.3 + sin(reactionTime * 0.3) * 0.08); rotateX(mouse.y * 0.18);
let lanternSpace = getSpace(); setSpace(lanternSpace.x / reactionScale, lanternSpace.y / reactionScale, lanternSpace.z / reactionScale);
displace(0, 0.06, 0);
let shellSpace = getSpace();
let shellAngle = atan(shellSpace.z, shellSpace.x + 0.00001);
let shellRipple = sin(shellAngle * 6 + shellSpace.y * 24 - reactionTime * 0.7);
let shellWarp = 0.018 + reactionDeformation * 0.16 + pointerDown * 0.06;
setSpace(shellSpace.x * (1 + shellRipple * shellWarp), shellSpace.y * 1.55, shellSpace.z * (1 + shellRipple * shellWarp));
color(0.18 + nsin(shellAngle * 2 + reactionTime * 0.4) * 0.45, 0.36, 0.85);
sphere(0.092);
difference(); displace(0, -0.11, 0); box(vec3(0.2, 0.11, 0.2));

reset(); union(); rotateY(mouse.x * 0.3 + sin(reactionTime * 0.3) * 0.08); rotateX(mouse.y * 0.18);
let strandScale0 = getSpace(); setSpace(strandScale0.x / reactionScale, strandScale0.y / reactionScale, strandScale0.z / reactionScale);
displace(0.052, -0.035, 0);
let strandSpace0 = getSpace();
let strandWave0 = 0.004 + reactionDeformation * 0.009 + pointerDown * 0.003;
setSpace(strandSpace0.x + sin(strandSpace0.y * 35 + reactionTime * 0.8 + 0) * strandWave0, strandSpace0.y, strandSpace0.z + cos(strandSpace0.y * 29 - reactionTime * 0.65 + 0) * strandWave0);
color(0.72, 0.22, 0.85);
cylinder(0.0028, 0.058);

reset(); union(); rotateY(mouse.x * 0.3 + sin(reactionTime * 0.3) * 0.08); rotateX(mouse.y * 0.18);
let strandScale1 = getSpace(); setSpace(strandScale1.x / reactionScale, strandScale1.y / reactionScale, strandScale1.z / reactionScale);
displace(0.026, -0.035, 0.045033);
let strandSpace1 = getSpace();
let strandWave1 = 0.004 + reactionDeformation * 0.009 + pointerDown * 0.003;
setSpace(strandSpace1.x + sin(strandSpace1.y * 35 + reactionTime * 0.8 + 1) * strandWave1, strandSpace1.y, strandSpace1.z + cos(strandSpace1.y * 29 - reactionTime * 0.65 + 1) * strandWave1);
color(0.16, 0.7, 0.64);
cylinder(0.0028, 0.07);

reset(); union(); rotateY(mouse.x * 0.3 + sin(reactionTime * 0.3) * 0.08); rotateX(mouse.y * 0.18);
let strandScale2 = getSpace(); setSpace(strandScale2.x / reactionScale, strandScale2.y / reactionScale, strandScale2.z / reactionScale);
displace(-0.026, -0.035, 0.045033);
let strandSpace2 = getSpace();
let strandWave2 = 0.004 + reactionDeformation * 0.009 + pointerDown * 0.003;
setSpace(strandSpace2.x + sin(strandSpace2.y * 35 + reactionTime * 0.8 + 2) * strandWave2, strandSpace2.y, strandSpace2.z + cos(strandSpace2.y * 29 - reactionTime * 0.65 + 2) * strandWave2);
color(0.72, 0.22, 0.85);
cylinder(0.0028, 0.082);

reset(); union(); rotateY(mouse.x * 0.3 + sin(reactionTime * 0.3) * 0.08); rotateX(mouse.y * 0.18);
let strandScale3 = getSpace(); setSpace(strandScale3.x / reactionScale, strandScale3.y / reactionScale, strandScale3.z / reactionScale);
displace(-0.052, -0.035, 0);
let strandSpace3 = getSpace();
let strandWave3 = 0.004 + reactionDeformation * 0.009 + pointerDown * 0.003;
setSpace(strandSpace3.x + sin(strandSpace3.y * 35 + reactionTime * 0.8 + 3) * strandWave3, strandSpace3.y, strandSpace3.z + cos(strandSpace3.y * 29 - reactionTime * 0.65 + 3) * strandWave3);
color(0.16, 0.7, 0.64);
cylinder(0.0028, 0.058);

reset(); union(); rotateY(mouse.x * 0.3 + sin(reactionTime * 0.3) * 0.08); rotateX(mouse.y * 0.18);
let strandScale4 = getSpace(); setSpace(strandScale4.x / reactionScale, strandScale4.y / reactionScale, strandScale4.z / reactionScale);
displace(-0.026, -0.035, -0.045033);
let strandSpace4 = getSpace();
let strandWave4 = 0.004 + reactionDeformation * 0.009 + pointerDown * 0.003;
setSpace(strandSpace4.x + sin(strandSpace4.y * 35 + reactionTime * 0.8 + 4) * strandWave4, strandSpace4.y, strandSpace4.z + cos(strandSpace4.y * 29 - reactionTime * 0.65 + 4) * strandWave4);
color(0.72, 0.22, 0.85);
cylinder(0.0028, 0.07);

reset(); union(); rotateY(mouse.x * 0.3 + sin(reactionTime * 0.3) * 0.08); rotateX(mouse.y * 0.18);
let strandScale5 = getSpace(); setSpace(strandScale5.x / reactionScale, strandScale5.y / reactionScale, strandScale5.z / reactionScale);
displace(0.026, -0.035, -0.045033);
let strandSpace5 = getSpace();
let strandWave5 = 0.004 + reactionDeformation * 0.009 + pointerDown * 0.003;
setSpace(strandSpace5.x + sin(strandSpace5.y * 35 + reactionTime * 0.8 + 5) * strandWave5, strandSpace5.y, strandSpace5.z + cos(strandSpace5.y * 29 - reactionTime * 0.65 + 5) * strandWave5);
color(0.16, 0.7, 0.64);
cylinder(0.0028, 0.082);
`,
  },
]
