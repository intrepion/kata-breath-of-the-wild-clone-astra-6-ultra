import * as THREE from 'three';

export interface HeroAnimation {
  moving: boolean;
  sprinting: boolean;
  gliding: boolean;
  climbing: boolean;
  attacking: boolean;
}

export interface EnemyAnimation {
  moving: boolean;
  attacking: boolean;
  hurt: boolean;
}

/** An entirely geometric adventurer. Local +Z is forward and local Y=0 is the ground. */
export function createHero() {
  const group = new THREE.Group();
  group.name = 'The wanderer';
  const cloth = new THREE.MeshStandardMaterial({
    color: '#207b79',
    roughness: 0.96,
    flatShading: true,
  });
  const clothLight = new THREE.MeshStandardMaterial({
    color: '#389c92',
    roughness: 0.95,
    flatShading: true,
  });
  const clothDark = new THREE.MeshStandardMaterial({
    color: '#18534f',
    roughness: 1,
    flatShading: true,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: '#dca779',
    roughness: 0.92,
    flatShading: true,
  });
  const hair = new THREE.MeshStandardMaterial({
    color: '#c8883d',
    roughness: 0.9,
    flatShading: true,
  });
  const hairLight = new THREE.MeshStandardMaterial({
    color: '#e3b35b',
    roughness: 0.9,
    flatShading: true,
  });
  const cream = new THREE.MeshStandardMaterial({
    color: '#f1dfb0',
    roughness: 1,
    flatShading: true,
  });
  const trousers = new THREE.MeshStandardMaterial({
    color: '#424c42',
    roughness: 1,
    flatShading: true,
  });
  const leather = new THREE.MeshStandardMaterial({
    color: '#70492f',
    roughness: 1,
    flatShading: true,
  });
  const leatherDark = new THREE.MeshStandardMaterial({
    color: '#3e3026',
    roughness: 1,
    flatShading: true,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: '#c79e57',
    metalness: 0.32,
    roughness: 0.65,
    flatShading: true,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: '#c5d5cd',
    metalness: 0.65,
    roughness: 0.3,
    flatShading: true,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#233e34', roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);

  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function bone(parent: THREE.Object3D, x: number, y: number, z: number) {
    const object = new THREE.Group();
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }

  const body = bone(group, 0, 0, 0);
  // The angled skirt and layered collar give the tunic a silhouette from the chase camera.
  mesh(body, new THREE.CylinderGeometry(0.28, 0.34, 0.6, 7), cloth, 0, 1.29, 0, 1, 1, 0.7);
  mesh(body, new THREE.CylinderGeometry(0.29, 0.38, 0.27, 7), clothLight, 0, 0.97, 0, 1, 1, 0.7);
  mesh(body, box, clothDark, 0, 0.858, 0.02, 0.68, 0.045, 0.43);
  mesh(body, cylinder, leatherDark, 0, 1.092, 0, 0.313, 0.105, 0.229);
  mesh(body, box, gold, 0.025, 1.092, 0.243, 0.13, 0.095, 0.035);
  mesh(body, box, leatherDark, 0.025, 1.092, 0.265, 0.063, 0.049, 0.009);
  const chestStrap = mesh(body, box, leather, -0.025, 1.37, 0.21, 0.073, 0.54, 0.024);
  chestStrap.rotation.z = -0.51;
  mesh(body, box, gold, 0.085, 1.56, 0.205, 0.065, 0.063, 0.035).rotation.z = -0.51;
  mesh(body, sphere, leather, -0.34, 1.03, -0.015, 0.16, 0.2, 0.15);
  mesh(body, box, leatherDark, -0.34, 1.115, 0.099, 0.235, 0.075, 0.055);
  mesh(body, sphere, gold, -0.34, 1.085, 0.135, 0.024, 0.024, 0.013);

  const head = bone(body, 0, 1.8, 0.015);
  mesh(body, cylinder, skin, 0, 1.675, 0, 0.105, 0.18, 0.1);
  mesh(head, sphere, skin, 0, 0.125, 0, 0.225, 0.265, 0.215);
  mesh(head, sphere, skin, -0.227, 0.11, 0, 0.055, 0.085, 0.045);
  mesh(head, sphere, skin, 0.227, 0.11, 0, 0.055, 0.085, 0.045);
  mesh(head, sphere, skin, 0, 0.092, 0.211, 0.037, 0.042, 0.056);
  mesh(head, box, eyeMaterial, -0.083, 0.151, 0.191, 0.026, 0.034, 0.024);
  mesh(head, box, eyeMaterial, 0.083, 0.151, 0.191, 0.026, 0.034, 0.024);
  mesh(head, sphere, hair, 0, 0.248, -0.03, 0.247, 0.187, 0.239);
  // Asymmetric locks keep the head readable rather than resembling a helmet.
  const lockGeo = new THREE.ConeGeometry(0.075, 0.25, 4);
  for (let i = 0; i < 5; i++) {
    const lock = mesh(
      head,
      lockGeo,
      i % 2 ? hair : hairLight,
      -0.19 + i * 0.079,
      0.255 + (i === 2 ? 0.025 : 0),
      0.17,
      1,
      1,
      0.55,
    );
    lock.rotation.z = Math.PI + 0.25;
    lock.rotation.x = -0.2;
  }
  mesh(head, sphere, hair, -0.204, 0.09, -0.053, 0.064, 0.18, 0.1);
  mesh(head, sphere, hairLight, 0.204, 0.14, -0.075, 0.052, 0.14, 0.09);
  const ponytail = bone(head, 0.015, 0.13, -0.19);
  mesh(ponytail, sphere, hair, 0, -0.085, -0.028, 0.105, 0.21, 0.095);
  mesh(ponytail, cylinder, leatherDark, 0, -0.015, -0.015, 0.096, 0.045, 0.073);

  const collar = mesh(
    body,
    new THREE.TorusGeometry(0.135, 0.065, 5, 10),
    cream,
    0,
    1.67,
    0.01,
    1,
    1,
    0.88,
  );
  collar.rotation.x = Math.PI / 2;
  mesh(body, sphere, cream, -0.106, 1.62, 0.171, 0.075, 0.09, 0.065);
  const scarf = bone(body, 0.09, 1.67, -0.17);
  const scarfOne = mesh(scarf, box, cream, 0, 0, -0.18, 0.17, 0.033, 0.43);
  scarfOne.rotation.x = 0.12;
  const scarfEnd = bone(scarf, 0, 0.027, -0.375);
  mesh(scarfEnd, box, cream, 0, 0, -0.18, 0.17, 0.029, 0.4).rotation.x = -0.1;
  mesh(scarfEnd, box, clothLight, 0, -0.012, -0.325, 0.173, 0.013, 0.046);

  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const arms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = bone(body, side * 0.15, 0.91, 0);
    mesh(leg, cylinder, trousers, 0, -0.177, 0, 0.11, 0.375, 0.11);
    const knee = bone(leg, 0, -0.36, 0);
    mesh(knee, cylinder, trousers, 0, -0.12, 0, 0.088, 0.27, 0.09);
    mesh(knee, cylinder, leather, 0, -0.285, 0, 0.107, 0.33, 0.106);
    mesh(knee, cylinder, leatherDark, 0, -0.18, 0, 0.119, 0.075, 0.118);
    mesh(knee, box, leatherDark, 0, -0.47, 0.062, 0.22, 0.15, 0.34);
    mesh(knee, box, leather, 0, -0.42, 0.076, 0.204, 0.15, 0.296);
    mesh(knee, box, gold, side * 0.103, -0.24, 0.01, 0.018, 0.065, 0.07);
    legs.push(leg);
    knees.push(knee);

    const arm = bone(body, side * 0.322, 1.515, 0);
    mesh(arm, sphere, clothLight, side * 0.025, -0.048, 0, 0.147, 0.172, 0.148);
    mesh(arm, cylinder, cloth, 0, -0.176, 0, 0.106, 0.25, 0.105);
    const elbow = bone(arm, 0, -0.305, 0);
    mesh(elbow, cylinder, skin, 0, -0.129, 0, 0.077, 0.255, 0.075);
    mesh(elbow, cylinder, leather, 0, -0.205, 0, 0.088, 0.12, 0.086);
    mesh(elbow, cylinder, gold, 0, -0.146, 0, 0.091, 0.022, 0.089);
    mesh(elbow, sphere, skin, 0, -0.291, 0, 0.082, 0.095, 0.079);
    arms.push(arm);
    elbows.push(elbow);
  }

  // A round wooden trail shield, framed in aged metal, with an original mountain emblem.
  const shield = bone(body, 0.015, 1.345, -0.264);
  shield.rotation.z = 0.16;
  mesh(
    shield,
    new THREE.CylinderGeometry(0.334, 0.334, 0.09, 10),
    gold,
    0,
    0,
    0,
    1,
    1,
    1,
  ).rotation.x = Math.PI / 2;
  mesh(
    shield,
    new THREE.CylinderGeometry(0.297, 0.297, 0.105, 10),
    leather,
    0,
    0,
    -0.005,
    1,
    1,
    1,
  ).rotation.x = Math.PI / 2;
  for (const x of [-0.13, 0.13]) {
    const rail = mesh(shield, box, leatherDark, x, 0, -0.062, 0.023, 0.52, 0.011);
    rail.rotation.z = -0.06;
  }
  const emblem = new THREE.Shape();
  emblem.moveTo(-0.12, -0.07);
  emblem.lineTo(0, 0.15);
  emblem.lineTo(0.12, -0.07);
  emblem.lineTo(0.035, -0.033);
  emblem.lineTo(0, 0.04);
  emblem.lineTo(-0.038, -0.033);
  emblem.closePath();
  const emblemMesh = mesh(shield, new THREE.ShapeGeometry(emblem), cream, 0, 0, -0.066, 1, 1, 1);
  emblemMesh.rotation.y = Math.PI;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    mesh(
      shield,
      sphere,
      gold,
      Math.sin(a) * 0.309,
      Math.cos(a) * 0.309,
      -0.06,
      0.016,
      0.016,
      0.012,
    );
  }

  const sword = bone(elbows[1], 0, -0.284, 0);
  mesh(sword, cylinder, leatherDark, 0, -0.008, 0, 0.03, 0.22, 0.03);
  mesh(sword, sphere, gold, 0, 0.11, 0, 0.047, 0.048, 0.047);
  mesh(sword, box, gold, 0, -0.127, 0, 0.28, 0.046, 0.07);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.043, 0);
  bladeShape.lineTo(0.043, 0);
  bladeShape.lineTo(0.042, -0.55);
  bladeShape.lineTo(0, -0.69);
  bladeShape.lineTo(-0.042, -0.55);
  bladeShape.closePath();
  mesh(
    sword,
    new THREE.ExtrudeGeometry(bladeShape, { depth: 0.033, bevelEnabled: false }),
    steel,
    0,
    -0.15,
    -0.0165,
    1,
    1,
    1,
  );
  mesh(sword, box, cream, 0, -0.395, 0.019, 0.008, 0.45, 0.006);
  sword.rotation.x = -0.18;

  const glider = bone(body, 0, 2.77, 0);
  glider.name = 'Sunweave glider';
  glider.visible = false;
  const canvas = new THREE.MeshStandardMaterial({
    color: '#e9ca81',
    side: THREE.DoubleSide,
    roughness: 1,
    flatShading: true,
  });
  const canvasAccent = new THREE.MeshStandardMaterial({
    color: '#ab6740',
    side: THREE.DoubleSide,
    roughness: 1,
    flatShading: true,
  });
  const sailGeometry = new THREE.BufferGeometry();
  sailGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0.3, 0.86, -2.48, -0.02, -0.63, -1.15, 0.13, -0.77, 0, 0.3, 0.86, -1.15, 0.13, -0.77, 0,
        0.14, -0.47, 0, 0.3, 0.86, 0, 0.14, -0.47, 1.15, 0.13, -0.77, 0, 0.3, 0.86, 1.15, 0.13,
        -0.77, 2.48, -0.02, -0.63,
      ],
      3,
    ),
  );
  sailGeometry.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeometry, [canvas, canvasAccent]);
  sailGeometry.addGroup(0, 3, 1);
  sailGeometry.addGroup(3, 6, 0);
  sailGeometry.addGroup(9, 3, 1);
  sail.castShadow = true;
  glider.add(sail);
  const lineGeo = new THREE.CylinderGeometry(0.021, 0.021, 1, 5);
  const lineFrom = new THREE.Vector3();
  const lineTo = new THREE.Vector3();
  const lineDirection = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  function spar(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    material: THREE.Material,
    width = 1,
  ) {
    lineFrom.set(ax, ay, az);
    lineTo.set(bx, by, bz);
    lineDirection.subVectors(lineTo, lineFrom);
    const rod = mesh(
      glider,
      lineGeo,
      material,
      (ax + bx) / 2,
      (ay + by) / 2,
      (az + bz) / 2,
      width,
      lineDirection.length(),
      width,
    );
    rod.quaternion.setFromUnitVectors(up, lineDirection.normalize());
  }
  spar(-2.48, -0.028, -0.63, 0, 0.292, 0.86, leather, 1.65);
  spar(2.48, -0.028, -0.63, 0, 0.292, 0.86, leather, 1.65);
  spar(-2.48, -0.028, -0.63, 2.48, -0.028, -0.63, leather);
  spar(0, 0.292, 0.86, 0, 0.125, -0.47, leather);
  spar(-1.15, 0.13, -0.77, 0, 0.292, 0.86, gold, 0.55);
  spar(1.15, 0.13, -0.77, 0, 0.292, 0.86, gold, 0.55);
  spar(-0.75, -0.07, -0.12, -0.53, -0.55, 0.15, leather, 0.7);
  spar(0.75, -0.07, -0.12, 0.53, -0.55, 0.15, leather, 0.7);
  spar(-0.57, -0.55, 0.15, 0.57, -0.55, 0.15, leather, 1.2);

  let stride = 0;
  let movement = 0;
  let attackClock = 0;
  let attackingPreviously = false;
  const smooth = (from: number, to: number, dt: number) =>
    THREE.MathUtils.lerp(from, to, 1 - Math.exp(-dt * 14));

  return {
    group,
    update(time: number, dt: number, options: HeroAnimation) {
      const { moving, sprinting, gliding, climbing, attacking } = options;
      movement = smooth(movement, moving ? 1 : 0, dt);
      stride += dt * (sprinting ? 15 : 10) * (moving ? 1 : 0.3);
      if (attacking && !attackingPreviously) attackClock = 0;
      attackClock += dt;
      attackingPreviously = attacking;
      const walk = Math.sin(stride) * movement;
      const amplitude = sprinting ? 0.79 : 0.53;
      body.position.y = gliding
        ? Math.sin(time * 2.8) * 0.025
        : Math.abs(Math.cos(stride)) * movement * 0.045;
      body.rotation.x = smooth(
        body.rotation.x,
        gliding ? 0.08 : climbing ? -0.1 : sprinting && moving ? 0.105 : 0,
        dt,
      );
      body.rotation.z = smooth(
        body.rotation.z,
        gliding ? Math.sin(time * 1.8) * 0.025 : walk * 0.035,
        dt,
      );
      head.rotation.y = smooth(
        head.rotation.y,
        moving || attacking ? 0 : Math.sin(time * 0.43) * 0.14,
        dt,
      );
      ponytail.rotation.x = Math.sin(time * 6) * 0.06 + movement * 0.16;
      scarf.rotation.y = Math.sin(time * 4.1) * 0.18;
      scarf.rotation.x =
        -0.23 + Math.sin(time * 5.4) * 0.09 - movement * 0.22 - (gliding ? 0.3 : 0);
      scarfEnd.rotation.x = Math.sin(time * 5.4 - 1) * 0.25;
      scarfEnd.rotation.z = Math.sin(time * 4.1 - 1) * 0.12;
      glider.visible = gliding;
      glider.rotation.z = Math.sin(time * 2.6) * 0.025;
      for (let i = 0; i < 2; i++) {
        const sign = i === 0 ? -1 : 1;
        const legSwing = walk * sign;
        legs[i].rotation.x = smooth(
          legs[i].rotation.x,
          gliding
            ? -0.21
            : climbing
              ? Math.sin(stride + i * Math.PI) * 0.65 - 0.5
              : legSwing * amplitude,
          dt,
        );
        knees[i].rotation.x = smooth(
          knees[i].rotation.x,
          gliding ? 0.46 : climbing ? 0.7 : Math.max(0, -legSwing) * (sprinting ? 1.06 : 0.66),
          dt,
        );
        legs[i].rotation.z = smooth(legs[i].rotation.z, gliding ? sign * 0.09 : 0, dt);
        arms[i].rotation.x = smooth(
          arms[i].rotation.x,
          gliding
            ? -0.25
            : climbing
              ? -2.5 + Math.sin(stride + i * Math.PI) * 0.45
              : -legSwing * amplitude * 0.9 - 0.07,
          dt,
        );
        arms[i].rotation.z = smooth(arms[i].rotation.z, gliding ? sign * 2.65 : sign * 0.08, dt);
        elbows[i].rotation.x = smooth(
          elbows[i].rotation.x,
          gliding ? -0.33 : climbing ? -0.45 : sprinting && moving ? -0.62 : -0.18,
          dt,
        );
      }
      sword.visible = !gliding && !climbing;
      if (attacking && !gliding && !climbing) {
        const swing = Math.sin(Math.min(attackClock * 9, Math.PI));
        arms[1].rotation.x = -1.2 - swing * 1.4;
        arms[1].rotation.z = -0.25 - swing * 0.9;
        elbows[1].rotation.x = -0.4;
        body.rotation.y = -0.35 + swing * 0.85;
      } else {
        body.rotation.y = smooth(body.rotation.y, 0, dt);
      }
    },
  };
}

