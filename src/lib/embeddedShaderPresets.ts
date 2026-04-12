import type { ShaderPresetOption } from './presetEditor'

export const EMBEDDED_SHADER_PRESETS: ShaderPresetOption[] = [
  {
    id: 'embedded-preset-0',
    label: 'Prism Core',
    description: 'Bundled engine preset with layered box frames and a reflective core sphere.',
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
  },
  {
    id: 'embedded-preset-1',
    label: 'Steel Lattice',
    description: 'Bundled engine preset built from stacked grids and box frames.',
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
  },
  {
    id: 'embedded-preset-2',
    label: 'Aqua Static',
    description: 'Bundled engine preset with noisy box frames and layered grid distortion.',
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
  },
  {
    id: 'embedded-preset-3',
    label: 'Verdant Frames',
    description: 'Bundled engine preset with twin box frames and green edge-lit motion.',
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
  },
  {
    id: 'embedded-preset-4',
    label: 'Crimson Reactor',
    description: 'Bundled engine preset with framed cylinders, a noisy core sphere, and a grid floor.',
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
  },
  {
    id: 'embedded-preset-5',
    label: 'Alloy Capsule',
    description: 'Bundled engine preset combining a metallic cylinder shell with a central sphere.',
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
  },
  {
    id: 'embedded-preset-6',
    label: 'Redline Core',
    description: 'Bundled engine preset with a dominant sphere, cylinder, and dense grid accent.',
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
  },
  {
    id: 'embedded-preset-7',
    label: 'Violet Matrix',
    description: 'Bundled engine preset with layered grids and a saturated violet sphere.',
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
  },
  {
    id: 'embedded-preset-8',
    label: 'Mint Halo',
    description: 'Bundled engine preset with a torus frame, noisy grids, and a bright center sphere.',
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
  },
  {
    id: 'embedded-preset-9',
    label: 'Ember Grid',
    description: 'Bundled engine preset with orange framing and a tight supporting grid.',
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
  },
  {
    id: 'embedded-preset-10',
    label: 'Emerald Ring',
    description: 'Bundled engine preset with a torus and box frame at maximum scale.',
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
  },
  {
    id: 'embedded-preset-11',
    label: 'Spectrum Relay',
    description: 'Bundled engine preset with color-from-ray direction and sparse mixed primitives.',
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
  },
  {
    id: 'embedded-preset-12',
    label: 'Chroma Storm',
    description: 'Bundled engine preset with heavy noise expansion, mixed primitives, and rainbow ray coloring.',
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
  },
]
