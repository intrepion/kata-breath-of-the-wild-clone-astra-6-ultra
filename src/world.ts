import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BEACONS, RELICS, SPAWN } from './layout';

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, v: number) => {
  const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hill = (x: number, z: number, cx: number, cz: number, width: number, height: number) =>
  height * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (width * width));

function naturalHeight(x: number, z: number): number {
  const rolling =
    Math.sin(x * 0.025 + z * 0.012) * 4.3 +
    Math.sin(z * 0.044 - x * 0.015) * 3 +
    Math.sin(x * 0.074 + z * 0.035) * 1.35;
  let y =
    6 +
    rolling +
    hill(x, z, 7, 80, 42, 18) +
    hill(x, z, 110, -116, 69, 28) +
    hill(x, z, -93, -109, 61, 16) +
    hill(x, z, 4, -170, 41, 25) +
    hill(x, z, 176, 22, 51, 32) +
    hill(x, z, -178, 116, 57, 27);
  // A broad, shallow lake bed leaves all quest routes on traversable ground.
  const lakeDistance = Math.sqrt(((x + 132) / 39) ** 2 + ((z + 9) / 58) ** 2);
  const bank = smooth(0.76, 1.25, lakeDistance);
  y = THREE.MathUtils.lerp(0.7 + Math.sin(z * 0.08) * 0.25, y, bank);
  return y;
}

/** This same surface is used for scenery and player movement. */
export function heightAt(x: number, z: number): number {
  let y = naturalHeight(x, z);
  for (const shrine of BEACONS) {
    const distance = Math.hypot(x - shrine.x, z - shrine.z);
    if (distance < 12)
      y = THREE.MathUtils.lerp(naturalHeight(shrine.x, shrine.z), y, smooth(5.2, 12, distance));
  }
  return y;
}

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function terrainColor(x: number, z: number, elevation: number, random: () => number): THREE.Color {
  const lakeDistance = Math.sqrt(((x + 132) / 39) ** 2 + ((z + 9) / 58) ** 2);
  if (lakeDistance < 1.11 && elevation < 4.4)
    return new THREE.Color('#c6bd86').multiplyScalar(0.94 + random() * 0.12);
  const color = new THREE.Color('#7d9e4e');
  const patch = Math.sin(x * 0.027 + Math.sin(z * 0.042)) * Math.cos(z * 0.021);
  color.lerp(new THREE.Color('#a3b76a'), smooth(-0.6, 0.9, patch) * 0.7);
  color.lerp(new THREE.Color('#608553'), smooth(18, 44, elevation) * 0.46);
  return color.multiplyScalar(0.955 + random() * 0.09);
}

export interface WorldScene {
  update(time: number, dt: number): void;
  setBeaconActive(id: string, active: boolean): void;
  setRelicCollected(id: string, collected: boolean): void;
  dispose(): void;
}

