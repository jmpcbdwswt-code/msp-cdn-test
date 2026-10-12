// The original Black Ops III Zombies HUD, drawn with the game's own images (.tools/build-hud.mjs). Cheese Cube uses
// the usermap HUD: T7Hud_ZM's portrait, score and chalk round counter, The Giant's Der Riese ammo counter and
// power-up notice, and perk icons that the map's scripts draw (wardog_perk_hud: x = 64 + 30 per perk, y = -22,
// 25 x 25, bottom-left, in 640 x 480 hud units). Other positions were measured from native 1080p gameplay
// (Workshop 1168113418) and are kept in LUI units: 1280 x 720, scaled with the screen height.
const unit = n => `calc(var(--u) * ${n})`;
const hudUnit = n => `calc(var(--h) * ${n})`;
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; parent?.append(e); return e; };

// Registered by the map's perk scripts (wardog_perk_hud::function_f1eb222b).
export const PERK_ICONS = {
  specialty_armorvest: 'specialty_giant_juggernaut_zombies', specialty_quickrevive: 'i_t6_quick_shader',
  specialty_fastreload: 'specialty_giant_fastreload_zombies', specialty_doubletap2: 'specialty_giant_doubletap_zombies',
  specialty_staminup: 'specialty_giant_marathon_zombies', specialty_phdflopper: 'specialty_giant_divetonuke_zombies',
  specialty_deadshot: 'specialty_giant_ads_zombies', specialty_additionalprimaryweapon: 'specialty_giant_three_guns_zombies',
  specialty_gpsjammer: 'i_t6_phd_shader',
};
const POWERUPS = {
  maxAmmo: {text: 'Max Ammo!'}, nuke: {text: 'Kaboom!'},
  doublePoints: {text: 'Double Points!', icon: 'specialty_giant_2x_zombies'}, instaKill: {text: 'Insta-Kill!', icon: 'specialty_giant_killjoy_zombies'},
};
const TALLY = [[0, 'uie_t7_zm_hud_rnd_mrk1'], [17, 'uie_t7_zm_hud_rnd_mrk2'], [33, 'uie_t7_zm_hud_rnd_mrk3'], [49, 'uie_t7_zm_hud_rnd_mrk4']];
const PLAYER_COLORS = ['#ffffff', '#5aa9ff', '#ffd23f', '#5fd068'];

export class NativeHud {
  static async load(root, base) {
    const response = await fetch(`${base}/hud/hud.json`);
    if (!response.ok) throw new Error(`${base}/hud/hud.json: HTTP ${response.status}`);
    return new NativeHud(root, base, await response.json());
  }

  constructor(root, base, manifest) {
    Object.assign(this, {root, base, images: manifest.images});
    this.time = 0; this.notices = [];
    root.classList.add('native-hud');
    this.build();
  }
  url(name) { if (!this.images[name]) throw new Error(`HUD image ${name} was not built`); return `${this.base}/hud/${this.images[name].file}`; }

  /** An image scaled so its visible pixels fill w x h (LUI units); glow outside them is kept. */
  glyph(name, w, h, parent, cls = 'glyph') {
    const box = el('div', cls, parent), img = el('img', '', box);
    this.setGlyph(box, name, w, h); img.alt = ''; img.draggable = false;
    return box;
  }
  setGlyph(box, name, w, h) {
    const info = this.images[name], [x0, y0, x1, y1] = info.bounds ?? [0, 0, info.width, info.height];
    const sx = w / (x1 - x0), sy = h / (y1 - y0), img = box.firstChild;
    if (box.dataset.name !== name) { img.src = this.url(name); box.dataset.name = name; }
    Object.assign(box.style, {width: unit(w), height: unit(h)});
    Object.assign(img.style, {width: unit(info.width * sx), height: unit(info.height * sy), left: unit(-x0 * sx), top: unit(-y0 * sy)});
  }

