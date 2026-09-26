import { describe, expect, it } from 'vitest';
import {
  attack,
  createGameState,
  eat,
  interact,
  jump,
  nearestInteraction,
  restoreSave,
  serializeSave,
  updatePlayer,
  type GameState,
  type HeightAt,
  type PlayerInput,
} from './game-state';
import { BEACONS, RELICS, SPAWN, WORLD_LIMIT } from './layout';
import { heightAt as worldHeight } from './world';

const flat: HeightAt = () => 0;
const idle: PlayerInput = { moveX: 0, moveZ: 0, sprint: false };
function advance(
  state: GameState,
  seconds: number,
  input: PlayerInput = idle,
  height: HeightAt = flat,
) {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++)
    updatePlayer(state, input, 1 / 60, height);
}
function peacefulState() {
  const state = createGameState();
  // Keep enemies real and alive while placing them outside the movement fixture.
  state.enemies.forEach((enemy) => {
    enemy.x = -170;
    enemy.z = -170;
  });
  return state;
}

describe('traversal', () => {
  it('moves relative to the camera without faster diagonal movement', () => {
    const straight = peacefulState();
    const diagonal = peacefulState();
    advance(straight, 1, { moveX: 0, moveZ: 1, sprint: false, cameraYaw: Math.PI / 2 });
    advance(diagonal, 1, { moveX: 1, moveZ: 1, sprint: false });
    expect(straight.player.x).toBeCloseTo(-7);
    expect(straight.player.z).toBeCloseTo(SPAWN.z);
    expect(Math.hypot(diagonal.player.x, diagonal.player.z - SPAWN.z)).toBeCloseTo(7);
  });

  it('depletes sprint stamina, falls back to walking, then recovers when released', () => {
    const state = peacefulState();
    state.player.stamina = 1;
    advance(state, 1, { moveX: 1, moveZ: 0, sprint: true });
    expect(state.player.stamina).toBe(0);
    expect(state.player.x).toBeGreaterThan(7);
    expect(state.player.x).toBeLessThan(8);
    advance(state, 1);
    expect(state.player.stamina).toBeCloseTo(20);
  });

  it('jumps, opens a glider, and lands safely', () => {
    const state = peacefulState();
    jump(state);
    advance(state, 0.25);
    expect(state.player.y).toBeGreaterThan(1);
    jump(state);
    expect(state.player.mode).toBe('gliding');
    advance(state, 3, { moveX: 1, moveZ: 0, sprint: false });
    expect(state.player.mode).toBe('grounded');
    expect(state.player.health).toBe(5);
  });

  it('folds a depleted glider and bounds time steps and the world', () => {
    const state = peacefulState();
    state.player.y = 10;
    state.player.mode = 'gliding';
    state.player.stamina = 0.1;
    updatePlayer(state, idle, 100, flat);
    expect(state.player.mode).toBe('airborne');
    expect(state.time).toBe(0.05);
    state.player.x = WORLD_LIMIT - 0.01;
    advance(state, 1, { moveX: 1, moveZ: 0, sprint: false });
    expect(state.player.x).toBe(WORLD_LIMIT);
  });

  it('climbs steep uphill terrain at a stamina cost and stops when exhausted', () => {
    const slope: HeightAt = (x) => x * 1.2;
    const state = peacefulState();
    state.player.stamina = 10;
    advance(state, 0.1, { moveX: 1, moveZ: 0, sprint: false }, slope);
    expect(state.player.mode).toBe('climbing');
    expect(state.player.y).toBeCloseTo(state.player.x * 1.2);
    expect(state.player.stamina).toBeLessThan(10);
    advance(state, 1, { moveX: 1, moveZ: 0, sprint: false }, slope);
    const stoppedAt = state.player.x;
    advance(state, 1, { moveX: 1, moveZ: 0, sprint: false }, slope);
    expect(state.player.x).toBeCloseTo(stoppedAt);
    expect(state.player.stamina).toBe(0);
    expect(
      state.events.filter((event) => event.text === 'Out of stamina! Stop moving to recover.'),
    ).toHaveLength(1);
    advance(state, 1, idle, slope);
    expect(state.player.stamina).toBeGreaterThan(10);
  });

  it('respawns lethal falls at the last shrine while preserving discoveries', () => {
    const state = peacefulState();
    state.beacons.push('windward');
    state.collected.push('r1');
    state.player.y = 80;
    state.player.mode = 'airborne';
    advance(state, 4);
    expect(state.player.health).toBe(5);
    expect(state.player.x).toBe(BEACONS[0].x);
    expect(state.player.z).toBe(BEACONS[0].z + 6);
    expect(state.collected).toEqual(['r1']);
    expect(state.events.some((event) => event.text.includes('safety'))).toBe(true);
  });

  it('applies fall damage when the preceding frame ends just above the ground', () => {
    const state = peacefulState();
    state.player.y = 14.35;
    state.player.mode = 'airborne';
    state.player.stamina = 40;
    advance(state, 68 / 60);
    expect(state.player.y).toBeGreaterThan(0);
    expect(state.player.y).toBeLessThan(0.06);
    expect(state.player.mode).toBe('airborne');
    expect(state.player.stamina).toBe(40);
    updatePlayer(state, idle, 1 / 60, flat);
    expect(state.player.mode).toBe('grounded');
    expect(state.player.health).toBe(3);
    expect(state.player.stamina).toBe(40);
    updatePlayer(state, idle, 1 / 60, flat);
    expect(state.player.stamina).toBeGreaterThan(40);
  });
});