export function createWorld(scene: THREE.Scene): WorldScene {
  const world = new THREE.Group();
  world.name = 'Wildreach landscape';
  scene.add(world);
  const random = seededRandom(18593);
  const stone = new THREE.MeshStandardMaterial({
    color: '#b7b7a4',
    roughness: 0.92,
    flatShading: true,
  });
  const darkStone = new THREE.MeshStandardMaterial({
    color: '#6a8079',
    roughness: 0.95,
    flatShading: true,
  });
  const paleStone = new THREE.MeshStandardMaterial({
    color: '#d3cfaf',
    roughness: 0.95,
    flatShading: true,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: '#bda46a',
    metalness: 0.22,
    roughness: 0.6,
  });
  const wood = new THREE.MeshStandardMaterial({ color: '#695f42', roughness: 1 });
  const sharedBox = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();

  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = world,
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const object = mesh(sharedBox, material, parent);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    return object;
  }

  // Vertex colors give the meadow its quiet, painterly patchwork.
  const ground = new THREE.PlaneGeometry(560, 560, 186, 186);
  ground.rotateX(-Math.PI / 2);
  const vertices = ground.attributes.position;
  const groundColors = new Float32Array(vertices.count * 3);
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i);
    const y = heightAt(x, z);
    vertices.setY(i, y);
    const color = terrainColor(x, z, y, random);
    groundColors.set([color.r, color.g, color.b], i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
  ground.computeVertexNormals();
  mesh(
    ground,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  ).castShadow = false;

  // A branching trail remains visible from the starting overlook.
  const routes = [
    [
      [0, 82],
      [1, 68],
      [-1, 51],
      [-12, 32],
      [-24, 8],
      [-28, -11],
      [-43, -29],
      [-62, -44],
      [-83, -62],
      [-87, -84],
    ],
    [
      [-24, 8],
      [-4, -7],
      [5, -33],
      [28, -46],
      [49, -66],
      [63, -86],
      [78, -98],
      [92, -125],
    ],
    [
      [5, -33],
      [0, -62],
      [-4, -89],
      [6, -116],
      [2, -150],
    ],
  ];
  const pathSamples: THREE.Vector3[] = [];
  const pathMaterial = new THREE.MeshStandardMaterial({
    color: '#c0b282',
    roughness: 1,
    side: THREE.DoubleSide,
  });
  for (const route of routes) {
    const curve = new THREE.CatmullRomCurve3(route.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const points = curve.getPoints(240);
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (i % 3 === 0) pathSamples.push(point);
      const next = points[Math.min(i + 1, points.length - 1)];
      const previous = points[Math.max(0, i - 1)];
      const tangent = next.clone().sub(previous).normalize();
      const width = 1.4 + Math.sin(i * 0.115) * 0.22;
      for (const sign of [-1, 1]) {
        const x = point.x + tangent.z * width * sign;
        const z = point.z - tangent.x * width * sign;
        positions.push(x, heightAt(x, z) + 0.09, z);
      }
      if (i < points.length - 1) {
        const j = i * 2;
        indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(geometry, pathMaterial).castShadow = false;
  }
  function nearTrail(x: number, z: number, distance: number) {
    return pathSamples.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < distance * distance);
  }
  function nearLandmark(x: number, z: number, distance: number) {
    return (
      BEACONS.some((p) => Math.hypot(x - p.x, z - p.z) < distance) ||
      RELICS.some((p) => Math.hypot(x - p.x, z - p.z) < 2.2) ||
      Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6
    );
  }

  // Turquoise water, sandy shallows, and slowly drifting highlights.
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: '#62b6b7',
    roughness: 0.3,
    metalness: 0.15,
    transparent: true,
    opacity: 0.9,
  });
  const water = mesh(new THREE.CircleGeometry(1, 100), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.scale.set(39.5, 58.5, 1);
  water.position.set(-132, 2.3, -9);
  water.castShadow = false;
  water.receiveShadow = false;
  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: '#dbf2d8',
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
  });
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 35; i++) {
    const ripple = mesh(new THREE.PlaneGeometry(1, 0.1), rippleMaterial);
    const a = random() * TAU,
      r = Math.sqrt(random()) * 0.82;
    ripple.position.set(-132 + Math.cos(a) * r * 39, 2.34, -9 + Math.sin(a) * r * 58);
    ripple.rotation.x = -Math.PI / 2;
    ripple.scale.set(1.5 + random() * 5, 1, 1);
    ripple.castShadow = false;
    ripples.push(ripple);
  }

  // Foliage is instanced: several hundred trees cost only five draw calls.
  const treePositions: { x: number; z: number; size: number; variant: number; angle: number }[] =
    [];
  for (let attempts = 0; attempts < 5000 && treePositions.length < 610; attempts++) {
    const x = (random() - 0.5) * 405;
    const z = (random() - 0.5) * 400;
    const distanceFromLake = Math.sqrt(((x + 132) / 42) ** 2 + ((z + 9) / 62) ** 2);
    const cluster =
      Math.sin(x * 0.075) * Math.sin(z * 0.087) + Math.cos(x * 0.021 - z * 0.048) * 0.7;
    if (distanceFromLake < 1.1 || cluster < -0.2 || nearTrail(x, z, 5.5) || nearLandmark(x, z, 10))
      continue;
    // Keep the opening vista unobstructed, with framing trees at either edge.
    if (z > 36 && z < 98 && Math.abs(x) < 19) continue;
    if (z > 0 && z < 80 && Math.abs(x) < 8) continue;
    if (Math.hypot(x, z + 158) < 27) continue;
    treePositions.push({
      x,
      z,
      size: 0.7 + random() * 0.95,
      variant: random(),
      angle: random() * TAU,
    });
  }
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.17, 0.31, 1, 6),
    wood,
    treePositions.length,
  );
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    flatShading: true,
  });
  const crownMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    leafMaterial,
    treePositions.length * 3,
  );
  const pineMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    flatShading: true,
  });
  const pineMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 7),
    pineMaterial,
    treePositions.length * 3,
  );
  let crowns = 0,
    pines = 0;
  const foliagePalette = ['#729647', '#8da45a', '#a1b366', '#5c915a', '#4f8054', '#b3b965'];
  treePositions.forEach((tree, index) => {
    const groundY = heightAt(tree.x, tree.z);
    const size = tree.size;
    const isPine = tree.variant < 0.29;
    dummy.position.set(tree.x, groundY + size * 2.1, tree.z);
    dummy.scale.set(size, size * 4.2, size);
    dummy.rotation.set(0, tree.angle, 0);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(index, dummy.matrix);
    const leafColor = new THREE.Color(foliagePalette[Math.floor(random() * foliagePalette.length)]);
    for (let j = 0; j < 3; j++) {
      if (isPine) {
        dummy.position.set(tree.x, groundY + size * (3.2 + j * 1.2), tree.z);
        dummy.scale.set(size * (2.2 - j * 0.45), size * (3.8 - j * 0.5), size * (2.2 - j * 0.45));
        dummy.rotation.set(0, tree.angle + j * 0.4, 0);
        dummy.updateMatrix();
        pineMesh.setMatrixAt(pines, dummy.matrix);
        pineMesh.setColorAt(pines++, new THREE.Color('#40755c').multiplyScalar(0.95 + j * 0.1));
      } else {
        const a = tree.angle + j * 2.2;
        dummy.position.set(
          tree.x + Math.cos(a) * size * 0.72,
          groundY + size * (4.3 + (j === 0 ? 1.1 : 0)),
          tree.z + Math.sin(a) * size * 0.72,
        );
        dummy.scale.set(
          size * (1.85 + random() * 0.35),
          size * (1.6 + random() * 0.7),
          size * (1.8 + random() * 0.35),
        );
        dummy.rotation.set(random(), a, random() * 0.3);
        dummy.updateMatrix();
        crownMesh.setMatrixAt(crowns, dummy.matrix);
        crownMesh.setColorAt(crowns++, leafColor.clone().multiplyScalar(0.95 + j * 0.07));
      }
    }
  });
  crownMesh.count = crowns;
  pineMesh.count = pines;
  for (const forest of [trunkMesh, crownMesh, pineMesh]) {
    forest.castShadow = true;
    forest.receiveShadow = true;
    world.add(forest);
  }

  // Hand-shaped tufts have more presence than a flat grass texture.
  const bladePositions: number[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.399;
    const bx = Math.cos(angle) * 0.23,
      bz = Math.sin(angle) * 0.23;
    const w = 0.055;
    const h = 0.36 + (i % 3) * 0.13;
    bladePositions.push(
      bx - w,
      0,
      bz,
      bx + w,
      0,
      bz,
      bx + Math.cos(angle) * 0.13,
      h,
      bz + Math.sin(angle) * 0.13,
    );
  }
  const tuftGeometry = new THREE.BufferGeometry();
  tuftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bladePositions, 3));
  tuftGeometry.computeVertexNormals();
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    side: THREE.DoubleSide,
    roughness: 1,
  });
  const grass = new THREE.InstancedMesh(tuftGeometry, grassMaterial, 7000);
  let grassCount = 0;
  for (let i = 0; i < 15500 && grassCount < 7000; i++) {
    const foreground = grassCount < 1600;
    const x = (random() - 0.5) * (foreground ? 90 : 290);
    const z = foreground ? 30 + random() * 65 : (random() - 0.5) * 280;
    const y = heightAt(x, z);
    if (y < 3 || nearTrail(x, z, 1.8) || nearLandmark(x, z, 5.5)) continue;
    dummy.position.set(x, y, z);
    const size = 0.65 + random() * (foreground ? 1.85 : 1.5);
    dummy.scale.set(size, size * (0.65 + random() * 0.5), size);
    dummy.rotation.set(0, random() * TAU, 0);
    dummy.updateMatrix();
    grass.setMatrixAt(grassCount, dummy.matrix);
    grass.setColorAt(
      grassCount++,
      new THREE.Color().setHSL(0.19 + random() * 0.04, 0.38, 0.4 + random() * 0.18),
    );
  }
  grass.count = grassCount;
  world.add(grass);

  const flowerGeometry = new THREE.IcosahedronGeometry(0.095, 0);
  const flowerMaterial = new THREE.MeshStandardMaterial({
    color: '#ffedb5',
    roughness: 0.9,
    emissive: '#544624',
    emissiveIntensity: 0.2,
  });
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, 1000);
  let flowerCount = 0;
  for (let i = 0; i < 2200 && flowerCount < 1000; i++) {
    const x = (random() - 0.5) * 190,
      z = 90 - random() * 195;
    const y = heightAt(x, z);
    if (y < 3 || nearTrail(x, z, 2.2) || nearLandmark(x, z, 6)) continue;
    if (Math.sin(x * 0.21) + Math.cos(z * 0.23) < 0.3) continue;
    dummy.position.set(x, y + 0.3, z);
    dummy.rotation.set(0, random() * TAU, 0);
    dummy.scale.set(1, 0.58, 1);
    dummy.updateMatrix();
    flowers.setMatrixAt(flowerCount, dummy.matrix);
    flowers.setColorAt(flowerCount++, new THREE.Color(random() > 0.25 ? '#ffe9a6' : '#f2f0d7'));
  }
  flowers.count = flowerCount;
  world.add(flowers);

  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), darkStone, 210);
  let rockCount = 0;
  for (let i = 0; i < 700 && rockCount < 210; i++) {
    const x = (random() - 0.5) * 395,
      z = (random() - 0.5) * 395;
    if (heightAt(x, z) < 2.5 || nearTrail(x, z, 4) || nearLandmark(x, z, 8)) continue;
    const size = 0.4 + random() * 1.5;
    dummy.position.set(x, heightAt(x, z) + size * 0.16, z);
    dummy.scale.set(size * 1.3, size * 0.62, size);
    dummy.rotation.set(random() * 0.6, random() * TAU, random() * 0.4);
    dummy.updateMatrix();
    rockMesh.setMatrixAt(rockCount, dummy.matrix);
    rockMesh.setColorAt(
      rockCount++,
      new THREE.Color('#9da28c').multiplyScalar(0.8 + random() * 0.3),
    );
  }
  rockMesh.count = rockCount;
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  world.add(rockMesh);

  // Old stone gate beside the starting ridge creates a recognizable silhouette.
  const overlook = new THREE.Group();
  overlook.position.set(12, heightAt(12, 72), 72);
  overlook.rotation.y = -0.18;
  world.add(overlook);
  box(overlook, stone, 0, 0.18, 0, 7.4, 0.35, 4.3);
  box(overlook, darkStone, -2.8, 2.4, 0, 1.05, 4.8, 1.15);
  box(overlook, stone, 2.8, 2.8, 0, 1.05, 5.6, 1.15);
  box(overlook, paleStone, 0.65, 5.5, 0, 5.4, 0.85, 1.2).rotation.z = -0.1;
  box(overlook, gold, 2.8, 3.7, 0.61, 0.32, 1.4, 0.05);
  box(overlook, stone, -4.4, 0.5, -0.7, 1.4, 1, 1.2).rotation.z = 0.3;

  // Distant ruins draw the eye beyond the playable objectives.
  const citadel = new THREE.Group();
  citadel.position.set(1, heightAt(1, -163) - 0.7, -163);
  world.add(citadel);
  const castleStone = new THREE.MeshStandardMaterial({
    color: '#819291',
    roughness: 0.95,
    flatShading: true,
  });
  const castleTrim = new THREE.MeshStandardMaterial({
    color: '#a1aca5',
    roughness: 0.93,
    flatShading: true,
  });
  const castleRoof = new THREE.MeshStandardMaterial({
    color: '#466575',
    roughness: 0.9,
    flatShading: true,
  });
  const castleWindow = new THREE.MeshStandardMaterial({
    color: '#c5e7bb',
    emissive: '#80aab1',
    emissiveIntensity: 0.45,
  });
  box(citadel, castleStone, 0, 3, 0, 28, 6, 21);
  box(citadel, castleStone, 0, 13, -2, 10, 21, 10);
  box(citadel, castleTrim, 0, 23.2, -2, 11.5, 1, 11.5);
  const mainRoof = mesh(new THREE.ConeGeometry(8, 14, 4), castleRoof, citadel);
  mainRoof.position.set(0, 30.7, -2);
  mainRoof.rotation.y = Math.PI / 4;
  for (const [x, z, h] of [
    [-13, 7, 13],
    [13, 7, 17],
    [-12, -9, 20],
    [12, -9, 24],
  ]) {
    const tower = mesh(new THREE.CylinderGeometry(3, 3.6, h, 8), castleStone, citadel);
    tower.position.set(x, h / 2, z);
    const rim = mesh(new THREE.CylinderGeometry(3.7, 3.7, 1, 8), castleTrim, citadel);
    rim.position.set(x, h, z);
    const roof = mesh(new THREE.ConeGeometry(4.2, 8, 8), castleRoof, citadel);
    roof.position.set(x, h + 4.5, z);
    for (let w = 0; w < 2; w++)
      box(citadel, castleWindow, x, h - 3.2 - w * 4, z + 3.02, 0.55, 1.4, 0.1);
  }
  for (let i = 0; i < 11; i++) box(citadel, castleTrim, -13 + i * 2.6, 6.4, 10.5, 1.3, 1.6, 1.2);
  for (let i = 0; i < 3; i++) box(citadel, castleWindow, -2.7 + i * 2.7, 18, 3.08, 0.7, 2.5, 0.1);
  box(citadel, darkStone, 0, 2, 10.56, 4, 4.1, 0.15);
  // A turquoise spire announces the long-forgotten seat of the valley.
  const farCrystal = mesh(
    new THREE.OctahedronGeometry(1.5),
    new THREE.MeshStandardMaterial({
      color: '#bbf3da',
      emissive: '#69cfbb',
      emissiveIntensity: 1.3,
    }),
    citadel,
  );
  farCrystal.position.set(0, 41, -2);

  const beaconVisuals = new Map<
    string,
    {
      group: THREE.Group;
      crystal: THREE.Mesh;
      glow: THREE.MeshStandardMaterial;
      beam: THREE.MeshBasicMaterial;
      ring: THREE.Mesh;
      active: boolean;
    }
  >();
  for (const beacon of BEACONS) {
    const shrine = new THREE.Group();
    shrine.name = beacon.name;
    shrine.position.set(beacon.x, heightAt(beacon.x, beacon.z), beacon.z);
    world.add(shrine);
    const base = mesh(new THREE.CylinderGeometry(5.4, 5.8, 0.38, 12), darkStone, shrine);
    base.position.y = -0.25;
    const floor = mesh(new THREE.CylinderGeometry(4.75, 5, 0.2, 12), paleStone, shrine);
    floor.position.y = -0.04;
    const innerFloor = mesh(new THREE.CylinderGeometry(2.9, 3.1, 0.09, 12), stone, shrine);
    innerFloor.position.y = 0.06;
    for (const x of [-3.15, 3.15]) {
      box(shrine, darkStone, x, 0.8, -1.4, 1.65, 0.6, 1.8);
      box(shrine, stone, x, 3.2, -1.4, 1.03, 4.5, 1.2);
      box(shrine, paleStone, x, 5.4, -1.4, 1.5, 0.65, 1.55);
      box(shrine, gold, x, 3.55, -0.77, 0.18, 1.9, 0.04);
      box(shrine, gold, x, 2.8, -0.74, 0.72, 0.15, 0.07);
    }
    box(shrine, stone, 0, 5.85, -1.4, 7.6, 0.7, 1.6);
    box(shrine, paleStone, 0, 6.32, -1.4, 5.4, 0.28, 1.2);
    const diamondRelief = box(shrine, gold, 0, 5.88, -0.57, 0.67, 0.67, 0.06);
    diamondRelief.rotation.z = Math.PI / 4;
    const pedestal = mesh(new THREE.CylinderGeometry(0.95, 1.35, 0.85, 6), darkStone, shrine);
    pedestal.position.set(0, 0.95, 0);
    const glow = new THREE.MeshStandardMaterial({
      color: '#ffd688',
      emissive: '#ffae4a',
      emissiveIntensity: 1.35,
      metalness: 0.2,
      roughness: 0.3,
    });
    const crystal = mesh(new THREE.OctahedronGeometry(0.77), glow, shrine);
    crystal.scale.y = 1.6;
    crystal.position.set(0, 2.65, 0);
    const ring = mesh(new THREE.TorusGeometry(2.7, 0.06, 5, 48), glow, shrine);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.13;
    const orbit = mesh(new THREE.TorusGeometry(1.18, 0.035, 5, 36), gold, shrine);
    orbit.position.y = 2.65;
    orbit.rotation.x = Math.PI * 0.33;
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: '#ffe0a0',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = mesh(
      new THREE.CylinderGeometry(0.19, 0.58, 65, 12, 1, true),
      beamMaterial,
      shrine,
    );
    beam.position.y = 35;
    beam.castShadow = false;
    const footGlow = mesh(
      new THREE.CircleGeometry(2, 32),
      new THREE.MeshBasicMaterial({
        color: '#ffe1a0',
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
      shrine,
    );
    footGlow.rotation.x = -Math.PI / 2;
    footGlow.position.y = 0.12;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const rune = box(
        shrine,
        glow,
        Math.cos(a) * 3.5,
        0.071,
        Math.sin(a) * 3.5,
        0.17,
        0.025,
        0.55,
      );
      rune.rotation.y = -a;
    }
    beaconVisuals.set(beacon.id, {
      group: shrine,
      crystal,
      glow,
      beam: beamMaterial,
      ring,
      active: false,
    });
  }

  const relicVisuals = new Map<string, { group: THREE.Group; gem: THREE.Mesh; baseY: number }>();
  const relicMaterial = new THREE.MeshStandardMaterial({
    color: '#a6e1b9',
    emissive: '#51b48b',
    emissiveIntensity: 0.95,
    roughness: 0.23,
    metalness: 0.25,
  });
  const relicHalo = new THREE.MeshBasicMaterial({
    color: '#a6e1b9',
    transparent: true,
    opacity: 0.5,
  });
  for (const relic of RELICS) {
    const relicGroup = new THREE.Group();
    relicGroup.position.set(relic.x, heightAt(relic.x, relic.z), relic.z);
    world.add(relicGroup);
    const gem = mesh(new THREE.OctahedronGeometry(0.38), relicMaterial, relicGroup);
    gem.position.y = 1.35;
    gem.scale.y = 1.5;
    const ring = mesh(new THREE.TorusGeometry(0.7, 0.025, 4, 28), relicHalo, relicGroup);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    ring.castShadow = false;
    relicVisuals.set(relic.id, { group: relicGroup, gem, baseY: 1.35 });
  }

  // Mossy fragments and trail markers hint at a history without crowding routes.
  for (const [x, z, angle] of [
    [31, 32, 0.6],
    [-42, -17, -0.2],
    [26, -71, 1.1],
    [-69, -97, -0.4],
    [104, -82, 0.3],
  ]) {
    const ruins = new THREE.Group();
    ruins.position.set(x, heightAt(x, z), z);
    ruins.rotation.y = angle;
    world.add(ruins);
    box(ruins, stone, 0, 1.3, 0, 1.2, 2.6, 1.15);
    box(ruins, paleStone, 0, 2.7, 0, 1.6, 0.3, 1.55);
    box(ruins, darkStone, 2.2, 0.6, 0.2, 2.6, 0.7, 1.15).rotation.z = 0.13;
    box(ruins, stone, -1.6, 0.28, 1.7, 1.7, 0.55, 1.1).rotation.y = 0.8;
  }
  for (const [x, z] of [
    [1, 56],
    [-17, 17],
    [-54, -33],
    [30, -47],
    [60, -79],
  ]) {
    const y = heightAt(x + 3, z);
    box(world, wood, x + 3, y + 1, z, 0.14, 2, 0.17);
    const sign = box(world, wood, x + 3.25, y + 1.8, z, 1.3, 0.4, 0.12);
    sign.rotation.z = -0.07;
    box(world, gold, x + 3.27, y + 1.81, z + 0.07, 0.55, 0.05, 0.01);
  }

  // Broad ridges with offset shoulders open the sky above the valley.
  // Their irregular, triangulated slopes read as a mountain range, not cones.
  function mountain(
    cx: number,
    cz: number,
    radius: number,
    originalHeight: number,
    color: string,
    snowy = false,
  ) {
    const height = originalHeight * (snowy ? 0.56 : 0.49);
    const cells = 16;
    const positions: number[] = [];
    const colors: number[] = [];
    const baseColor = new THREE.Color(color);
    const offset = random() * 6;
    const grid: THREE.Vector3[][] = [];
    for (let iz = 0; iz <= cells; iz++) {
      const row: THREE.Vector3[] = [];
      for (let ix = 0; ix <= cells; ix++) {
        const u = (ix / cells) * 2 - 1;
        const v = (iz / cells) * 2 - 1;
        const mainPeak = Math.exp(-((u - 0.06) ** 2 / 0.22 + (v + 0.04) ** 2 / 0.31));
        const leftShoulder = Math.exp(-((u + 0.48) ** 2 / 0.065 + (v - 0.05) ** 2 / 0.21)) * 0.56;
        const rightShoulder = Math.exp(-((u - 0.5) ** 2 / 0.09 + (v + 0.17) ** 2 / 0.13)) * 0.66;
        const shape = Math.max(mainPeak, leftShoulder, rightShoulder);
        const edge = Math.max(0, 1 - Math.max(Math.abs(u), Math.abs(v)) ** 7);
        const ridges =
          1 + Math.sin(u * 16 + v * 7 + offset) * 0.075 + Math.sin(v * 12 - u * 8) * 0.035;
        row.push(
          new THREE.Vector3(
            cx + u * radius,
            -8 + (height + 8) * shape * edge * ridges,
            cz + v * radius,
          ),
        );
      }
      grid.push(row);
    }
    const addFace = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
      const elevation = (a.y + b.y + c.y) / 3;
      const shade =
        snowy && elevation > height * 0.7
          ? new THREE.Color('#d1e2de').multiplyScalar(0.94 + random() * 0.06)
          : baseColor.clone().multiplyScalar(0.92 + random() * 0.12);
      for (let k = 0; k < 3; k++) colors.push(shade.r, shade.g, shade.b);
    };
    for (let iz = 0; iz < cells; iz++) {
      for (let ix = 0; ix < cells; ix++) {
        const a = grid[iz][ix],
          b = grid[iz][ix + 1];
        const c = grid[iz + 1][ix],
          d = grid[iz + 1][ix + 1];
        addFace(a, c, b);
        addFace(b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mountainMesh = mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
    );
    mountainMesh.castShadow = false;
    mountainMesh.receiveShadow = false;
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 13) * Math.PI;
    mountain(
      Math.cos(a) * 345,
      -170 - Math.sin(a) * 165,
      76 + random() * 40,
      67 + random() * 75,
      '#9ebbc2',
    );
  }
  mountain(171, -314, 115, 163, '#93afb6', true);
  mountain(-229, -310, 109, 133, '#a2bbc0', true);
  for (let i = 0; i < 12; i++) {
    const a = (i / 11) * Math.PI;
    mountain(
      Math.cos(a) * 284,
      -148 - Math.sin(a) * 128,
      57 + random() * 39,
      45 + random() * 47,
      '#7d9fa6',
    );
  }

  // Soft cloud islands are smooth and unlit, preserving the watercolor sky.
  const cloudGeometry = new THREE.SphereGeometry(1, 10, 7);
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#f7f3dc', fog: false });
  const cloudMesh = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 180);
  const cloudData: {
    x: number;
    y: number;
    z: number;
    sx: number;
    sy: number;
    sz: number;
    speed: number;
  }[] = [];
  let cloudCount = 0;
  for (let i = 0; i < 26; i++) {
    const cx = (random() - 0.5) * 760;
    const cz = -100 - random() * 330;
    const cy = 65 + random() * 50;
    const size = 0.7 + random();
    for (let j = 0; j < 5 + Math.floor(random() * 3); j++) {
      cloudData.push({
        x: cx + (j - 2.5) * 7 * size,
        y: cy + Math.sin(j * 0.75) * 4 * size,
        z: cz + random() * 5,
        sx: (7 + random() * 6) * size,
        sy: (2.4 + random() * 3.4) * size,
        sz: (3.7 + random() * 4) * size,
        speed: 0.1 + (i % 3) * 0.035,
      });
      cloudMesh.setColorAt(cloudCount++, new THREE.Color(j === 0 ? '#e2eadf' : '#fff9e8'));
    }
  }
  cloudMesh.count = cloudCount;
  cloudMesh.frustumCulled = false;
  world.add(cloudMesh);

  // Small birds follow wide loops above the valley.
  const birdMaterial = new THREE.MeshBasicMaterial({ color: '#445f61', side: THREE.DoubleSide });
  const birdGeometry = new THREE.BufferGeometry();
  birdGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.9, 0.18, 0, 0, 0, 0.16, -0.32, 0, -0.13, 0.9, 0.18, 0, 0.32, 0, -0.13, 0, 0, 0.16],
      3,
    ),
  );
  const birds = new THREE.InstancedMesh(birdGeometry, birdMaterial, 12);
  birds.frustumCulled = false;
  world.add(birds);

  const windParticles = new THREE.BufferGeometry();
  const windPositions = new Float32Array(75 * 3);
  for (let i = 0; i < 75; i++) {
    windPositions[i * 3] = (random() - 0.5) * 200;
    windPositions[i * 3 + 1] = 12 + random() * 25;
    windPositions[i * 3 + 2] = 85 - random() * 230;
  }
  windParticles.setAttribute('position', new THREE.BufferAttribute(windPositions, 3));
  const motes = new THREE.Points(
    windParticles,
    new THREE.PointsMaterial({
      color: '#fff4c4',
      size: 0.15,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  world.add(motes);

  // Batch the fixed architecture by material, retaining only animated pieces.
  // This also keeps shadow rendering inexpensive around the three shrines.
  const fixedMaterials = new Set<THREE.Material>([
    stone,
    darkStone,
    paleStone,
    gold,
    wood,
    castleStone,
    castleTrim,
    castleRoof,
    castleWindow,
    pathMaterial,
  ]);
  const fixedMeshes = new Map<THREE.Material, THREE.Mesh[]>();
  world.updateMatrixWorld(true);
  world.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      Array.isArray(object.material) ||
      !fixedMaterials.has(object.material)
    )
      return;
    const batch = fixedMeshes.get(object.material) ?? [];
    batch.push(object);
    fixedMeshes.set(object.material, batch);
  });
  const replacedGeometries = new Set<THREE.BufferGeometry>();
  for (const [material, objects] of fixedMeshes) {
    const transformed = objects.map((object) => {
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      // Basic primitives differ in their UV attributes, which are unused here.
      geometry.deleteAttribute('uv');
      replacedGeometries.add(object.geometry);
      return geometry.index ? geometry.toNonIndexed() : geometry;
    });
    const merged = mergeGeometries(transformed);
    if (merged) {
      objects.forEach((object) => object.removeFromParent());
      const architecture = mesh(merged, material);
      architecture.castShadow = material !== pathMaterial;
    }
    transformed.forEach((geometry) => geometry.dispose());
  }
  world.traverse((object) => {
    if (object instanceof THREE.Mesh) replacedGeometries.delete(object.geometry);
  });
  replacedGeometries.forEach((geometry) => geometry.dispose());

  const worldScene: WorldScene = {
    update(time, dt) {
      for (const visual of beaconVisuals.values()) {
        visual.crystal.rotation.y = time * 0.42;
        visual.crystal.position.y = 2.65 + Math.sin(time * 1.6) * 0.15;
        visual.ring.scale.setScalar(1 + Math.sin(time * 1.7) * 0.015);
        visual.beam.opacity = (visual.active ? 0.16 : 0.105) + Math.sin(time * 1.3) * 0.018;
      }
      let ri = 0;
      for (const relic of relicVisuals.values()) {
        relic.gem.rotation.y = time * 0.8 + ri;
        relic.gem.rotation.z = Math.sin(time * 1.1 + ri) * 0.13;
        relic.gem.position.y = relic.baseY + Math.sin(time * 2.1 + ri++) * 0.16;
      }
      for (let i = 0; i < cloudData.length; i++) {
        const cloud = cloudData[i];
        dummy.position.set(cloud.x + Math.sin(time * 0.005) * 14 * cloud.speed, cloud.y, cloud.z);
        dummy.scale.set(cloud.sx, cloud.sy, cloud.sz);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        cloudMesh.setMatrixAt(i, dummy.matrix);
      }
      cloudMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 12; i++) {
        const angle = time * (0.038 + i * 0.001) + i * 0.51;
        dummy.position.set(
          Math.sin(angle) * (25 + i * 2.7),
          46 + Math.sin(time * 0.12 + i) * 3 + (i % 4),
          -45 + Math.cos(angle) * 23,
        );
        dummy.rotation.set(0, -angle + Math.PI / 2, Math.sin(time * 3.5 + i) * 0.2);
        dummy.scale.setScalar(0.65 + (i % 3) * 0.15);
        dummy.updateMatrix();
        birds.setMatrixAt(i, dummy.matrix);
      }
      birds.instanceMatrix.needsUpdate = true;
      ripples.forEach((ripple, i) => {
        ripple.scale.y = 0.75 + Math.sin(time * 0.9 + i) * 0.35;
      });
      motes.rotation.y += Math.min(dt, 0.05) * 0.0015;
      farCrystal.rotation.y = time * 0.3;
    },
    setBeaconActive(id, active) {
      const visual = beaconVisuals.get(id);
      if (!visual) return;
      visual.active = active;
      visual.glow.color.set(active ? '#a2ffe3' : '#ffd688');
      visual.glow.emissive.set(active ? '#42d4b5' : '#ffae4a');
      visual.beam.color.set(active ? '#99ffe1' : '#ffe0a0');
    },
    setRelicCollected(id, collected) {
      const visual = relicVisuals.get(id);
      if (visual) visual.group.visible = !collected;
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      world.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      scene.remove(world);
    },
  };
  worldScene.update(0, 0);
  return worldScene;
}
