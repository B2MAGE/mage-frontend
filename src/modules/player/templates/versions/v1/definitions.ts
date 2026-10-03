import type { TemplateDefinition } from '../../templateRegistry'

// Immutable version 1 snapshots of the 16 presets available when PP-B01 shipped.
// Never edit these definitions for a catalog refresh; add a new template version.
export const TEMPLATE_DEFINITIONS_V1: readonly TemplateDefinition[] = Object.freeze([
  Object.freeze({
    templateId: 'embedded-scene-0',
    templateVersion: 1 as const,
    label: 'Prism Core',
    description: 'Bundled engine scene with layered box frames and a reflective core sphere.',
    shader: `
      let size = input()
      let pointerDown = input()
      time = .3*time
      size *= 1.3
      rotateY(mouse.x * -2 * PI / 2 * (1+nsin(time)))
      rotateX(mouse.y * 2 * PI / 2 * (1+nsin(time)))
      metal(.5*size)
      let rayDir = normalize(getRayDirection())
      let clampedColor = vec3(rayDir.x+.2, rayDir.y+.25, rayDir.z+.2)
      color(clampedColor)

      rotateY(sin(getRayDirection().y*8*(ncos(sin(time)))+size))
      rotateX(cos((getRayDirection().x*16*nsin(time)+size)))
      rotateZ(ncos((getRayDirection().z*4*cos(time)+size)))
      boxFrame(vec3(size), size*.1)
      shine(0.8*size)
      blend(nsin(time*(size))*0.1+0.1)
      sphere(size/2-pointerDown*.3)
      blend(ncos((time*(size)))*0.1+0.1)
      boxFrame(vec3(size-.075*pointerDown), size)
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-1',
    templateVersion: 1 as const,
    label: 'Steel Lattice',
    description: 'Bundled engine scene built from stacked grids and box frames.',
    shader: `
      setMaxIterations(101);
      setStepSize(0.7260629659452175);

      let size = input();
      let pointerDown = input();
      time *= .1;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.43262751221303614, 0.4925493880484813, 0.4820048306239232);

      rotateX(getRayDirection().y * 1.2506225601940093 + time);
      rotateY(getRayDirection().x * 1.2506225601940093 + time);
      rotateZ(getRayDirection().z * 1.2506225601940093 + time);

      metal(0.5870582642599769 * size);
      shine(0.6708057727257557);

      grid(
        3,
        size * 0.7174867540818692 - pointerDown * 0.05 / 3,
        0.01 * size * 0.7174867540818692 - pointerDown * 0.05,
      );
      boxFrame(
        vec3(size * 0.6287507765216367 - pointerDown * 0.05),
        size * 0.6287507765216367 - pointerDown * 0.05 * 0.1,
      );
      boxFrame(
        vec3(size * 0.6816361304019778 - pointerDown * 0.05),
        size * 0.6816361304019778 - pointerDown * 0.05 * 0.1,
      );

      blend(nsin(time * size) * 0.22812291319767167);

      boxFrame(vec3(size * 0.7), size * 0.05);
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-2',
    templateVersion: 1 as const,
    label: 'Aqua Static',
    description: 'Bundled engine scene with noisy box frames and layered grid distortion.',
    shader: `
      setMaxIterations(133);
      setStepSize(0.8632297724861512);

      let size = input();
      let pointerDown = input();
      time *= 0.131579219319508;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.08256470259178794, 0.782309705948631, 0.763003005740327);

      let s = getSpace();

      rotateX(getRayDirection().y * 2.154824707715323 + time);
      rotateY(getRayDirection().x * 2.583074645636565 + time);
      rotateZ(getRayDirection().z * 2.9303390219795165 + time);

      metal(0.5728721327171771 * size);
      shine(0.36898649780731946);

      expand(noise(s * 0.1080185521425232) * 0.39571611124777173);
      boxFrame(
        vec3(size * 0.8865473246350158 - pointerDown * 0.05),
        size * 0.8865473246350158 - pointerDown * 0.05 * 0.1,
      );
      expand(noise(s * 1.768209282106819) * 0.030656382800295368);
      boxFrame(
        vec3(size * 0.6350550547291461 - pointerDown * 0.05),
        size * 0.6350550547291461 - pointerDown * 0.05 * 0.1,
      );
      expand(noise(s * 0.22270041645902117) * 0.41792724482850996);
      grid(
        3,
        size * 0.6596742230897178 - pointerDown * 0.05 / 3,
        0.01 * size * 0.6596742230897178 - pointerDown * 0.05,
      );

      blend(nsin(time * size) * 0.280208045235598);

      grid(1.99, size * 4, max(0.001, size * 0.003));
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-3',
    templateVersion: 1 as const,
    label: 'Verdant Frames',
    description: 'Bundled engine scene with twin box frames and green edge-lit motion.',
    shader: `
      setMaxIterations(71);
      setStepSize(0.4414923770441956);

      let size = input();
      let pointerDown = input();
      time *= .1;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.14998612477802592, 0.47642472828922455, 0.0644383761978728);

      rotateX(getRayDirection().y * 2.9789122078821793 + time);
      rotateY(getRayDirection().x * 2.9789122078821793 + time);
      rotateZ(getRayDirection().z * 2.9789122078821793 + time);

      metal(0.6434036988763767 * size);
      shine(0.34486068234140727);

      boxFrame(
        vec3(size * 0.8239408771788657 - pointerDown * 0.05),
        size * 0.8239408771788657 - pointerDown * 0.05 * 0.1,
      );
      boxFrame(
        vec3(size * 0.9606847874663808 - pointerDown * 0.05),
        size * 0.9606847874663808 - pointerDown * 0.05 * 0.1,
      );

      blend(nsin(time * size) * 0.25980941491680876);

      grid(2, size * 4, max(0.001, size * 0.003));
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-4',
    templateVersion: 1 as const,
    label: 'Crimson Reactor',
    description: 'Bundled engine scene with framed cylinders, a noisy core sphere, and a grid floor.',
    shader: `
      setMaxIterations(161);
      setStepSize(0.7431197197400152);

      let size = input();
      let pointerDown = input();
      time *= 0.15934458017140202;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.8939736534961771, 0.15343539973164377, 0.2647498251648912);

      let s = getSpace();

      rotateX(getRayDirection().y * 2.4340193013105202 + time);
      rotateY(getRayDirection().x * 1.7776157305492712 + time);
      rotateZ(getRayDirection().z * 1.7322517724210127 + time);

      metal(0.5135977939307566 * size);
      shine(0.4793980848131761);

      boxFrame(
        vec3(size * 0.8161210436163664 - pointerDown * 0.05),
        size * 0.8161210436163664 - pointerDown * 0.05 * 0.1,
      );
      cylinder(
        size * 0.8534422954798347 - pointerDown * 0.05 / 4,
        size * 0.8534422954798347 - pointerDown * 0.05,
      );
      cylinder(
        size * 0.7693094322944559 - pointerDown * 0.05 / 4,
        size * 0.7693094322944559 - pointerDown * 0.05,
      );
      expand(noise(s * 0.1959164091445773) * 0.09097642567410547);
      sphere(size * 0.886879464900987 - pointerDown * 0.05 / 2);

      blend(nsin(time * size) * 0.17222512677372692);

      grid(1, size * 4, max(0.001, size * 0.003));
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-5',
    templateVersion: 1 as const,
    label: 'Alloy Capsule',
    description: 'Bundled engine scene combining a metallic cylinder shell with a central sphere.',
    shader: `
      setMaxIterations(56);
      setStepSize(0.04586632133333666);

      let size = input();
      let pointerDown = input();
      time *= .1;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.24020625518667676, 0.2651915227911193, 0.21629480224767128);

      rotateX(getRayDirection().y * 1.9599006869721014 + time);
      rotateY(getRayDirection().x * 1.9599006869721014 + time);
      rotateZ(getRayDirection().z * 1.9599006869721014 + time);

      metal(0.6304962928840792 * size);
      shine(0.6210181878056416);

      cylinder(
        size * 0.9446738625954518 - pointerDown * 0.05 / 4,
        size * 0.9446738625954518 - pointerDown * 0.05,
      );
      sphere(size * 0.7023682612074287 - pointerDown * 0.05 / 2);

      blend(nsin(time * size) * 0.11435451161014794);

      sphere(size / 3);
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-6',
    templateVersion: 1 as const,
    label: 'Redline Core',
    description: 'Bundled engine scene with a dominant sphere, cylinder, and dense grid accent.',
    shader: `
      setMaxIterations(198);
      setStepSize(0.8838993805155669);

      let size = input();
      let pointerDown = input();
      time *= .1;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.9514769334666449, 0.1077350724621205, 0);

      rotateX(getRayDirection().y * 2.1969051528600634 + time);
      rotateY(getRayDirection().x * 2.1969051528600634 + time);
      rotateZ(getRayDirection().z * 2.1969051528600634 + time);

      metal(0.7125574975041655 * size);
      shine(0.5774589834819871);

      sphere(size * 0.9935175302558173 - pointerDown * 0.05 / 2);
      cylinder(
        size * 0.9289837692896183 - pointerDown * 0.05 / 4,
        size * 0.9289837692896183 - pointerDown * 0.05,
      );
      grid(
        5,
        size * 0.5167759726831176 - pointerDown * 0.05 / 3,
        0.01 * size * 0.5167759726831176 - pointerDown * 0.05,
      );

      blend(nsin(time * size) * 0.22861033952631743);

      grid(2, size * 4, max(0.001, size * 0.003));
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-7',
    templateVersion: 1 as const,
    label: 'Violet Matrix',
    description: 'Bundled engine scene with layered grids and a saturated violet sphere.',
    shader: `
      setMaxIterations(193);
      setStepSize(0.7999169963821687);

      let size = input();
      let pointerDown = input();
      time *= .1;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.11460860093209857, 0.007694076675091144, 0.4671766017485241);

      rotateX(getRayDirection().y * 2.0857194147559914 + time);
      rotateY(getRayDirection().x * 2.0857194147559914 + time);
      rotateZ(getRayDirection().z * 2.0857194147559914 + time);

      metal(0.5711799571404537 * size);
      shine(0.5590513531439385);

      grid(
        5,
        size * 0.7173114499365616 - pointerDown * 0.05 / 3,
        0.01 * size * 0.7173114499365616 - pointerDown * 0.05,
      );
      grid(
        4,
        size * 0.6514999435141519 - pointerDown * 0.05 / 3,
        0.01 * size * 0.6514999435141519 - pointerDown * 0.05,
      );
      sphere(size * 0.7684034276974527 - pointerDown * 0.05 / 2);

      blend(nsin(time * size) * 0.1017060511129565);

      sphere(size / 3);
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-8',
    templateVersion: 1 as const,
    label: 'Mint Halo',
    description: 'Bundled engine scene with a torus frame, noisy grids, and a bright center sphere.',
    shader: `
      setMaxIterations(186);
      setStepSize(0.8615043142034936);

      let size = input();
      let pointerDown = input();
      time *= .1;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.4050203196259186, 0.7752881097617492, 0.451950921258232);

      rotateX(getRayDirection().y * 1.4049960809220177 + time);
      rotateY(getRayDirection().x * 1.4049960809220177 + time);
      rotateZ(getRayDirection().z * 1.4049960809220177 + time);

      metal(0.6607251320316083 * size);
      shine(0.6646852498948923);

      torus(
        size * 0.7885283144721178 - pointerDown * 0.05,
        size * 0.7885283144721178 - pointerDown * 0.05 / 4,
      );
      grid(
        3,
        size * 0.5103440758834754 - pointerDown * 0.05 / 3,
        0.01 * size * 0.5103440758834754 - pointerDown * 0.05,
      );
      boxFrame(
        vec3(size * 0.57344769639438 - pointerDown * 0.05),
        size * 0.57344769639438 - pointerDown * 0.05 * 0.1,
      );
      grid(
        3,
        size * 0.5749414312428847 - pointerDown * 0.05 / 3,
        0.01 * size * 0.5749414312428847 - pointerDown * 0.05,
      );
      sphere(size * 0.6151950610078535 - pointerDown * 0.05 / 2);

      blend(nsin(time * size) * 0.19517422836065718);

      grid(1, size * 4, max(0.001, size * 0.003));
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-9',
    templateVersion: 1 as const,
    label: 'Ember Grid',
    description: 'Bundled engine scene with orange framing and a tight supporting grid.',
    shader: `
      setMaxIterations(56);
      setStepSize(0.7549446257595138);

      let size = input();
      let pointerDown = input();
      time *= .1;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.9995767105459568, 0.3013572617092242, 0);

      rotateX(getRayDirection().y * 2.7452866417099218 + time);
      rotateY(getRayDirection().x * 2.7452866417099218 + time);
      rotateZ(getRayDirection().z * 2.7452866417099218 + time);

      metal(0.4757753414424941 * size);
      shine(0.4905478148343774);

      boxFrame(
        vec3(size * 0.7439170606081622 - pointerDown * 0.05),
        size * 0.7439170606081622 - pointerDown * 0.05 * 0.1,
      );
      grid(
        3,
        size * 0.508466039994321 - pointerDown * 0.05 / 3,
        0.01 * size * 0.508466039994321 - pointerDown * 0.05,
      );

      blend(nsin(time * size) * 0.10155951925016898);

      sphere(size / 3);
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-10',
    templateVersion: 1 as const,
    label: 'Emerald Ring',
    description: 'Bundled engine scene with a torus and box frame at maximum scale.',
    shader: `
      setMaxIterations(151);
      setStepSize(0.26597607104610804);

      let size = input();
      let pointerDown = input();
      time *= .1;
      rotateY(mouse.x * -5 * PI / 2 + time - (pointerDown + 0.1));
      rotateX(mouse.y * 5 * PI / 2 + time);

      color(0.19651749597261697, 0.914203219207783, 0.24550611194053884);

      rotateX(getRayDirection().y * 1.9938824658616179 + time);
      rotateY(getRayDirection().x * 1.9938824658616179 + time);
      rotateZ(getRayDirection().z * 1.9938824658616179 + time);

      metal(0.31594207653292694 * size);
      shine(0.3832572948846391);

      torus(
        size * 0.8810248079142805 - pointerDown * 0.05,
        size * 0.8810248079142805 - pointerDown * 0.05 / 4,
      );
      boxFrame(
        vec3(size * 0.8855044665503 - pointerDown * 0.05),
        size * 0.8855044665503 - pointerDown * 0.05 * 0.1,
      );

      blend(nsin(time * size) * 0.11214341939632295);

      grid(1, size * 4, max(0.001, size * 0.003));
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-11',
    templateVersion: 1 as const,
    label: 'Spectrum Relay',
    description: 'Bundled engine scene with color-from-ray direction and sparse mixed primitives.',
    shader: `
      setMaxIterations(96);
      setStepSize(0.8497186712056144);

      let size = input();
      let pointerDown = input();
      time *= 0.663750656570544;

      color(getRayDirection().x, getRayDirection().y, getRayDirection().z);

      let s = getSpace();

      cylinder(
        size * 0.6168195561594768 - pointerDown * 0.05 / 4,
        size * 0.6168195561594768 - pointerDown * 0.05,
      );
      expand(noise(s * 0.7369379972723424) * 0.2843224929727242);
      torus(
        size * 0.8334445133920002 - pointerDown * 0.05,
        size * 0.8334445133920002 - pointerDown * 0.05 / 4,
      );
      grid(
        3,
        size * 0.9954834969507702 - pointerDown * 0.05 / 3,
        0.01 * size * 0.9954834969507702 - pointerDown * 0.05,
      );

      blend(nsin(time * size) * 0.1250996138241836);
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-12',
    templateVersion: 1 as const,
    label: 'Chroma Storm',
    description: 'Bundled engine scene with heavy noise expansion, mixed primitives, and rainbow ray coloring.',
    shader: `
      setMaxIterations(78);
      setStepSize(0.7369359368566446);

      let size = input();
      let pointerDown = input();
      time *= 0.9539348297232683;

      rotateX(getRayDirection().y * 2.4510099887638064 + time * 2.4510099887638064);
      rotateZ(getRayDirection().z * 1.329787985176121 + time * 1.329787985176121);

      color(getRayDirection().x, getRayDirection().y, getRayDirection().z);

      let s = getSpace();

      expand(noise(s * 0.9106972929083885) * 0.3894969217119301);
      sphere(size * 0.6061774521306397 - pointerDown * 0.05 / 2);
      expand(noise(s * 1.9603753411504794) * 0.38739515373281597);
      torus(
        size * 0.5957939662981329 - pointerDown * 0.05,
        size * 0.5957939662981329 - pointerDown * 0.05 / 4,
      );
      cylinder(
        size * 0.7847176552581908 - pointerDown * 0.05 / 4,
        size * 0.7847176552581908 - pointerDown * 0.05,
      );
      expand(noise(s * 0.5620060333649501) * 0.4766355635901381);
      grid(
        5,
        size * 0.6803317673052074 - pointerDown * 0.05 / 3,
        0.01 * size * 0.6803317673052074 - pointerDown * 0.05,
      );
      expand(noise(s * 1.6366720215270216) * 0.40304648326346637);
      boxFrame(
        vec3(size * 0.8080101969375488 - pointerDown * 0.05),
        size * 0.8080101969375488 - pointerDown * 0.05 * 0.1,
      );

      blend(nsin(time * size) * 0.20502448998246994);
    `,
  }),
  Object.freeze({
    templateId: 'embedded-scene-13',
    templateVersion: 1 as const,
    label: 'Rose Circuit',
    description: 'Bundled engine scene with twin metallic rings, a cylinder, and shifting rose-colored highlights.',
    shader: `
      setGeometryQuality(24);
      setStepSize(0.7838);
      setMaxIterations(48);
      let size = input();
      let pointerDown = input();
      let mx = mouse.x;
      let my = mouse.y;
      let rayDir = normalize(getRayDirection());
      let t = time * 0.226 +1.5716;
      let baseSize = max(0.2708, 0.3225 + size * 1.2464 + pointerDown * 0.0867);
      reset();
      rotateY(rayDir.x * 0.8003 + mx * 0.83 + sin(t * 1.0544) * 0.0592);
      rotateX(rayDir.y * 1.3923 + my * 2.2418 + cos(t * 1.5395) * 0.0513);
      rotateZ(rayDir.z * 0.9036 + sin(t * 0.3942 + 2.9702) * 0.1384);
      rotateX(1.1899 + sin(t * 1.8883 + 5.4271) * 0.0054);
      rotateY(1.364 + cos(t * 1.8883 + 5.4271) * 0.0054);
      rotateZ(-0.2239 + nsin(t * 1.8883 + 5.4271) * 0.0054);
      let s0 = getSpace();
      expand(noise(s0 * 2.0455) * 0.0094 + nsin(t * 1.9359 + 2.4569) * 0.0046);
      color(min(1.0, max(0.0, 0.745 + rayDir.x * 0.3719 + sin(t * 0.8768 + 0) * 0.305)), min(1.0, max(0.0, 0.2488 + rayDir.y * 0.3719 + cos(t * 0.5164 + 0) * 0.2285)), min(1.0, max(0.0, 0.6122 + rayDir.z * 0.3719 + nsin(t * 1.553 + 0) * 0.273)));
      metal(max(0.0, min(1.0, 0.6355 + pointerDown * 0.12)));
      shine(max(0.0, min(1.0, 0.4079 + size * 0.05)));
      torus(max(0.1314, baseSize * 0.6537 + pointerDown * 0.1257 + sin(t * 1.8883 + 2.4569) * 0.0108), max(0.0807, max(0.1314, baseSize * 0.6537 + pointerDown * 0.1257 + sin(t * 1.8883 + 2.4569) * 0.0108) * 0.1909));
      blend(max(0.02, min(0.45, 0.1098 + nsin(t * 0.6211 + 0.5089) * 0.0234)));
      reset();
      rotateY(rayDir.x * 0.8003 + mx * 0.83 + sin(t * 1.0544) * 0.0592);
      rotateX(rayDir.y * 1.3923 + my * 2.2418 + cos(t * 1.5395) * 0.0513);
      rotateZ(rayDir.z * 0.9036 + sin(t * 0.3942 + 2.9702) * 0.1384);
      rotateX(0.8582 + sin(t * 1.0024 + 9.101) * 0.0042);
      rotateY(1.4936 + cos(t * 1.0024 + 9.101) * 0.0042);
      rotateZ(1.5492 + nsin(t * 1.0024 + 9.101) * 0.0042);
      let s1 = getSpace();
      expand(noise(s1 * 2.6572) * 0.0002 + nsin(t * 1.6689 + 6.1307) * 0.0059);
      color(min(1.0, max(0.0, 0.745 + rayDir.x * 0.3719 + sin(t * 0.8768 + 0.0589) * 0.305)), min(1.0, max(0.0, 0.2488 + rayDir.y * 0.3719 + cos(t * 0.5164 + 0.0589) * 0.2285)), min(1.0, max(0.0, 0.6122 + rayDir.z * 0.3719 + nsin(t * 1.553 + 0.0589) * 0.273)));
      metal(max(0.0, min(1.0, 0.6355 + pointerDown * 0.12)));
      shine(max(0.0, min(1.0, 0.4079 + size * 0.05)));
      torus(max(0.1324, baseSize * 0.6252 + pointerDown * 0.1172 + sin(t * 1.0024 + 6.1307) * 0.0083), max(0.041, max(0.1324, baseSize * 0.6252 + pointerDown * 0.1172 + sin(t * 1.0024 + 6.1307) * 0.0083) * 0.1639));
      blend(max(0.02, min(0.45, 0.1098 + nsin(t * 0.6211 + 1.0179) * 0.0234)));
      reset();
      rotateY(rayDir.x * 0.8003 + mx * 0.83 + sin(t * 1.0544) * 0.0592);
      rotateX(rayDir.y * 1.3923 + my * 2.2418 + cos(t * 1.5395) * 0.0513);
      rotateZ(rayDir.z * 0.9036 + sin(t * 0.3942 + 2.9702) * 0.1384);
      rotateX(-1.0307 + sin(t * 0.5909 + 5.4207) * 0.0041);
      rotateY(0.8766 + cos(t * 0.5909 + 5.4207) * 0.0041);
      rotateZ(-0.0164 + nsin(t * 0.5909 + 5.4207) * 0.0041);
      let s2 = getSpace();
      expand(noise(s2 * 1.0838) * 0.01 + nsin(t * 2.1073 + 2.4505) * 0.0003);
      color(min(1.0, max(0.0, 0.745 + rayDir.x * 0.3719 + sin(t * 0.8768 + 0.1178) * 0.305)), min(1.0, max(0.0, 0.2488 + rayDir.y * 0.3719 + cos(t * 0.5164 + 0.1178) * 0.2285)), min(1.0, max(0.0, 0.6122 + rayDir.z * 0.3719 + nsin(t * 1.553 + 0.1178) * 0.273)));
      metal(max(0.0, min(1.0, 0.6355 + pointerDown * 0.12)));
      shine(max(0.0, min(1.0, 0.4079 + size * 0.05)));
      cylinder(max(0.1318, max(0.0904, baseSize * 0.1671 + pointerDown * 0.1318 + sin(t * 0.5909 + 2.4505) * 0.0081) * 0.2033), max(0.0904, max(0.0904, baseSize * 0.1671 + pointerDown * 0.1318 + sin(t * 0.5909 + 2.4505) * 0.0081) * 1.7875));
    `,
  }),
  Object.freeze({
    templateId: 'reaction-rings-v1',
    templateVersion: 1 as const,
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
  }),
  Object.freeze({
    templateId: 'reaction-lantern-v1',
    templateVersion: 1 as const,
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
  }),
])