describe('discoveries and combat', () => {
  it('collects each nearby Spirit shard once and prevents airborne interaction', () => {
    const state = peacefulState();
    Object.assign(state.player, RELICS[0]);
    state.player.mode = 'airborne';
    expect(nearestInteraction(state)).toBeNull();
    interact(state);
    expect(state.collected).toEqual([]);
    state.player.mode = 'grounded';
    interact(state);
    interact(state);
    expect(state.collected).toEqual(['r1']);
  });

  it('wins exactly once by awakening the three unique shrines', () => {
    const state = peacefulState();
    for (const beacon of BEACONS) {
      state.player.x = beacon.x;
      state.player.z = beacon.z;
      interact(state);
      interact(state);
    }
    expect(state.beacons).toHaveLength(3);
    expect(state.won).toBe(true);
    expect(state.events.filter((event) => event.type === 'victory')).toHaveLength(1);
  });

  it('respects attack cooldown and gives one apple per defeated enemy', () => {
    const state = peacefulState();
    const enemy = state.enemies[0];
    enemy.x = state.player.x + 2;
    enemy.z = state.player.z;
    attack(state);
    attack(state);
    expect(enemy.hp).toBe(2);
    advance(state, 0.4);
    attack(state);
    advance(state, 0.4);
    attack(state);
    expect(enemy.hp).toBe(0);
    expect(state.kills).toBe(1);
    expect(state.apples).toBe(4);
    advance(state, 0.4);
    attack(state);
    expect(state.apples).toBe(4);
  });

  it('prevents simultaneous enemies from causing repeated damage during immunity', () => {
    const state = peacefulState();
    state.enemies.forEach((enemy) => {
      enemy.x = state.player.x + 1;
      enemy.z = state.player.z;
    });
    updatePlayer(state, idle, 1 / 60, flat);
    expect(state.player.health).toBe(4);
    advance(state, 0.5);
    expect(state.player.health).toBe(4);
    expect(eat(state)).toBe(true);
    expect(state.player.health).toBe(5);
    expect(state.apples).toBe(2);
    expect(eat(state)).toBe(false);
    expect(state.apples).toBe(2);
  });
});

