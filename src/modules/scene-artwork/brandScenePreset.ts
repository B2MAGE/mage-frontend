import type { MageSceneBlob } from '@modules/player'

// Use the same silent beat as thumbnail previews, amplified here so the rings
// visibly react. Clamped geometry and a fixed camera keep the scene in frame.
// Each ring has its own bounded, beat-driven contour instead of scaling as a
// perfect circle. Only the in-plane shape changes; the camera never tilts.
// A shared 3.5% scale adds a roughly seven-second breath even without audio
// (shader time advances at 0.4x). Beat deformation remains independent.
// Unlit colors are tuned through MAGE's color pipeline to match the homepage's
// lavender, teal and pink artwork. The halo comes from native bloom below.
export const BRAND_SCENE: MageSceneBlob = {
  visualizer: {
    skyboxPreset: 6,
    scale: 1.25,
    shader: `
      setMaxIterations(100); setStepSize(0.7);
      let size = input(); let pointerDown = input();
      let beat = min(max((size - 0.05) * 6, 0), 1);
      let breathScale = 1 + sin(time * 2.25) * 0.035;
      let drift = sin(time * 0.45) * 0.35;
      noLighting();

      reset(); rotateX(PI / 2);
      let outerSpace = getSpace();
      let outerAngle = atan(outerSpace.z, outerSpace.x + 0.00001);
      let outerWarp = sin(outerAngle * 2 + drift) * 0.62
        + sin(outerAngle * 3 - drift * 0.7 + 0.4) * 0.38;
      color(0.2, 0.12, 1.25);
      torus((1.12 + beat * 0.045 + (0.035 + beat * 0.1) * outerWarp) * breathScale, (0.014 + beat * 0.005) * breathScale);

      reset(); rotateX(PI / 2);
      let middleSpace = getSpace();
      let middleAngle = atan(middleSpace.z, middleSpace.x + 0.00001);
      let middleWarp = sin(middleAngle * 3 - drift * 0.8 + 1.7) * 0.58
        + sin(middleAngle * 2 + drift * 0.6 - 0.9) * 0.42;
      color(0.002, 0.28, 0.16);
      torus((0.8 + beat * 0.025 + (0.028 + beat * 0.075) * middleWarp) * breathScale, (0.013 + beat * 0.004) * breathScale);

      reset(); rotateX(PI / 2);
      let innerSpace = getSpace();
      let innerAngle = atan(innerSpace.z, innerSpace.x + 0.00001);
      let innerWarp = sin(innerAngle * 2 + drift * 0.6 + 2.4) * 0.64
        + sin(innerAngle * 4 - drift * 0.5 + 0.8) * 0.36;
      color(0.32, 0.005, 0.11);
      torus((0.49 + beat * 0.02 + (0.018 + beat * 0.055) * innerWarp) * breathScale, (0.011 + beat * 0.003) * breathScale);

      reset(); color(0.07, 0.035, 0.8);
      sphere((0.14 + beat * 0.07) * breathScale);
    `,
  },
  controls: { target0: { x: 0, y: 0, z: 0 }, position0: { x: 0, y: 0, z: 4.6 }, zoom0: 1 },
  intent: {
    time_multiplier: 0.4,
    minimizing_factor: 0.5,
    power_factor: 2,
    pointerDownMultiplier: 0,
    base_speed: 0.12,
    easing_speed: 0.55,
    camTilt: 0,
    camOrientationMode: 0,
    camOrientationSpeed: 0,
    autoRotate: false,
    autoRotateSpeed: 0,
    fov: 50,
  },
  fx: {
    passOrder: ['bloom', 'outputPass'],
    bloom: { enabled: true, strength: 0.65, radius: 0.75, threshold: 0.22 },
    toneMapping: { method: 4, exposure: 0.55 },
    passes: {
      rgbShift: false, dot: false, technicolor: false, luminosity: false,
      afterImage: false, sobel: false, glitch: false, colorify: false,
      halftone: false, gammaCorrection: false, kaleid: false, outputPass: true,
    },
  },
  state: { size: 0, pointerDown: 0, currPointerDown: 0, currAudio: 0, time: 1, volume_multiplier: 0 },
}
