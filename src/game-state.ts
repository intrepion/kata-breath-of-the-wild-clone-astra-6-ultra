import { BEACONS, ENEMY_SPAWNS, RELICS, SPAWN, WORLD_LIMIT } from './layout';

export type HeightAt = (x: number, z: number) => number;
export type PlayerMode = 'grounded' | 'airborne' | 'gliding' | 'climbing';
export interface GameEvent {
  type: 'info' | 'success' | 'damage' | 'victory';
  text: string;
}
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  yVelocity: number;
  heading: number;
  health: number;
  stamina: number;
  mode: PlayerMode;
  invulnerable: number;
  attackCooldown: number;
}
export interface EnemyState {
  id: string;
  x: number;
  z: number;
  hp: number;
  attackCooldown: number;
}
export interface GameState {
  player: PlayerState;
  beacons: string[];
  collected: string[];
  enemies: EnemyState[];
  apples: number;
  kills: number;
  won: boolean;
  time: number;
  events: GameEvent[];
}
export interface PlayerInput {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  cameraYaw?: number;
}
export interface Interaction {
  kind: 'relic' | 'beacon';
  id: string;
  label: string;
  distance: number;
}

const flatGround: HeightAt = () => 0;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

export function createGameState(heightAt: HeightAt = flatGround): GameState {
  return {
    player: {
      x: SPAWN.x,
      y: heightAt(SPAWN.x, SPAWN.z),
      z: SPAWN.z,
      yVelocity: 0,
      heading: Math.PI,
      health: 5,
      stamina: 100,
      mode: 'grounded',
      invulnerable: 0,
      attackCooldown: 0,
    },
    beacons: [],
    collected: [],
    enemies: ENEMY_SPAWNS.map((enemy) => ({ ...enemy, hp: 3, attackCooldown: 0 })),
    apples: 3,
    kills: 0,
    won: false,
    time: 0,
    events: [],
  };
}

function respawn(state: GameState, heightAt: HeightAt): void {
  const lastBeacon = BEACONS.find((beacon) => beacon.id === state.beacons.at(-1));
  const point = lastBeacon ? { x: lastBeacon.x, z: lastBeacon.z + 6 } : SPAWN;
  Object.assign(state.player, {
    ...point,
    y: heightAt(point.x, point.z),
    yVelocity: 0,
    health: 5,
    stamina: 100,
    mode: 'grounded',
    invulnerable: 3,
  });
  state.events.push({
    type: 'info',
    text: 'The wind carries you to safety. Your discoveries are saved.',
  });
}

function damage(state: GameState, amount: number, heightAt: HeightAt): void {
  if (state.player.invulnerable > 0) return;
  state.player.health = Math.max(0, state.player.health - amount);
  state.player.invulnerable = 1.2;
  state.events.push({
    type: 'damage',
    text: state.player.health
      ? 'You took damage. Press F to eat an apple.'
      : 'Your journey is not over…',
  });
  if (state.player.health === 0) respawn(state, heightAt);
}

