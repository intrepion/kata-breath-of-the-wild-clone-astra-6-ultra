import type { GameState } from './game-state';
import { BEACONS, RELICS, WORLD_LIMIT } from './layout';

const paths: Record<string, string> = {
  sound: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  map: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2V5Zm6-2v15m6-12v15"/>',
  bag: '<path d="M6 8h12l2 13H4L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2m-7 5h8m-4 0v4"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v15"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  wind: '<path d="M2 8h13a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M2 16h7"/>',
  apple:
    '<path d="M12 7c-8-6-12 5-7 12 2 3 4 2 7 1 3 1 5 2 7-1 5-7 1-18-7-12Z"/><path d="M12 7c-1-4 1-6 4-6m-4 5L9 3"/>',
  gem: '<path d="m12 2 7 7-2 10-5 3-5-3L5 9l7-7Zm0 0v20M5 9h14"/>',
  sword: '<path d="m7 17 13-13 1-3-3 1L5 15m-2-2 8 8m-6-4-4 4m3-1-2-2"/>',
  shrine: '<path d="m12 2 4 7-4 7-4-7 4-7ZM5 13l-2 8h18l-2-8M7 21l2-5m8 5-2-5"/>',
  feather: '<path d="M4 21 17 8M7 17C-2 6 13 1 21 2c1 8-5 21-14 15Zm4-10v6h6"/>',
  camera: '<path d="M8 5 6 8H2v13h20V8h-4l-2-3H8Z"/><circle cx="12" cy="14" r="4"/>',
  heart: '<path d="M12 21C-7 9 4-4 12 5c8-9 19 4 0 16Z"/>',
};
export function icon(name: string, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.gem}</svg>`;
}

export type Panel = 'map' | 'inventory' | 'guide' | 'settings' | 'pause' | 'victory' | 'reset';
export type UIAction = (action: string, value?: string) => void;
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

export class GameUI {
  panel: Panel | null = null;
  started = false;
  photo = false;
  sound = true;
  quality = 'high';
  private mapBase: HTMLCanvasElement;
  private lastFocus: HTMLElement | null = null;
  private lastHud = '';
  private toastTimer = 0;
  private getState: () => GameState;
  private onAction: UIAction;
  waypoint: { x: number; z: number; name: string } | null = null;

  constructor(
    getState: () => GameState,
    onAction: UIAction,
    heightAt: (x: number, z: number) => number,
    hasSave: boolean,
  ) {
    this.getState = getState;
    this.onAction = onAction;
    this.mapBase = this.makeMap(heightAt);
    $('#app').innerHTML = `
      <canvas id="world" tabindex="0" aria-label="Wildreach interactive 3D game world"></canvas>
      <div class="vignette"></div>
      <div class="hud" id="hud">
        <header class="topbar">
          <a class="wordmark" href="#" aria-label="Wildreach field guide" data-action="guide">
            <svg class="brand-mark" viewBox="0 0 52 56" fill="none" aria-hidden="true"><path d="m5 40 12-28 9 21 9-21 12 28M13 40h26M26 2l3 5-3 5-3-5Z" stroke="currentColor" stroke-width="1.6"/><path d="M4 46h44M15 51h22" stroke="currentColor" stroke-width=".7"/></svg>
            <span>WILDREACH<small>THE FIRST LIGHT</small></span>
          </a>
          <div class="compass" aria-label="Compass"><div class="compass-mark">◆</div><div id="compass-strip"><span>W</span><i>·</i><span>NW</span><i>·</i><b>N</b><i>·</i><span>NE</span><i>·</i><span>E</span></div><div class="compass-line"></div></div>
          <nav class="top-actions" aria-label="Game settings">
            <button class="icon-button" id="sound-button" data-action="sound" aria-label="Mute sound" title="Toggle sound">${icon('sound')}</button>
            <button class="icon-button" data-action="fullscreen" aria-label="Toggle fullscreen" title="Fullscreen">${icon('expand')}</button>
            <span class="nav-separator"></span>
            <button class="icon-button" data-action="settings" aria-label="Settings" title="Settings">${icon('settings')}</button>
          </nav>
        </header>
        <section class="vitals" aria-label="Player health and stamina">
          <div id="hearts" class="hearts"></div>
          <div class="stamina-row"><span class="stamina-label">STAMINA</span><div class="stamina-track"><div id="stamina-fill"></div></div></div>
          <div id="movement-mode" class="movement-mode"></div>
        </section>
        <section class="quest" aria-label="Current quest">
          <div class="quest-eyebrow"><span class="diamond-outline"></span> MAIN QUEST</div>
          <h2>The First Light</h2>
          <p id="quest-description">Awaken the three ancient shrines.</p>
          <div class="quest-progress" id="quest-progress"></div>
          <button class="quest-target" data-action="map"><span id="target-label">Windward Shrine</span><span id="target-distance"></span>${icon('arrow')}</button>
        </section>
        <nav class="side-actions" aria-label="Adventure menus">
          <button class="tool-button" data-action="map" aria-label="Open map" title="Map (M)">${icon('map')}<kbd>M</kbd></button>
          <button class="tool-button" data-action="inventory" aria-label="Open satchel" title="Satchel (I)">${icon('bag')}<kbd>I</kbd></button>
          <button class="tool-button" data-action="guide" aria-label="Open field guide" title="Field guide (H)">${icon('book')}<kbd>H</kbd></button>
          <button class="tool-button" data-action="photo" aria-label="Photo mode" title="Photo mode (P)">${icon('camera')}<kbd>P</kbd></button>
        </nav>
        <section class="intro" id="intro">
          <div class="chapter"><span></span> CHAPTER I <i> / </i> A WORLD AWAKENS</div>
          <h1>The Verdant<br/><em>Reach</em><span class="title-star">✧</span></h1>
          <p>The wind is calling.<br/>Your journey begins beyond the horizon.</p>
          <button class="begin-button" data-action="start" id="begin-button">${hasSave ? 'Continue your journey' : 'Begin the journey'} ${icon('arrow')}</button>
          <div class="intro-note"><span class="tiny-dot"></span> A little courage. A boundless world.</div>
        </section>
        <section class="journey-info" id="journey-info" hidden>
          <span class="region-eyebrow">EXPLORING</span><h2 id="region-name">The Verdant Reach</h2>
          <div class="pocket-items"><span>${icon('gem')}<b id="relic-count">0</b><small>SPIRIT SHARDS</small></span><button data-action="eat" title="Eat apple (F)">${icon('apple')}<b id="apple-count">3</b><kbd>F</kbd></button></div>
          <span class="save-indicator" id="save-indicator">Progress saved on this device</span>
        </section>
        <div class="interaction-prompt" id="interaction-prompt" hidden><kbd>E</kbd><span></span></div>
        <div class="controls" aria-label="Keyboard controls"><span><kbd>W A S D</kbd> Move</span><span><kbd>DRAG</kbd> Look</span><span><kbd>SPACE</kbd> Jump / Glide</span><span><kbd>SHIFT</kbd> Sprint</span><span><kbd>J</kbd> Attack</span></div>
        <aside class="minimap-area"><button class="minimap-button" data-action="map" aria-label="Open world map"><span class="map-north">N</span><canvas id="minimap" width="360" height="360"></canvas><span class="map-center-ring"></span><span class="map-expand">${icon('expand')}</span></button><div class="weather-line">${icon('sun')}<span id="world-time">08:40 AM</span><i></i><span>18°</span>${icon('wind')}</div><div class="area-coordinates" id="coordinates">THE VERDANT REACH</div></aside>
      </div>
      <div id="photo-exit" hidden><button data-action="photo">${icon('camera')} <kbd>P</kbd> Exit photo mode</button></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <div class="damage-flash" id="damage-flash"></div>
      <div class="modal-backdrop" id="modal" hidden><section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="panel-title"><button class="modal-close icon-button" data-action="close" aria-label="Close menu">${icon('close')}</button><div id="panel-content"></div></section></div>
      <div class="touch-controls" id="touch-controls"><div class="joystick" id="joystick" aria-label="Movement joystick"><div id="joystick-knob"></div></div><div class="touch-buttons"><button data-touch="sprint" aria-label="Sprint">⇧</button><button data-action="interact" aria-label="Interact">E</button><button data-action="attack" aria-label="Attack">${icon('sword')}</button><button data-action="jump" aria-label="Jump or glide">↑</button></div></div>
      <div id="loading" class="loading"><div class="loading-symbol">✧</div><span>A world is waking…</span></div>`;
    document.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!button) return;
      event.preventDefault();
      this.onAction(button.dataset.action!, button.dataset.value);
    });
    $('#modal').addEventListener('click', (event) => {
      if (event.target === $('#modal')) this.onAction('close');
    });
    document.addEventListener('keydown', (event) => {
      if (event.code !== 'Tab' || !this.panel) return;
      const nodes = Array.from(
        $('#modal').querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]'),
      ).filter((el) => !el.hasAttribute('disabled'));
      const current = nodes.indexOf(document.activeElement as HTMLElement);
      if ((event.shiftKey && current <= 0) || (!event.shiftKey && current === nodes.length - 1)) {
        event.preventDefault();
        nodes[event.shiftKey ? nodes.length - 1 : 0]?.focus();
      }
    });
    this.update(getState(), 0);
  }

  ready(): void {
    $('#loading').classList.add('loaded');
    setTimeout(() => $('#loading').remove(), 700);
  }
  begin(): void {
    this.started = true;
    $('#intro').classList.add('departed');
    $('#intro').inert = true;
    $('#intro').setAttribute('aria-hidden', 'true');
    $('#journey-info').hidden = false;
    document.body.classList.add('playing');
    $('#world').focus({ preventScroll: true });
  }
  togglePhoto(): void {
    this.photo = !this.photo;
    $('#hud').hidden = this.photo;
    $('#photo-exit').hidden = !this.photo;
    $('#touch-controls').classList.toggle('photo-hidden', this.photo);
  }
  setSound(sound: boolean): void {
    this.sound = sound;
    $('#sound-button').innerHTML = icon(sound ? 'sound' : 'muted');
    $('#sound-button').setAttribute('aria-label', sound ? 'Mute sound' : 'Enable sound');
  }
  saved(ok: boolean): void {
    $('#save-indicator').textContent = ok
      ? 'Progress saved on this device'
      : 'Saving unavailable in this browser';
  }
  notify(message: string, type = 'info'): void {
    const toast = $('#toast');
    clearTimeout(this.toastTimer);
    toast.textContent = message;
    toast.className = `toast visible ${type}`;
    this.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3800);
    if (type === 'damage') {
      $('#damage-flash').classList.remove('flash');
      requestAnimationFrame(() => $('#damage-flash').classList.add('flash'));
    }
  }
  interaction(label: string | null): void {
    const prompt = $('#interaction-prompt');
    prompt.hidden = !label || !this.started || !!this.panel;
    prompt.querySelector('span')!.textContent = label || '';
  }
  update(state: GameState, yaw: number): void {
    const signature = `${state.player.health}:${state.beacons.join(',')}:${state.collected.length}:${state.apples}`;
    if (signature !== this.lastHud) {
      this.lastHud = signature;
      $('#hearts').innerHTML = Array.from({ length: 5 }, (_, i) =>
        icon('heart', i < state.player.health ? 'heart filled' : 'heart empty'),
      ).join('');
      $('#hearts').setAttribute('aria-label', `${state.player.health} of 5 hearts`);
      $('#quest-progress').innerHTML =
        BEACONS.map(
          (b) => `<span class="${state.beacons.includes(b.id) ? 'complete' : ''}">◆</span>`,
        ).join('<i></i>') + `<small>${state.beacons.length} / 3</small>`;
      $('#quest-description').textContent = state.won
        ? 'Light has returned to the valley.'
        : 'Awaken the three ancient shrines.';
      $('#relic-count').textContent = String(state.collected.length);
      $('#apple-count').textContent = String(state.apples);
    }
    const stamina = $('#stamina-fill');
    stamina.style.width = `${state.player.stamina}%`;
    stamina.classList.toggle('low', state.player.stamina < 25);
    $('#movement-mode').textContent =
      state.player.mode === 'gliding'
        ? '↟  RIDING THE WIND'
        : state.player.mode === 'climbing'
          ? '↟  CLIMBING'
          : '';
    const target =
      this.waypoint || BEACONS.find((b) => !state.beacons.includes(b.id)) || BEACONS[0];
    $('#target-label').textContent = target.name;
    $('#target-distance').textContent =
      `${Math.round(Math.hypot(target.x - state.player.x, target.z - state.player.z))} m`;
    const region =
      state.player.z < -45
        ? state.player.x < -35
          ? 'Stillwater Grove'
          : state.player.x > 30
            ? 'The Amber Highlands'
            : 'The Old Kingdom'
        : 'The Verdant Reach';
    $('#region-name').textContent = region;
    $('#coordinates').textContent = region.toUpperCase();
    const minutes = 520 + Math.floor(state.time / 2);
    const hour = Math.floor(minutes / 60) % 24;
    $('#world-time').textContent =
      `${String(hour % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = ((Math.round(-yaw / (Math.PI / 4)) % 8) + 8) % 8;
    $('#compass-strip').innerHTML = [index - 2, index - 1, index, index + 1, index + 2]
      .map(
        (v, i) =>
          `${i ? '<i>·</i>' : ''}<${i === 2 ? 'b' : 'span'}>${labels[(v + 8) % 8]}</${i === 2 ? 'b' : 'span'}>`,
      )
      .join('');
    this.drawMap($('#minimap'), state, true, yaw);
    if (this.panel === 'map') this.drawMap($('#world-map'), state, false, yaw);
  }

  showPanel(panel: Panel | null): void {
    const previousPanel = this.panel;
    this.panel = panel;
    const modal = $('#modal');
    modal.hidden = !panel;
    $('#hud').inert = !!panel;
    $('#touch-controls').inert = !!panel;
    $('#world').inert = !!panel;
    if (!panel) {
      this.lastFocus?.focus();
      return;
    }
    if (!previousPanel) this.lastFocus = document.activeElement as HTMLElement;
    const state = this.getState();
    const header = (eyebrow: string, title: string, desc: string) =>
      `<div class="panel-eyebrow">${eyebrow}</div><h2 id="panel-title">${title}</h2><p class="panel-description">${desc}</p>`;
    let content = '';
    switch (panel) {
      case 'map':
        content =
          header(
            'A WORLD WITHOUT BOUNDARIES',
            'The Verdant Reach',
            'Choose a shrine or touch the map to place a waypoint. Follow your own path.',
          ) +
          `<div class="map-layout"><div class="world-map-wrap"><canvas id="world-map" width="700" height="700" aria-label="World map. Click to place a waypoint."></canvas><span class="world-map-n">N<br/>↑</span><span class="map-scale">━━━━ 100 m</span></div><div class="map-legend"><h3>THE ANCIENT SHRINES</h3>${BEACONS.map((b, i) => `<button class="map-location ${state.beacons.includes(b.id) ? 'awakened' : ''}" data-action="waypoint" data-value="${b.id}">${icon('shrine')}<span><small>0${i + 1} · ${state.beacons.includes(b.id) ? 'AWAKENED' : 'UNDISCOVERED'}</small><b>${b.name}</b><em>${b.region}</em></span></button>`).join('')}<div class="legend-note"><span class="legend-player">▲</span> Your location<br/><span class="legend-shard">◆</span> Spirit shard<br/><span class="legend-shrine">◇</span> Ancient shrine</div><button class="text-button" data-action="clear-waypoint">Clear waypoint</button></div></div>`;
        break;
      case 'inventory':
        content =
          header(
            'TAKE ONLY WHAT YOU NEED',
            'Your satchel',
            'A few simple things. A thousand possible adventures.',
          ) +
          `<div class="inventory-grid"><article class="item-card"><div class="item-art apple-art">${icon('apple')}</div><span class="item-category">PROVISIONS · ×${state.apples}</span><h3>Wild apple</h3><p>Sweet, crisp, and picked from the valley. Restores two hearts.</p><button class="panel-button" data-action="eat" ${state.apples === 0 || state.player.health >= 5 ? 'disabled' : ''}>${state.player.health >= 5 ? 'Health is full' : state.apples === 0 ? 'No apples remaining' : 'Eat apple'} <kbd>F</kbd></button></article><article class="item-card"><div class="item-art">${icon('sword')}</div><span class="item-category">EQUIPMENT · EQUIPPED</span><h3>Wanderer’s blade</h3><p>A dependable sword. Three well-timed strikes scatter a stone sentinel.</p><div class="item-stat">ATTACK <b>1</b> <span> / </span> REACH <b>4 m</b></div></article><article class="item-card"><div class="item-art glider-art">${icon('feather')}</div><span class="item-category">EQUIPMENT · EQUIPPED</span><h3>Windwoven glider</h3><p>Leap from a high place. Press Space again to let the wind carry you.</p><div class="item-stat">POWERED BY <b>STAMINA</b></div></article></div><div class="inventory-summary">${icon('gem')}<strong>${state.collected.length} / ${RELICS.length}</strong> spirit shards discovered <span>✧</span> ${state.kills} sentinels defeated</div>`;
        break;
      case 'guide':
        content =
          header(
            'THE WANDERER’S FIELD GUIDE',
            'Follow your curiosity.',
            'Long ago, three lights watched over this valley. Find their shrines and wake them once more.',
          ) +
          `<div class="guide-grid"><div><h3>FIND YOUR WAY</h3><p>Golden columns mark the ancient shrines. Walk close and press <kbd>E</kbd> to awaken them. Light all three to complete your journey.</p><p>Seek glowing green spirit shards along the trail. Stone sentinels guard the wilds; a defeated sentinel leaves an apple.</p><h3>TRUST THE WIND</h3><p>Sprint, climb steep hills, and glide using stamina. Rest on solid ground to recover. If you fall or lose every heart, you’ll return to your last awakened shrine (or the starting ridge), with your discoveries intact.</p><p class="guide-tip">Try it: follow the path down from the ridge, jump, then press Space again to sail toward Windward Shrine.</p></div><div class="key-list">${[
            ['W A S D / ↑↓←→', 'Move'],
            ['DRAG / Q R', 'Look around'],
            ['SHIFT', 'Sprint'],
            ['SPACE', 'Jump / toggle glider'],
            ['J / CLICK', 'Sword attack'],
            ['E', 'Gather / awaken shrine'],
            ['F', 'Eat an apple'],
            ['M / I', 'Map / satchel'],
            ['P', 'Photo mode'],
            ['ESC', 'Pause / close menu'],
          ]
            .map(([key, label]) => `<div><kbd>${key}</kbd><span>${label}</span></div>`)
            .join(
              '',
            )}</div></div><div class="guide-footer">Touch: use the left stick to move, drag the world to look, and use the action buttons. Progress saves automatically on this device.</div>`;
        break;
      case 'settings':
        content =
          header(
            'MAKE YOURSELF AT HOME',
            'A moment of quiet.',
            'Tune the adventure to your liking.',
          ) +
          `<div class="settings-list"><div><span><b>Sounds of the wild</b><small>Ambient tones and adventure sounds</small></span><button class="toggle ${this.sound ? 'on' : ''}" role="switch" aria-label="Sounds of the wild" aria-checked="${this.sound}" data-action="sound"><span></span></button></div><div><span><b>Visual quality</b><small>Lower resolution improves performance</small></span><select id="quality-select" aria-label="Visual quality"><option value="high" ${this.quality === 'high' ? 'selected' : ''}>High</option><option value="low" ${this.quality === 'low' ? 'selected' : ''}>Performance</option></select></div><div><span><b>A fresh beginning</b><small>Start again and clear saved discoveries</small></span><button class="text-button" data-action="reset">New journey</button></div></div><p class="settings-footnote">An original, handcrafted browser adventure inspired by the joy of getting lost.</p>`;
        break;
      case 'pause':
        content =
          header(
            'THE WORLD CAN WAIT',
            'Take a breath.',
            'Your adventure is right where you left it.',
          ) +
          `<div class="pause-actions"><button class="panel-button primary" data-action="close">Return to the wild ${icon('arrow')}</button><button class="panel-button" data-action="map">Unfold your map ${icon('map')}</button><button class="panel-button" data-action="guide">Read the field guide ${icon('book')}</button><button class="text-button" data-action="settings">Settings</button></div>`;
        break;
      case 'victory':
        content =
          `<div class="victory-symbol">✧</div>` +
          header(
            'THREE LIGHTS. ONE NEW BEGINNING.',
            'The valley remembers.',
            'The ancient shrines shine again. Wherever the wind carries you next, this place will remember your footsteps.',
          ) +
          `<div class="victory-stats"><span><strong>3 / 3</strong>SHRINES AWAKENED</span><span><strong>${state.collected.length} / ${RELICS.length}</strong>SHARDS DISCOVERED</span><span><strong>${state.kills}</strong>SENTINELS DEFEATED</span></div><button class="panel-button primary" data-action="close">There’s more to discover ${icon('arrow')}</button>`;
        break;
      case 'reset':
        content =
          header(
            'A FRESH BEGINNING',
            'Start a new journey?',
            'This will replace your saved shrine progress, collected shards, and supplies on this device.',
          ) +
          `<div class="pause-actions"><button class="panel-button" data-action="close">Keep exploring</button><button class="panel-button danger" data-action="confirm-reset">Start a new journey</button></div>`;
        break;
    }
    $('#panel-content').innerHTML = content;
    $('.modal-panel').className = `modal-panel panel-${panel}`;
    $('.modal-close').focus();
    if (panel === 'map') {
      this.drawMap($('#world-map'), state, false, 0);
      $('#world-map').addEventListener('click', (event) => {
        const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
        this.waypoint = {
          x: (((event.clientX - rect.left) / rect.width) * 2 - 1) * WORLD_LIMIT,
          z: (((event.clientY - rect.top) / rect.height) * 2 - 1) * WORLD_LIMIT,
          name: 'Your waypoint',
        };
        this.notify('Waypoint placed. Your next adventure awaits.');
        this.drawMap($('#world-map'), this.getState(), false, 0);
      });
    }
    if (panel === 'settings')
      $('#quality-select').addEventListener('change', (event) =>
        this.onAction('quality', (event.target as HTMLSelectElement).value),
      );
  }

  private makeMap(heightAt: (x: number, z: number) => number): HTMLCanvasElement {
    const map = document.createElement('canvas');
    map.width = map.height = 512;
    const context = map.getContext('2d')!;
    const data = context.createImageData(512, 512);
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const wx = ((x / 512) * 2 - 1) * WORLD_LIMIT;
        const wz = ((y / 512) * 2 - 1) * WORLD_LIMIT;
        const h = heightAt(wx, wz);
        const contour = Math.abs(h % 5) < 0.38;
        const shade = Math.min(32, Math.max(-20, h * 0.8));
        const noise = Math.sin(x * 9.21 + y * 3.2) * 4;
        const idx = (y * 512 + x) * 4;
        data.data[idx] = 51 + shade + noise - (contour ? 10 : 0);
        data.data[idx + 1] = 78 + shade + noise - (contour ? 10 : 0);
        data.data[idx + 2] = 57 + shade * 0.5 + noise - (contour ? 5 : 0);
        data.data[idx + 3] = 255;
        if (Math.hypot((wx + 132) / 39.5, (wz + 9) / 58.5) < 1 && h < 2.8) {
          data.data[idx] = 68 + noise;
          data.data[idx + 1] = 111 + noise;
          data.data[idx + 2] = 106 + noise;
        }
      }
    context.putImageData(data, 0, 0);
    const pos = (v: number) => (v / WORLD_LIMIT + 1) * 256;
    context.strokeStyle = '#bdb68b66';
    context.lineWidth = 2;
    context.setLineDash([3, 3]);
    context.beginPath();
    context.moveTo(pos(0), pos(68));
    context.bezierCurveTo(pos(12), pos(42), pos(-24), pos(25), pos(-24), pos(8));
    context.bezierCurveTo(pos(-45), pos(-15), pos(-68), pos(-38), pos(-83), pos(-62));
    context.stroke();
    context.beginPath();
    context.moveTo(pos(-24), pos(8));
    context.bezierCurveTo(pos(5), pos(-22), pos(58), pos(-25), pos(78), pos(-98));
    context.stroke();
    context.setLineDash([]);
    return map;
  }

  private drawMap(canvas: HTMLCanvasElement, state: GameState, mini: boolean, yaw: number): void {
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    if (mini) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    const range = mini ? 160 : WORLD_LIMIT * 2;
    const scale = size / range;
    const centerX = mini ? state.player.x : 0;
    const centerZ = mini ? state.player.z : 0;
    const x = (v: number) => (v - centerX) * scale + size / 2;
    const z = (v: number) => (v - centerZ) * scale + size / 2;
    ctx.fillStyle = '#334a38';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(
      this.mapBase,
      x(-WORLD_LIMIT),
      z(-WORLD_LIMIT),
      WORLD_LIMIT * 2 * scale,
      WORLD_LIMIT * 2 * scale,
    );
    if (!mini) {
      ctx.strokeStyle = '#e0dcb516';
      ctx.lineWidth = 1;
      for (let grid = -150; grid <= 150; grid += 50) {
        ctx.beginPath();
        ctx.moveTo(x(grid), 0);
        ctx.lineTo(x(grid), size);
        ctx.moveTo(0, z(grid));
        ctx.lineTo(size, z(grid));
        ctx.stroke();
      }
      ctx.fillStyle = '#e3d4a057';
      ctx.textAlign = 'center';
      ctx.font = 'italic 19px Georgia';
      ctx.fillText('Stillwater Grove', x(-100), z(-105));
      ctx.fillText('The Amber Highlands', x(80), z(-130));
      ctx.fillText('The Verdant Reach', x(5), z(125));
    }
    for (const relic of RELICS) {
      if (state.collected.includes(relic.id)) continue;
      ctx.fillStyle = '#a4dfb2';
      ctx.save();
      ctx.translate(x(relic.x), z(relic.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
      ctx.restore();
    }
    for (const beacon of BEACONS) {
      const active = state.beacons.includes(beacon.id);
      ctx.save();
      ctx.translate(x(beacon.x), z(beacon.z));
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = active ? '#89e6d8' : '#ffcb77';
      ctx.shadowBlur = 12;
      ctx.fillStyle = active ? '#89e6d8' : '#f0ce87';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeStyle = '#f4e4bc77';
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.restore();
    }
    if (this.waypoint) {
      ctx.strokeStyle = '#fff0ba';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x(this.waypoint.x), z(this.waypoint.z), 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x(this.waypoint.x) - 15, z(this.waypoint.z));
      ctx.lineTo(x(this.waypoint.x) + 15, z(this.waypoint.z));
      ctx.moveTo(x(this.waypoint.x), z(this.waypoint.z) - 15);
      ctx.lineTo(x(this.waypoint.x), z(this.waypoint.z) + 15);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x(state.player.x), z(state.player.z));
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, mini ? 47 : 26, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    ctx.fillStyle = '#f5e9b319';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(x(state.player.x), z(state.player.z));
    ctx.rotate(-state.player.heading + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#fff1bd';
    ctx.strokeStyle = '#263a2b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}