/** A little stone watchkeeper animated independently of navigation and combat logic. */
export function createEnemy() {
  const group = new THREE.Group();
  group.name = 'Hollow sentinel';
  const rock = new THREE.MeshStandardMaterial({
    color: '#48534d',
    roughness: 1,
    flatShading: true,
  });
  const lightRock = new THREE.MeshStandardMaterial({
    color: '#687067',
    roughness: 1,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: '#24322d',
    roughness: 1,
    flatShading: true,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: '#ffc267',
    emissive: '#ef8124',
    emissiveIntensity: 1.8,
    roughness: 0.4,
    flatShading: true,
  });
  const moss = new THREE.MeshStandardMaterial({
    color: '#71804e',
    roughness: 1,
    flatShading: true,
  });
  const body = new THREE.Group();
  body.position.y = 0.83;
  group.add(body);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const stone = new THREE.IcosahedronGeometry(1, 0);
  function part(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  part(body, stone, rock, 0, 0, 0, 0.48, 0.46, 0.34);
  part(body, cube, dark, 0, 0.08, 0.25, 0.55, 0.24, 0.14);
  const eye = part(
    body,
    new THREE.TorusGeometry(0.105, 0.038, 5, 8),
    amber,
    0,
    0.09,
    0.335,
    1,
    1,
    1,
  );
  part(body, new THREE.SphereGeometry(0.07, 8, 6), amber, 0, 0.09, 0.35, 1, 1, 0.5);
  part(body, cube, lightRock, 0, 0.3, 0.26, 0.67, 0.13, 0.15).rotation.z = -0.045;
  part(body, cube, rock, 0, -0.11, 0.245, 0.57, 0.105, 0.16);
  part(body, stone, moss, -0.19, 0.4, -0.04, 0.2, 0.073, 0.2);
  part(body, stone, moss, 0.13, 0.38, -0.12, 0.14, 0.05, 0.15);
  part(body, cube, amber, 0.09, -0.2, 0.278, 0.024, 0.13, 0.02).rotation.z = 0.4;
  part(body, cube, amber, -0.14, 0.34, -0.055, 0.027, 0.22, 0.18).rotation.z = -0.16;
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.49, 0.055, 0);
    body.add(arm);
    part(arm, stone, lightRock, 0, -0.07, 0, 0.23, 0.26, 0.25);
    part(arm, stone, dark, side * 0.035, -0.33, 0.015, 0.12, 0.12, 0.12);
    part(arm, stone, rock, side * 0.055, -0.48, 0.05, 0.23, 0.23, 0.23);
    part(arm, cube, amber, side * -0.04, -0.48, 0.232, 0.06, 0.045, 0.012);
    arms.push(arm);
    part(group, stone, dark, side * 0.2, 0.28, 0, 0.135, 0.2, 0.14);
    part(group, stone, lightRock, side * 0.2, 0.12, 0.045, 0.225, 0.16, 0.26);
  }
  const debris: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const chip = part(body, stone, i === 1 ? moss : lightRock, 0, 0, 0, 0.06, 0.09, 0.065);
    debris.push(chip);
  }
  return {
    group,
    update(time: number, dt: number, options: EnemyAnimation) {
      const pace = options.moving ? 8 : 2.5;
      body.position.y = 0.83 + Math.sin(time * pace) * (options.moving ? 0.075 : 0.035);
      body.rotation.z = Math.sin(time * pace * 0.5) * (options.moving ? 0.07 : 0.025);
      body.rotation.x = options.attacking ? -0.25 : 0;
      arms[0].rotation.x = options.attacking
        ? -1.5
        : Math.sin(time * pace) * (options.moving ? 0.4 : 0.05);
      arms[1].rotation.x = options.attacking ? -1.5 : -arms[0].rotation.x;
      amber.emissiveIntensity = options.hurt
        ? 5
        : options.attacking
          ? 3
          : 1.35 + Math.sin(time * 3) * 0.4;
      rock.emissive.set(options.hurt ? '#c06932' : '#000000');
      lightRock.emissive.set(options.hurt ? '#a96436' : '#000000');
      eye.rotation.z += dt * 0.2;
      for (let i = 0; i < debris.length; i++) {
        const a = time * 0.7 + i * ((Math.PI * 2) / 3);
        debris[i].position.set(
          Math.cos(a) * 0.5,
          -0.25 + Math.sin(time * 2 + i) * 0.09,
          Math.sin(a) * 0.4,
        );
        debris[i].rotation.x = time + i;
        debris[i].rotation.z = time * 0.4 + i;
      }
    },
  };
}