describe('real landscape integration', () => {
  function walkRoute(state: GameState, waypoints: readonly (readonly [number, number])[]) {
    for (const [x, z] of waypoints) {
      let frames = 0;
      while (Math.hypot(state.player.x - x, state.player.z - z) > 0.25 && frames++ < 3600) {
        const dx = x - state.player.x,
          dz = z - state.player.z;
        const range = Math.hypot(dx, dz);
        if (
          state.enemies.some(
            (enemy) =>
              enemy.hp > 0 && Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z) < 3.8,
          )
        )
          attack(state);
        if (state.player.health <= 3) eat(state);
        if (state.player.stamina < 2) advance(state, 2, idle, worldHeight);
        updatePlayer(
          state,
          { moveX: dx / range, moveZ: -dz / range, sprint: false },
          1 / 60,
          worldHeight,
        );
        expect(Number.isFinite(state.player.y)).toBe(true);
        expect(state.player.y).toBeGreaterThanOrEqual(
          worldHeight(state.player.x, state.player.z) - 0.001,
        );
      }
      expect(frames, `Reach route waypoint ${x}, ${z}`).toBeLessThan(3600);
    }
  }

  it('walks the full quest trail, survives sentinels, and awakens all three shrines', () => {
    const state = createGameState(worldHeight);
    walkRoute(state, [
      [1, 68],
      [-1, 51],
      [-12, 32],
      [-24, 8],
    ]);
    interact(state);
    expect(state.beacons).toEqual(['windward']);
    walkRoute(state, [
      [-28, -11],
      [-43, -29],
      [-62, -44],
      [-83, -62],
    ]);
    interact(state);
    expect(state.beacons).toEqual(['windward', 'stillwater']);
    walkRoute(state, [
      [-62, -44],
      [-43, -29],
      [-28, -11],
      [-24, 8],
      [-4, -7],
      [5, -33],
      [28, -46],
      [49, -66],
      [63, -86],
      [78, -98],
    ]);
    interact(state);
    expect(state.won).toBe(true);
    expect(state.kills).toBeGreaterThanOrEqual(3);
    expect(state.events.some((event) => event.text.includes('safety'))).toBe(false);
    expect(state.player.health).toBe(5);
  });

  it('stops on a real steep shrine bank when exhausted and resumes after resting', () => {
    const state = createGameState(worldHeight);
    state.player.x = -86;
    state.player.z = -71;
    state.player.y = worldHeight(-86, -71);
    state.player.stamina = 1.2;
    const uphill: PlayerInput = { moveX: -0.366, moveZ: 0.931, sprint: false };
    updatePlayer(state, uphill, 1 / 60, worldHeight);
    expect(state.player.mode).toBe('climbing');
    expect(state.player.stamina).toBeLessThan(1);
    const stopped = { x: state.player.x, z: state.player.z };
    advance(state, 0.5, uphill, worldHeight);
    expect(state.player.x).toBe(stopped.x);
    expect(state.player.z).toBe(stopped.z);
    advance(state, 2, idle, worldHeight);
    expect(state.player.stamina).toBeGreaterThan(35);
    advance(state, 0.15, uphill, worldHeight);
    expect(Math.hypot(state.player.x - stopped.x, state.player.z - stopped.z)).toBeGreaterThan(0.4);
    expect(state.player.y).toBeCloseTo(worldHeight(state.player.x, state.player.z));
  });

  it('glides from the actual starting ridge to a safe landing in the valley', () => {
    const state = createGameState(worldHeight);
    // Traversal is isolated from combat, whose real-world integration is covered above.
    state.enemies.forEach((enemy) => {
      enemy.x = -175;
      enemy.z = 175;
    });
    jump(state);
    advance(state, 0.3, { moveX: 0, moveZ: 1, sprint: false }, worldHeight);
    jump(state);
    let airborneFrames = 0;
    while (state.player.mode !== 'grounded' && airborneFrames++ < 900) {
      updatePlayer(state, { moveX: 0, moveZ: 1, sprint: false }, 1 / 60, worldHeight);
    }
    expect(airborneFrames).toBeGreaterThan(90);
    expect(airborneFrames).toBeLessThan(900);
    expect(state.player.z).toBeLessThan(SPAWN.z - 20);
    expect(state.player.health).toBe(5);
    expect(state.player.stamina).toBeGreaterThan(0);
    expect(state.player.y).toBeCloseTo(worldHeight(state.player.x, state.player.z));
  });
});

describe('saved progress', () => {
  it('round-trips discoveries and enemy defeat while grounding the restored player', () => {
    const state = createGameState();
    state.player.x = 25;
    state.player.z = 30;
    state.player.y = 100;
    state.player.mode = 'gliding';
    state.beacons = ['windward', 'stillwater', 'sunspire'];
    state.collected = ['r1', 'r5'];
    state.enemies[0].hp = 0;
    state.kills = 1;
    state.apples = 4;
    const restored = restoreSave(serializeSave(state), () => 4)!;
    expect(restored).not.toBeNull();
    expect(restored.player.x).toBe(25);
    expect(restored.player.y).toBe(4);
    expect(restored.player.mode).toBe('grounded');
    expect(restored.won).toBe(true);
    expect(restored.enemies[0].hp).toBe(0);
    expect(restored.collected).toEqual(['r1', 'r5']);
  });

  it.each([null, '', '{broken', 'null', '[]', '{"version":2}', '{"version":1,"player":{}}'])(
    'rejects malformed save %s',
    (raw) => {
      expect(restoreSave(raw)).toBeNull();
    },
  );

  it('rejects out-of-world positions, forged IDs, duplicate discoveries, and invalid counts', () => {
    const saved = JSON.parse(serializeSave(createGameState()));
    for (const patch of [
      { player: { ...saved.player, x: 900 } },
      { beacons: ['windward', 'windward'] },
      { collected: ['invented-relic'] },
      { apples: -1 },
      { kills: 1 },
      { enemies: [saved.enemies[0], ...saved.enemies.slice(0, 4)] },
    ])
      expect(restoreSave(JSON.stringify({ ...saved, ...patch }))).toBeNull();
  });
});