  build() {
    const r = this.root;
    // Damage: the zombies blood filter and the direction of each hit.
    this.blood = el('div', 'hud-blood', r); this.blood.style.backgroundImage = `url(${this.url('i_generic_filter_zombie_blood_c')})`;
    this.hits = el('div', 'hud-hits', r);
    // Crosshair: four ticks that open with movement and firing.
    this.crosshair = el('div', 'hud-crosshair', r);
    this.ticks = ['top', 'bottom', 'left', 'right'].map(side => el('i', side, this.crosshair));

    // Bottom left: teammates, then the local portrait and score; the round counter; perk icons.
    this.scores = el('div', 'hud-scores', r);
    this.roundEl = el('div', 'hud-round', r);
    this.spark = el('div', 'hud-round-spark', this.roundEl); this.spark.style.backgroundImage = `url(${this.url('uie_t7_zm_hud_rnd_spkseq1')})`;
    this.flash = el('img', 'hud-round-flash', this.roundEl); this.flash.src = this.url('uie_t7_zm_hud_rnd_flsh1');
    this.roundMarks = el('div', 'hud-round-marks', this.roundEl);
    this.perks = el('div', 'hud-perks', r);
    this.popupLayer = el('div', 'hud-popups', r);

    // Bottom right: the Der Riese ammo counter.
    const ammo = this.ammo = el('div', 'hud-ammo', r);
    this.projection = el('img', 'hud-ammo-projection', ammo); this.projection.src = this.url('uie_t7_zm_derriese_hud_ammo_projection_lrg');
    this.glyph('uie_t7_zm_derriese_hud_ammo_dpadbase', 123, 140, ammo, 'glyph hud-ammo-device');
    this.clip = el('div', 'hud-ammo-clip', ammo);
    this.reserve = el('div', 'hud-ammo-reserve', ammo);
    this.lethals = el('div', 'hud-ammo-lethals', ammo);
    this.weaponName = el('div', 'hud-ammo-name', ammo);

    // Middle: active power-ups, hold-to-use prompt and progress, pickup notices.
    this.buffs = el('div', 'hud-buffs', r);
    this.prompt = el('div', 'hud-prompt', r); this.prompt.id = 'hint';
    this.progress = el('div', 'hud-progress', r);
    el('img', 'back', this.progress).src = this.url('uie_t7_zm_hud_progressbar_back');
    this.progressFill = el('div', 'fill', this.progress);
    el('img', '', this.progressFill).src = this.url('uie_t7_zm_hud_progressbar_fill');
    this.noticeLayer = el('div', 'hud-notices', r);
    this.waypoints = el('div', 'hud-waypoints', r);
  }

  // ---- Score ----
  setScores(players) {
    const key = JSON.stringify(players);
    if (key === this.scoreKey) return;
    this.scoreKey = key;
    this.scores.replaceChildren(...players.map((p, i) => {
      const local = i === players.length - 1, row = el('div', `hud-score${local ? ' local' : ''}${p.down ? ' down' : ''}${p.dead ? ' dead' : ''}`);
      row.style.bottom = local ? unit(124) : unit(176 + (players.length - 2 - i) * 38);
      const portrait = el('img', 'portrait', row); portrait.src = this.url('i_pbt_zm_cia'); portrait.alt = '';
      const streak = el('img', 'streak', row); streak.src = this.url('scorebar_zom_5'); streak.alt = '';
      const points = el('span', 'points', row); points.textContent = p.points;
      if (!local || players.length > 1) points.style.color = PLAYER_COLORS[p.slot % PLAYER_COLORS.length];
      if (local) this.localScore = row;
      return row;
    }));
  }
  /** "+50" popups drift up and right from the score, orange for points earned and red for points spent. */
  points(amount) {
    if (!amount || !this.localScore) return;
    const pop = el('div', `hud-popup${amount < 0 ? ' spend' : ''}`, this.popupLayer);
    pop.textContent = (amount > 0 ? '+' : '') + amount;
    // Each popup takes its own path, so several in a row fan out instead of stacking.
    const spread = Math.random() - .5;
    pop.style.marginTop = unit(spread * 18);
    pop.style.setProperty('--dx', unit(80 + Math.random() * 50)); pop.style.setProperty('--dy', unit(-30 - Math.random() * 45 + spread * 20));
    pop.addEventListener('animationend', () => pop.remove(), {once: true});
  }

