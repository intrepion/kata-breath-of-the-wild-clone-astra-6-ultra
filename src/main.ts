import * as THREE from 'three';
import './style.css';
import { createWorld, heightAt } from './world';
import { createHero, createEnemy } from './characters';
import {
  createGameState,
  updatePlayer,
  jump,
  attack,
  interact,
  eat,
  nearestInteraction,
  serializeSave,
  restoreSave,
} from './game-state';
import { GameUI, type Panel } from './ui';
import { AdventureAudio } from './audio';
import { BEACONS, RELICS } from './layout';

const SAVE_KEY = 'wildreach.journey.v1';
const SETTINGS_KEY = 'wildreach.settings.v1';

function main(): void {
  let rawSave: string | null = null;
  let preferences: { sound?: boolean; quality?: string } = {};
  try {
    rawSave = localStorage.getItem(SAVE_KEY);
    const parsed: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (parsed && typeof parsed === 'object') preferences = parsed;
  } catch {
    /* A private browser can still play without persistent storage. */
  }
  const restored = restoreSave(rawSave, heightAt);
  let state = restored || createGameState(heightAt);
  const audio = new AdventureAudio();
  const keys = new Set<string>();
  let cameraYaw = 0;
  let cameraPitch = 0.16;
  let cameraDistance = 13.5;
  let joystickX = 0;
  let joystickZ = 0;
  let touchSprint = false;
  let lastSave = 0;
  let lastUiUpdate = 0;
  let animationTime = 0;
  let dragging = false;
  let dragDistance = 0;
  let pointerX = 0;
  let pointerY = 0;
  let observedProgress = '';
  let previousPlayerX = state.player.x;
  let previousPlayerZ = state.player.z;
  let victoryShown = state.won;
  let victoryTimer = 0;
  let needsRender = true;
  const ui = new GameUI(() => state, onAction, heightAt, !!restored);
  const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    document.querySelector('#app')!.innerHTML =
      '<div class="error-screen"><div><span>WILDREACH · THE FIRST LIGHT</span><h1>A world worth seeing.</h1><p>This adventure needs WebGL 2. Enable graphics acceleration in your browser settings, or open it in a recent Chrome, Firefox, Edge, or Safari.</p><button onclick="location.reload()">Try again</button></div></div>';
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b8d5ce');
  scene.fog = new THREE.Fog('#b7d2c9', 105, 360);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 1400);
  const hemisphere = new THREE.HemisphereLight('#d8eadd', '#6f8351', 1.65);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#fff1cf', 2.3);
  sun.position.set(-65, 110, 65);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -75;
  sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.15;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#6db1d2') },
        bottom: { value: new THREE.Color('#c1dfde') },
      },
      vertexShader:
        'varying vec3 worldPosition; void main(){worldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 worldPosition; void main(){float h=normalize(worldPosition).y;gl_FragColor=vec4(mix(bottom,top,pow(max(h,0.0),0.55)),1.0);\n#include <colorspace_fragment>\n}',
      toneMapped: false,
    }),
  );
  scene.add(sky);
  const world = createWorld(scene);
  const hero = createHero();
  scene.add(hero.group);
  const enemyModels = state.enemies.map((enemy) => {
    const model = createEnemy();
    scene.add(model.group);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.68, 24),
      new THREE.MeshBasicMaterial({
        color: '#f3ab6b',
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    return {
      ...model,
      id: enemy.id,
      lastHp: enemy.hp,
      lastX: enemy.x,
      lastZ: enemy.z,
      hurtTime: 0,
      ring,
    };
  });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.47, 24),
    new THREE.MeshBasicMaterial({
      color: '#234633',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const targetPosition = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const cameraLookAt = new THREE.Vector3(state.player.x, state.player.y + 2.4, state.player.z);
  const desiredLookAt = new THREE.Vector3();

  function setQuality(value: string): void {
    needsRender = true;
    ui.quality = value === 'low' ? 'low' : 'high';
    renderer.setPixelRatio(
      ui.quality === 'low' ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.75),
    );
    renderer.shadowMap.enabled = ui.quality === 'high';
    renderer.setSize(innerWidth, innerHeight);
  }
  setQuality(preferences.quality || 'high');
  ui.setSound(preferences.sound !== false);
  audio.setEnabled(ui.sound);

  function savePreferences(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sound: ui.sound, quality: ui.quality }));
    } catch {
      /* Settings remain in memory. */
    }
  }
  function save(): void {
    if (!ui.started) return;
    try {
      localStorage.setItem(SAVE_KEY, serializeSave(state));
      ui.saved(true);
    } catch {
      ui.saved(false);
    }
  }
  function clearInput(): void {
    keys.clear();
    joystickX = joystickZ = 0;
    touchSprint = false;
    dragging = false;
    document.querySelector<HTMLElement>('#joystick-knob')!.style.transform = '';
  }
  function panel(name: Panel | null): void {
    clearInput();
    if (name) save();
    ui.showPanel(name);
  }
  function start(): void {
    if (ui.started) return;
    ui.begin();
    audio.start();
    audio.setEnabled(ui.sound);
    save();
    ui.notify(
      restored
        ? 'Welcome back, wanderer.'
        : 'Follow the golden light. Press H for your field guide.',
    );
  }
  function onAction(action: string, value?: string): void {
    if (['map', 'inventory', 'guide', 'settings', 'pause', 'reset'].includes(action)) {
      panel(ui.panel === action ? null : (action as Panel));
      return;
    }
    switch (action) {
      case 'start':
        start();
        break;
      case 'close':
        panel(null);
        break;
      case 'sound':
        audio.start();
        ui.setSound(!ui.sound);
        audio.setEnabled(ui.sound);
        savePreferences();
        if (ui.panel === 'settings') ui.showPanel('settings');
        break;
      case 'quality':
        setQuality(value || 'high');
        savePreferences();
        break;
      case 'fullscreen':
        if (document.fullscreenElement)
          void document
            .exitFullscreen()
            .catch(() => ui.notify('Fullscreen is unavailable in this browser.'));
        else if (document.documentElement.requestFullscreen)
          void document.documentElement
            .requestFullscreen()
            .catch(() => ui.notify('Fullscreen is unavailable in this browser.'));
        else ui.notify('Use your browser’s fullscreen control to expand the view.');
        break;
      case 'photo':
        if (!ui.panel) {
          clearInput();
          ui.togglePhoto();
        }
        break;
      case 'eat': {
        if (ui.panel && ui.panel !== 'inventory') return;
        if (!ui.started) start();
        const ate = eat(state);
        if (!ate)
          ui.notify(
            state.apples
              ? 'Your hearts are already full.'
              : 'Your satchel is out of apples. Defeat a sentinel to find more.',
          );
        flushEvents();
        save();
        if (ui.panel === 'inventory') ui.showPanel('inventory');
        ui.update(state, cameraYaw);
        break;
      }
      case 'jump':
        if (!ui.panel && !ui.photo) {
          start();
          jump(state);
          audio.play('jump');
        }
        break;
      case 'attack':
        if (!ui.panel && !ui.photo) {
          start();
          if (!state.player.attackCooldown) audio.play('attack');
          attack(state);
        }
        break;
      case 'interact':
        if (!ui.panel && !ui.photo) {
          start();
          if (nearestInteraction(state)) {
            interact(state);
            syncWorld();
            flushEvents();
            save();
          } else ui.notify('Move closer to a spirit shard or an ancient shrine.');
        }
        break;
      case 'waypoint': {
        const beacon = BEACONS.find((b) => b.id === value);
        if (beacon) {
          ui.waypoint = { ...beacon };
          panel(null);
          ui.notify(`Following the light to ${beacon.name}.`);
        }
        break;
      }
      case 'clear-waypoint':
        ui.waypoint = null;
        ui.notify('Waypoint cleared. Let curiosity be your compass.');
        break;
      case 'confirm-reset':
        state = createGameState(heightAt);
        victoryShown = false;
        observedProgress = '';
        clearTimeout(victoryTimer);
        lastSave = 0;
        previousPlayerX = state.player.x;
        previousPlayerZ = state.player.z;
        cameraYaw = 0;
        cameraPitch = 0.16;
        ui.waypoint = null;
        syncWorld();
        panel(null);
        start();
        save();
        updateCamera(1, true);
        ui.update(state, cameraYaw);
        ui.notify('A fresh wind. A new beginning.');
        break;
    }
  }

  function flushEvents(): void {
    for (const event of state.events.splice(0)) {
      ui.notify(event.text, event.type);
      audio.play(event.type);
      if (event.type === 'victory' && !victoryShown) {
        victoryShown = true;
        victoryTimer = window.setTimeout(() => {
          if (state.won) panel('victory');
        }, 900);
      }
    }
  }
  function syncWorld(): void {
    const signature = state.beacons.join(',') + '|' + state.collected.join(',');
    if (signature === observedProgress) return;
    observedProgress = signature;
    for (const beacon of BEACONS)
      world.setBeaconActive(beacon.id, state.beacons.includes(beacon.id));
    for (const relic of RELICS)
      world.setRelicCollected(relic.id, state.collected.includes(relic.id));
  }

  const handledKeys = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
    'Space',
    'ShiftLeft',
    'ShiftRight',
    'KeyJ',
    'KeyE',
    'KeyF',
    'KeyQ',
    'KeyR',
    'KeyM',
    'KeyI',
    'KeyH',
    'KeyP',
    'Escape',
  ]);
  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)
      return;
    if (!handledKeys.has(event.code)) return;
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (event.code === 'Escape') {
      if (event.repeat) return;
      if (ui.photo) {
        ui.togglePhoto();
        return;
      }
      panel(ui.panel ? null : 'pause');
      return;
    }
    const menu: Record<string, Panel> = { KeyM: 'map', KeyI: 'inventory', KeyH: 'guide' };
    if (menu[event.code] && !event.repeat) {
      onAction(menu[event.code]);
      return;
    }
    if (event.code === 'KeyP' && !event.repeat) {
      onAction('photo');
      return;
    }
    if (event.code === 'KeyF' && ui.panel === 'inventory' && !event.repeat) {
      onAction('eat');
      return;
    }
    if (ui.panel || ui.photo) return;
    if (
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(
        event.code,
      )
    )
      canvas.focus({ preventScroll: true });
    keys.add(event.code);
    if (
      !ui.started &&
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowLeft',
        'ArrowDown',
        'ArrowRight',
        'Space',
      ].includes(event.code)
    )
      start();
    if (event.repeat) return;
    if (event.code === 'Space') onAction('jump');
    if (event.code === 'KeyJ') onAction('attack');
    if (event.code === 'KeyE') onAction('interact');
    if (event.code === 'KeyF') onAction('eat');
  });
  document.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    clearInput();
    save();
    if (ui.started && !ui.panel && !ui.photo) panel('pause');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInput();
      save();
      if (ui.started && !ui.panel) panel('pause');
    }
  });
  window.addEventListener('pagehide', save);
  canvas.addEventListener('pointerdown', (event) => {
    if (ui.panel || event.button > 0) return;
    dragging = true;
    dragDistance = 0;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || ui.panel) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    dragDistance += Math.abs(dx) + Math.abs(dy);
    cameraYaw -= dx * 0.004;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.003, -0.1, 1.05);
    pointerX = event.clientX;
    pointerY = event.clientY;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (dragDistance < 5 && !ui.photo) onAction('attack');
  });
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (ui.panel) return;
      event.preventDefault();
      cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * 0.01, 7, 24);
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  const joystick = document.querySelector<HTMLElement>('#joystick')!;
  let joystickPointer: number | null = null;
  const moveJoystick = (event: PointerEvent) => {
    const rect = joystick.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, y);
    const clamped = Math.min(1, 38 / (length || 1));
    joystickX = (x * clamped) / 38;
    joystickZ = (-y * clamped) / 38;
    document.querySelector<HTMLElement>('#joystick-knob')!.style.transform =
      `translate(${x * clamped}px,${y * clamped}px)`;
  };
  joystick.addEventListener('pointerdown', (event) => {
    if (ui.panel) return;
    event.preventDefault();
    start();
    joystickPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    moveJoystick(event);
  });
  joystick.addEventListener('pointermove', (event) => {
    if (event.pointerId === joystickPointer) moveJoystick(event);
  });
  const endJoystick = () => {
    joystickPointer = null;
    joystickX = joystickZ = 0;
    document.querySelector<HTMLElement>('#joystick-knob')!.style.transform = '';
  };
  joystick.addEventListener('pointerup', endJoystick);
  joystick.addEventListener('pointercancel', endJoystick);
  const sprintButton = document.querySelector<HTMLElement>('[data-touch="sprint"]')!;
  sprintButton.addEventListener('pointerdown', (event) => {
    touchSprint = true;
    sprintButton.setPointerCapture(event.pointerId);
  });
  sprintButton.addEventListener('pointerup', () => {
    touchSprint = false;
  });
  sprintButton.addEventListener('pointercancel', () => {
    touchSprint = false;
  });

  window.addEventListener('resize', () => {
    needsRender = true;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    save();
    panel('pause');
    ui.notify('Graphics were interrupted. Reload to continue your saved journey.');
  });

  function updateCamera(dt: number, instant = false): void {
    const player = state.player;
    targetPosition.set(player.x, player.y, player.z);
    const horizontalDistance = Math.cos(cameraPitch) * cameraDistance;
    desiredCameraPosition.set(
      player.x + Math.sin(cameraYaw) * horizontalDistance,
      player.y + 3.3 + Math.sin(cameraPitch) * cameraDistance,
      player.z + Math.cos(cameraYaw) * horizontalDistance,
    );
    desiredCameraPosition.y = Math.max(
      desiredCameraPosition.y,
      heightAt(desiredCameraPosition.x, desiredCameraPosition.z) + 1.4,
    );
    desiredLookAt.set(player.x, player.y + 2.3, player.z);
    const smooth = instant ? 1 : 1 - Math.exp(-7 * dt);
    camera.position.lerp(desiredCameraPosition, smooth);
    cameraLookAt.lerp(desiredLookAt, smooth);
    camera.lookAt(cameraLookAt);
    sun.position.set(player.x - 65, player.y + 110, player.z + 65);
    sun.target.position.set(player.x, player.y, player.z);
  }
  syncWorld();
  updateCamera(1, true);
  ui.ready();

  // Read-only diagnostics are available to local development and browser tests only.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __wildreach: {
        snapshot: () => JSON.parse(serializeSave(state)),
        player: () => ({ ...state.player }),
        rendering: () => ({
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          width: canvas.width,
          height: canvas.height,
        }),
      },
    });
  }
  let previousTime = performance.now();
  function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const running = ui.started && !ui.panel && !ui.photo && !document.hidden;
    if (!ui.panel && !document.hidden) animationTime += dt;
    let moving = false;
    let sprinting = false;
    if (running) {
      if (keys.has('KeyQ')) cameraYaw += dt * 1.6;
      if (keys.has('KeyR')) cameraYaw -= dt * 1.6;
      const moveX =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) +
        joystickX;
      const moveZ =
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) +
        joystickZ;
      sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchSprint;
      updatePlayer(state, { moveX, moveZ, sprint: sprinting, cameraYaw }, dt, heightAt);
      moving =
        Math.hypot(state.player.x - previousPlayerX, state.player.z - previousPlayerZ) > 0.002;
      previousPlayerX = state.player.x;
      previousPlayerZ = state.player.z;
      syncWorld();
      flushEvents();
      audio.update(state.time);
      if (state.time - lastSave > 5) {
        save();
        lastSave = state.time;
      }
    }
    hero.group.position.set(state.player.x, state.player.y, state.player.z);
    let turn = state.player.heading - hero.group.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    hero.group.rotation.y += turn * Math.min(dt * 14, 1);
    hero.group.visible = !(
      state.player.invulnerable > 0 &&
      Math.floor(now / 110) % 2 === 0 &&
      running
    );
    hero.update(animationTime, dt, {
      moving,
      sprinting,
      gliding: state.player.mode === 'gliding',
      climbing: state.player.mode === 'climbing',
      attacking: state.player.attackCooldown > 0.12,
    });
    shadow.position.set(
      state.player.x,
      heightAt(state.player.x, state.player.z) + 0.11,
      state.player.z,
    );
    shadow.scale.setScalar(
      Math.max(0.35, 1 - (state.player.y - heightAt(state.player.x, state.player.z)) * 0.025),
    );
    enemyModels.forEach((model, i) => {
      const enemy = state.enemies[i];
      if (enemy.hp < model.lastHp) model.hurtTime = 0.3;
      if (running) model.hurtTime = Math.max(0, model.hurtTime - dt);
      model.lastHp = enemy.hp;
      model.group.visible = enemy.hp > 0;
      model.group.position.set(enemy.x, heightAt(enemy.x, enemy.z), enemy.z);
      const active = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z) < 14;
      if (active)
        model.group.rotation.y = Math.atan2(state.player.x - enemy.x, state.player.z - enemy.z);
      model.update(animationTime + i * 0.83, dt, {
        moving: running && Math.hypot(enemy.x - model.lastX, enemy.z - model.lastZ) > 0.001,
        attacking: enemy.attackCooldown > 1.25,
        hurt: model.hurtTime > 0,
      });
      model.ring.visible = enemy.hp > 0 && active;
      model.ring.position.set(enemy.x, heightAt(enemy.x, enemy.z) + 0.12, enemy.z);
      model.lastX = enemy.x;
      model.lastZ = enemy.z;
    });
    world.update(animationTime, dt);
    updateCamera(dt);
    if ((!ui.panel && !document.hidden) || needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    if (now - lastUiUpdate > 100) {
      ui.update(state, cameraYaw);
      ui.interaction(nearestInteraction(state)?.label || null);
      lastUiUpdate = now;
    }
  }
  requestAnimationFrame(frame);
}

main();