/** Movement uses camera-relative input; positive moveZ points away from the camera. */
export function updatePlayer(
  state: GameState,
  input: PlayerInput,
  elapsed: number,
  heightAt: HeightAt,
): void {
  const dt = clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, 0.05);
  if (!dt) return;
  const player = state.player;
  state.time += dt;
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.attackCooldown = Math.max(0, player.attackCooldown - dt);

  const yaw = input.cameraYaw ?? 0;
  const length = Math.hypot(input.moveX, input.moveZ);
  const moving = length > 0.01;
  const moveX = moving ? input.moveX / Math.max(1, length) : 0;
  const moveZ = moving ? input.moveZ / Math.max(1, length) : 0;
  const dx = Math.cos(yaw) * moveX - Math.sin(yaw) * moveZ;
  const dz = -Math.sin(yaw) * moveX - Math.cos(yaw) * moveZ;
  if (moving) player.heading = Math.atan2(dx, dz);

  const ground = heightAt(player.x, player.z);
  // The ground tolerance follows terrain only for an already grounded player.
  // Airborne players must resolve the impact below, even a fraction above ground.
  const onGround =
    (player.mode === 'grounded' || player.mode === 'climbing') &&
    player.y <= ground + 0.06 &&
    player.yVelocity <= 0;
  const uphillSlope = moving
    ? (heightAt(player.x + dx * 0.6, player.z + dz * 0.6) - ground) / 0.6
    : 0;
  const climbing = onGround && moving && uphillSlope > 0.9;
  const gliding = player.mode === 'gliding' && !onGround && player.stamina > 0;
  const sprinting = onGround && moving && input.sprint && player.stamina > 0 && !climbing;
  let speed = gliding ? 11 : climbing ? (player.stamina > 0 ? 3.6 : 0) : sprinting ? 12 : 7;
  if (onGround && climbing && player.stamina < 1) speed = 0;
  const nextX = clamp(player.x + dx * speed * dt, -WORLD_LIMIT, WORLD_LIMIT);
  const nextZ = clamp(player.z + dz * speed * dt, -WORLD_LIMIT, WORLD_LIMIT);
  const nextGround = heightAt(nextX, nextZ);
  player.x = nextX;
  player.z = nextZ;

  if (onGround && player.yVelocity <= 0 && nextGround >= player.y - 0.65) {
    player.y = nextGround;
    player.yVelocity = 0;
    player.mode = climbing && speed > 0 ? 'climbing' : 'grounded';
  } else {
    player.mode = gliding ? 'gliding' : 'airborne';
    player.yVelocity = gliding
      ? Math.max(-2.8, player.yVelocity - 12 * dt)
      : player.yVelocity - 22 * dt;
    player.y += player.yVelocity * dt;
    if (player.y <= nextGround) {
      const impactSpeed = -player.yVelocity;
      player.y = nextGround;
      player.yVelocity = 0;
      player.mode = 'grounded';
      if (impactSpeed > 16) damage(state, Math.min(5, Math.ceil((impactSpeed - 16) / 6)), heightAt);
    }
  }

  const staminaBefore = player.stamina;
  const drain = gliding ? 7 : climbing ? 23 : sprinting ? 17 : 0;
  const recovering = onGround && !climbing && (!input.sprint || !moving);
  player.stamina = clamp(player.stamina + (drain ? -drain : recovering ? 20 : 0) * dt, 0, 100);
  if (player.mode === 'gliding' && player.stamina === 0) {
    player.mode = 'airborne';
    state.events.push({ type: 'info', text: 'Out of stamina! Land to recover.' });
  } else if (climbing && staminaBefore > 0 && player.stamina === 0) {
    state.events.push({ type: 'info', text: 'Out of stamina! Stop moving to recover.' });
  }

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    const range = distance(enemy, player);
    if (range < 14 && range > 1.8) {
      enemy.x += ((player.x - enemy.x) / range) * 2.6 * dt;
      enemy.z += ((player.z - enemy.z) / range) * 2.6 * dt;
    }
    if (
      distance(enemy, player) < 2.4 &&
      Math.abs(player.y - heightAt(enemy.x, enemy.z)) < 2.4 &&
      enemy.attackCooldown === 0
    ) {
      enemy.attackCooldown = 1.6;
      damage(state, 1, heightAt);
    }
  }
}

export function jump(state: GameState): void {
  const player = state.player;
  if (player.mode === 'grounded' || player.mode === 'climbing') {
    if (player.stamina < 8) return;
    player.stamina -= 8;
    player.yVelocity = 9.2;
    player.mode = 'airborne';
  } else if (player.mode === 'gliding') {
    player.mode = 'airborne';
    state.events.push({ type: 'info', text: 'Glider folded.' });
  } else if (player.stamina > 0) {
    player.mode = 'gliding';
    state.events.push({ type: 'info', text: 'Ride the wind. Move to steer your glider.' });
  }
}

export function attack(state: GameState): void {
  if (state.player.attackCooldown > 0) return;
  state.player.attackCooldown = 0.38;
  for (const enemy of state.enemies) {
    if (
      enemy.hp <= 0 ||
      distance(enemy, state.player) > 4.3 ||
      !['grounded', 'climbing'].includes(state.player.mode)
    )
      continue;
    enemy.hp -= 1;
    const range = distance(enemy, state.player) || 1;
    enemy.x = clamp(
      enemy.x + ((enemy.x - state.player.x) / range) * 0.8,
      -WORLD_LIMIT,
      WORLD_LIMIT,
    );
    enemy.z = clamp(
      enemy.z + ((enemy.z - state.player.z) / range) * 0.8,
      -WORLD_LIMIT,
      WORLD_LIMIT,
    );
    if (enemy.hp === 0) {
      state.kills += 1;
      state.apples = Math.min(99, state.apples + 1);
      state.events.push({ type: 'success', text: 'Sentinel defeated · +1 apple' });
    } else {
      state.events.push({ type: 'info', text: 'A clean strike!' });
    }
  }
}