  // ---- Round counter ----
  setRound(round, phase, time) {
    if (round !== this.shownRound) {
      const fresh = round > (this.shownRound ?? 0) && round > 0;
      this.shownRound = round; this.renderRound(round);
      if (fresh) { this.roundEl.classList.remove('changing'); void this.roundEl.offsetWidth; this.roundEl.classList.add('changing'); this.changeAt = time; }
    }
    // Between rounds the counter pulses, as T7Hud_ZM does while the round-end music plays.
    this.roundEl.classList.toggle('ending', phase === 'break' && round > 0);
    if (this.roundEl.classList.contains('changing') && time - this.changeAt > 3.2) this.roundEl.classList.remove('changing');
    const frame = Math.min(29, Math.floor((time - (this.changeAt ?? -9)) * 24));
    this.spark.style.backgroundPosition = `${(frame % 10) * 100 / 9}% ${Math.floor(frame / 10) * 50}%`;
  }
  renderRound(round) {
    this.roundMarks.replaceChildren();
    this.roundMarks.className = `hud-round-marks ${round > 5 ? 'numeral' : 'tally'}`;
    if (!round) return;
    // variants: the resting chalk-red image and the lit ones shown while a new round burns in.
    const stack = (variants, w, h, left, bottom) => {
      const g = el('div', 'stack', this.roundMarks); Object.assign(g.style, {left: unit(left), bottom: unit(bottom), width: unit(w), height: unit(h)});
      for (const [variant, image] of Object.entries(variants)) if (this.images[image]) this.glyph(image, w, h, g, `glyph ${variant}`);
      return g;
    };
    if (round <= 5) {
      // Strokes keep their relative sizes: 0.58 LUI units per texel. Tallies have a lit ("act") stroke only.
      const strokes = TALLY.slice(0, Math.min(round, 4)).map(([left, name]) => [left, 0, name]);
      if (round === 5) strokes.push([-6, 4, 'uie_t7_zm_hud_rnd_mrk5']);
      for (const [left, bottom, name] of strokes) {
        const [x0, y0, x1, y1] = this.images[name + 'def'].bounds;
        stack({def: name + 'def', act: name + 'act', glow: name + 'act'}, (x1 - x0) * .58, (y1 - y0) * .58, left, bottom);
      }
      this.roundMarks.lastChild?.classList.add('newest');
      return;
    }
    // Numerals sit right-aligned where the tallies end, 58 units tall.
    const text = String(round), width = 29, step = 25;
    [...text].forEach((d, i) => {
      const name = `uie_t7_zm_hud_rnd_nmbr${d}`;
      stack({def: name, act: name + '_act', glow: name + '_glow'}, width, 58, 76 - width - (text.length - 1 - i) * step, 0).classList.add('newest');
    });
  }

  // ---- Perks (script-drawn) ----
  setPerks(perks) {
    const key = perks.join();
    if (key === this.perkKey) return;
    this.perkKey = key;
    this.perks.replaceChildren(...perks.filter(p => PERK_ICONS[p]).map((p, i) => {
      const icon = el('img', 'hud-perk'); icon.src = this.url(PERK_ICONS[p]); icon.alt = ''; icon.dataset.perk = p;
      Object.assign(icon.style, {left: hudUnit(64 + i * 30), bottom: hudUnit(22), width: hudUnit(25), height: hudUnit(25)});
      return icon;
    }));
  }

  // ---- Ammo ----
  digits(container, value, height, advance) {
    const text = String(value);
    if (container.dataset.value === text && container.dataset.height === String(height)) return;
    container.dataset.value = text; container.dataset.height = String(height);
    container.replaceChildren(...[...text].map((d, i) => {
      const g = this.glyph(`uie_t7_zm_derriese_hud_ammo_noglow_number${d}`, height * .48, height, null);
      g.style.left = unit(i * advance); return g;
    }));
    container.style.width = unit(text.length * advance);
  }
  setWeapon(weapon, grenades) {
    this.ammo.hidden = !weapon;
    if (!weapon) return;
    this.digits(this.clip, weapon.clip, 38.7, 16);
    this.digits(this.reserve, weapon.reserve, 27.3, 11);
    this.clip.classList.toggle('empty', weapon.clip === 0);
    if (this.weaponName.textContent !== weapon.name) this.weaponName.textContent = weapon.name;
    if (this.lethals.childElementCount !== grenades) this.lethals.replaceChildren(...Array.from({length: Math.max(0, grenades)}, (_, i) => {
      const icon = el('i', 'hud-lethal'); icon.style.webkitMaskImage = icon.style.maskImage = `url(${this.url('uie_t7_zm_hud_inv_icnlthl')})`;
      icon.style.right = unit((grenades - 1 - i) * 4.6); icon.style.zIndex = String(grenades - i); return icon;
    }));
  }

  // ---- Power-ups ----
  powerup(kind) {
    const info = POWERUPS[kind]; if (!info) return;
    for (const n of this.notices) n.remove();
    const notice = el('div', 'hud-notice', this.noticeLayer);
    el('i', 'shade', notice);
    for (const [cls, name] of [['design', 'uie_t7_zm_hud_notif_backdesign_factory'], ['device', 'uie_t7_zm_hud_notif_factory'], ['streak', 'uie_t7_zm_hud_notif_txtstreak']]) {
      const i = el('img', cls, notice); i.src = this.url(name); i.alt = '';
    }
    el('i', 'bar', notice);
    el('span', 'text', notice).textContent = info.text;
    notice.addEventListener('animationend', e => { if (e.target === notice) notice.remove(); });
    this.notices = [notice];
  }
  setBuffs(buffs) {
    const active = Object.entries(buffs).filter(([k, v]) => v > 0 && POWERUPS[k]?.icon);
    const key = active.map(([k]) => k).join();
    if (key !== this.buffKey) {
      this.buffKey = key;
      this.buffs.replaceChildren(...active.map(([k]) => { const i = el('img', 'hud-buff'); i.src = this.url(POWERUPS[k].icon); i.dataset.kind = k; i.alt = ''; return i; }));
    }
    // Icons blink in their last seconds, faster at the very end.
    for (const icon of this.buffs.children) {
      const left = buffs[icon.dataset.kind];
      icon.style.opacity = left > 5 ? 1 : Math.sin(this.time * (left > 2 ? 9 : 18)) > 0 ? 1 : .15;
    }
  }

  // ---- Damage ----
  /** `angle`: where the hit came from, relative to the view (0 = ahead, positive = right). */
  hurt(angle = null) {
    if (angle === null || !Number.isFinite(angle)) return;
    const mark = el('img', 'hud-hit', this.hits); mark.src = this.url('hit_direction_zm'); mark.alt = '';
    mark.style.setProperty('--angle', `${angle}rad`);
    mark.addEventListener('animationend', () => mark.remove(), {once: true});
  }

  // ---- Every frame ----
  update(s, dt) {
    this.time += dt;
    this.root.classList.toggle('hidden', !s.visible);
    this.setScores(s.scores);
    this.setRound(s.round, s.phase, this.time);
    this.setPerks(s.perks);
    this.setWeapon(s.weapon, s.grenades);
    this.setBuffs(s.buffs);
    const hurt = Math.max(0, Math.min(1, 1 - s.health / s.maxHealth));
    // The full-screen blood layer is only composited while it shows (it costs frames even when transparent).
    const blood = s.down ? .9 : hurt > .05 ? .25 + hurt * .75 : 0;
    this.blood.hidden = blood === 0; if (blood) this.blood.style.opacity = blood;
    this.root.classList.toggle('down', Boolean(s.down));
    this.crosshair.style.opacity = s.crosshair.visible ? 1 : 0;
    this.crosshair.style.setProperty('--spread', unit(s.crosshair.spread));
    const key = s.promptKey || 'F';
    if (this.prompt.dataset.text !== (s.prompt ?? '') || this.prompt.dataset.key !== key) {
      // "Hold F for …": the key sits in a box like the game's key prompts (the controller's button when one is in use).
      this.prompt.replaceChildren(...String(s.prompt ?? '').split(/\b(F)\b/).map((part, i) => i % 2 ? Object.assign(el('kbd'), {textContent: key}) : document.createTextNode(part)));
      this.prompt.dataset.text = s.prompt ?? ''; this.prompt.dataset.key = key;
    }
    this.prompt.hidden = !s.prompt;
    this.progress.hidden = !(s.progress > 0);
    this.progressFill.style.width = `${Math.round(Math.min(1, s.progress || 0) * 100)}%`;
    this.setWaypoints(s.waypoints ?? []);
  }

  /** Downed teammates: the revive skull with its bleed-out ring, which fills white while someone revives. */
  setWaypoints(points) {
    while (this.waypoints.childElementCount < points.length) {
      const w = el('div', 'hud-waypoint', this.waypoints);
      for (const [cls, name] of [['glow', 'uie_t7_zm_hud_revive_glow'], ['ring', 'uie_t7_zm_hud_revive_ringmiddle'], ['skull', 'uie_t7_zm_hud_revive_skull']]) { const i = el('img', cls, w); i.src = this.url(name); i.alt = ''; }
    }
    [...this.waypoints.children].forEach((w, i) => {
      const p = points[i]; w.hidden = !p;
      if (!p) return;
      Object.assign(w.style, {left: `${p.x * 100}%`, top: `${p.y * 100}%`});
      w.style.setProperty('--bleed', String(p.bleed)); w.style.setProperty('--revive', String(p.revive));
      w.classList.toggle('reviving', p.revive > 0);
    });
  }
}