export function nearestInteraction(state: GameState): Interaction | null {
  if (state.player.mode === 'airborne' || state.player.mode === 'gliding') return null;
  const interactions: Interaction[] = [
    ...RELICS.filter((relic) => !state.collected.includes(relic.id)).map((relic) => ({
      kind: 'relic' as const,
      id: relic.id,
      label: 'Gather Spirit shard',
      distance: distance(relic, state.player),
    })),
    ...BEACONS.filter((beacon) => !state.beacons.includes(beacon.id)).map((beacon) => ({
      kind: 'beacon' as const,
      id: beacon.id,
      label: `Awaken ${beacon.name}`,
      distance: distance(beacon, state.player),
    })),
  ];
  return (
    interactions
      .filter((item) => item.distance <= (item.kind === 'beacon' ? 6 : 4.5))
      .sort((a, b) => a.distance - b.distance)[0] ?? null
  );
}

export function interact(state: GameState): void {
  const target = nearestInteraction(state);
  if (!target) return;
  if (target.kind === 'relic') {
    state.collected.push(target.id);
    state.events.push({
      type: 'success',
      text: `Spirit shard found · ${state.collected.length}/${RELICS.length}`,
    });
    return;
  }
  state.beacons.push(target.id);
  state.player.health = 5;
  state.player.stamina = 100;
  state.events.push({
    type: 'success',
    text: `${BEACONS.find((beacon) => beacon.id === target.id)!.name} awakened · ${state.beacons.length}/3`,
  });
  if (state.beacons.length === BEACONS.length) {
    state.won = true;
    state.events.push({
      type: 'victory',
      text: 'The three winds are united. The Reach is alive again.',
    });
  }
}

export function eat(state: GameState): boolean {
  if (state.apples === 0 || state.player.health === 5) return false;
  state.apples -= 1;
  state.player.health = Math.min(5, state.player.health + 2);
  state.events.push({ type: 'success', text: 'A crisp apple · +2 hearts' });
  return true;
}

export function serializeSave(state: GameState): string {
  return JSON.stringify({
    version: 1,
    player: { x: state.player.x, z: state.player.z, health: state.player.health },
    beacons: state.beacons,
    collected: state.collected,
    enemies: state.enemies.map(({ id, x, z, hp }) => ({ id, x, z, hp })),
    apples: state.apples,
    kills: state.kills,
    time: state.time,
  });
}

/** Invalid or incompatible saves return null, allowing the caller to start safely. */
export function restoreSave(raw: string | null, heightAt: HeightAt = flatGround): GameState | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    const number = (value: unknown, min: number, max: number) =>
      typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
    const integer = (value: unknown, min: number, max: number) =>
      number(value, min, max) && Number.isInteger(value);
    const ids = (value: unknown, allowed: readonly { id: string }[]): value is string[] =>
      Array.isArray(value) &&
      new Set(value).size === value.length &&
      value.every((item) => typeof item === 'string' && allowed.some((known) => known.id === item));
    if (
      !saved ||
      typeof saved !== 'object' ||
      saved.version !== 1 ||
      !saved.player ||
      !number(saved.player.x, -WORLD_LIMIT, WORLD_LIMIT) ||
      !number(saved.player.z, -WORLD_LIMIT, WORLD_LIMIT) ||
      !integer(saved.player.health, 1, 5) ||
      !ids(saved.beacons, BEACONS) ||
      !ids(saved.collected, RELICS) ||
      !integer(saved.apples, 0, 99) ||
      !integer(saved.kills, 0, ENEMY_SPAWNS.length) ||
      !number(saved.time, 0, 1e12) ||
      !Array.isArray(saved.enemies) ||
      saved.enemies.length !== ENEMY_SPAWNS.length
    )
      return null;
    const enemyIds = new Set<string>();
    for (const enemy of saved.enemies) {
      if (
        !enemy ||
        !ENEMY_SPAWNS.some((known) => known.id === enemy.id) ||
        enemyIds.has(enemy.id) ||
        !number(enemy.x, -WORLD_LIMIT, WORLD_LIMIT) ||
        !number(enemy.z, -WORLD_LIMIT, WORLD_LIMIT) ||
        !integer(enemy.hp, 0, 3)
      )
        return null;
      enemyIds.add(enemy.id);
    }
    if (saved.enemies.filter((enemy: { hp: number }) => enemy.hp === 0).length !== saved.kills)
      return null;
    const state = createGameState(heightAt);
    state.player.x = saved.player.x;
    state.player.z = saved.player.z;
    state.player.y = heightAt(saved.player.x, saved.player.z);
    state.player.health = saved.player.health;
    state.player.invulnerable = 2;
    state.beacons = [...saved.beacons];
    state.collected = [...saved.collected];
    state.enemies = saved.enemies.map((enemy: EnemyState) => ({
      id: enemy.id,
      x: enemy.x,
      z: enemy.z,
      hp: enemy.hp,
      attackCooldown: 1,
    }));
    state.apples = saved.apples;
    state.kills = saved.kills;
    state.time = saved.time;
    state.won = state.beacons.length === BEACONS.length;
    return state;
  } catch {
    return null;
  }
}
