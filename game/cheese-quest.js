import * as THREE from 'three';
import {CHEESE_RULES} from './map-rules.js';

const words = ['one', 'two', 'three', 'four', 'five', 'six'];
// Answers belong to the map's 2017 artwork, including its historical subscriber question.
const triviaAnswers = ['c', 'b', 'd', 'c', 'b'];

export class CheeseQuest {
  constructor({world, game, notify, sound, points, reward, win, hurt}) {
    Object.assign(this, {world, game, notify, sound, points, reward, win, hurt});
    this.entities = world.entities;
    this.find = name => this.entities.find(e => e.targetname === name);
    this.parts = [1, 2].map(n => this.find(`powcraft_pick${n}_trig`)).filter(Boolean);
    this.build = this.find('powcraft_crafting_trig');
    this.cheeses = [1, 2, 3, 4, 5, 6].map(n => this.find(`cheese_trig${n}`)).filter(Boolean);
    this.places = [1, 2, 3, 4, 5, 6].map(n => this.find(`cheese_place${n}_trig`)).filter(Boolean);
    this.exit = this.find('end_game_trig');
    const water = this.find('rising_brush');
    this.waterBounds = water?.bounds ? new THREE.Box3(new THREE.Vector3(...water.bounds.min), new THREE.Vector3(...water.bounds.max)) : null;
    this.steps = this.entities.filter(e => /^step_move/.test(e.targetname) && e.bounds);
    this.targets = this.entities.filter(e => /^(cheese_poster\d_trig|dalek_ee_trig\d|answer_[abcd]|trigger_troll_trig)$/.test(e.targetname)).map(e => {
      const brushName = e.targetname.replace(/_trig(\d)?$/, (_, n) => '_brush' + (n || ''));
      const bounds = this.find(brushName)?.bounds;
      return {entity: e, box: bounds ? new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max)).expandByScalar(1.5) : new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...e.position), new THREE.Vector3(10, /^answer_/.test(e.targetname) ? 2.5 : 18, 10))};
    });
    this.reset();
  }
  reset() {
    this.collectedParts = new Set(); this.collected = new Set(); this.placed = new Set();
    this.posters = new Set(); this.daleks = new Set(); this.rewards = new Set();
    this.built = !this.parts.length; this.crafting = 0; this.elapsed = 0; this.trivia = 0; this.answerCooldown = 0;
    this.rise = 0; this.rising = false; this.waterHit = 0; this.troll = 0; this.escaped = false;
    this.powerAnim = 0; this.world.waterLevel = -Infinity; this.escapeOpen = false;
    this.world.moveTarget('rising_brush', new THREE.Vector3());
    for (let n = 1; n <= 6; n++) this.world.setVisible(`cheese_place_brush${n}`, false);
    for (let n = 1; n <= 5; n++) this.world.setVisible(`trivia${n}`, n === 1);
    if (!this.built) { this.world.setVisible('powcraft_build1', false); this.world.setVisible('auto1', false); }
    // Black cheese is a hazard, never a walkable platform.
    const water = this.world.collision.parts.get('rising_brush'); if (water) water.enabled = false;
  }
  entry(kind, item, text, extra = {}) { return {kind, item, position: new THREE.Vector3(...item.position), radius: 90, cost: 0, text, ...extra}; }
  interactables() {
    const out = [];
    this.parts.forEach((e, i) => { if (!this.collectedParts.has(i)) out.push(this.entry('powerPart', e, `Hold F to collect power ${i ? 'handle' : 'panel'}`, {part: i})); });
    if (this.build && !this.built) out.push(this.entry('buildPower', this.build, this.crafting > 0 ? 'Building power switch…' : this.collectedParts.size === this.parts.length ? 'Hold F to build the power switch' : `Find the power parts (${this.collectedParts.size}/${this.parts.length})`, {hold: CHEESE_RULES.craftSeconds}));
    this.cheeses.forEach((e, i) => { if (!this.collected.has(i)) out.push(this.entry('cheese', e, 'Hold F to collect cheese', {part: i})); });
    this.places.forEach((e, i) => { if (!this.placed.has(i)) out.push(this.entry('placeCheese', e, this.collected.has(i) ? 'Hold F to place cheese' : 'Find the missing cheese piece', {part: i})); });
    if (this.placed.size === this.cheeses.length) {
      for (const e of this.entities.filter(e => /^cheese_reward_weapon_trigger/.test(e.targetname))) if (!this.rewards.has(e.id)) out.push(this.entry('cheeseReward', e, 'Hold F to claim an upgraded weapon'));
    }
    if (this.exit) out.push(this.entry('escape', this.exit, this.posters.size < 5 || this.trivia < 5 ? `Unlock escape: targets ${this.posters.size}/5 · trivia ${this.trivia}/5` : `Hold F to escape [Cost: ${CHEESE_RULES.escapeCost}]`, {cost: CHEESE_RULES.escapeCost, hold: 1}));
    return out;
  }
  /** `reward` gives the claiming survivor their weapon (co-op passes the guest's inventory). */
  async use(target, reward = this.reward) {
    const n = target.part;
    switch (target.kind) {
      case 'powerPart':
        if (this.collectedParts.has(n)) return false;
        this.collectedParts.add(n); this.world.animateAway(`powcraft_pick${n + 1}`);
        this.notify(`Power part ${this.collectedParts.size}/${this.parts.length}`, 2); break;
      case 'buildPower':
        if (this.built || this.collectedParts.size !== this.parts.length) return false;
        this.built = true; this.world.setVisible('powcraft_build1', true); this.world.setVisible('auto1', true);
        this.world.setVisible('powcraft_clip_build', false); this.notify('Power switch built — turn it on', 2); break;
      case 'cheese':
        if (this.collected.has(n)) return false;
        this.collected.add(n); this.world.animateAway(`cheese_model_${words[n]}`);
        if (n === 0) this.world.animateAway('cheese_unlock_cage_trig');
        this.notify(`Cheese collected ${this.collected.size}/${this.cheeses.length}`, 2); break;
      case 'placeCheese':
        if (!this.collected.has(n) || this.placed.has(n)) return false;
        this.placed.add(n); this.world.setVisible(`cheese_place_brush${n + 1}`, true);
        if (this.placed.size === this.cheeses.length) { this.world.animateAway('cheese_reward_cage_model'); this.notify('Cheese assembled — reward cage unlocked', 3); }
        else this.notify(`Cheese placed ${this.placed.size}/${this.cheeses.length}`, 2);
        break;
      case 'cheeseReward': {
        if (this.rewards.has(target.item.id)) return false;
        const choices = ['smg_mp40_t6_upgraded', 'ar_ak47_upgraded', 'lmg_lsat_upgraded'].filter(n => this.game.weapons[n]);
        const name = choices[this.rewards.size % choices.length];
        if (!name || !await reward(name)) return false;
        this.rewards.add(target.item.id); break;
      }
      case 'escape':
        if (this.posters.size < 5 || this.trivia < 5) return false;
        this.escaped = true; this.win(); break;
      default: return false;
    }
    this.sound.play('pickup'); return true;
  }
  shoot(ray, far) {
    if (this.answerCooldown > 0) return false;
    const point = new THREE.Vector3();
    const candidates = this.targets.filter(t => ray.intersectBox(t.box, point) && point.distanceTo(ray.origin) <= far + 4)
      .sort((a, b) => a.box.distanceToPoint(ray.origin) - b.box.distanceToPoint(ray.origin));
    const target = candidates[0]?.entity;
    if (!target) return false;
    const name = target.targetname;
    if (/^cheese_poster/.test(name)) {
      if (this.posters.has(name)) return true;
      this.posters.add(name); this.world.animateAway(name.replace('_trig', '_brush'));
      this.points(100); this.notify(`Cheese targets ${this.posters.size}/5`, 2);
    } else if (/^dalek/.test(name)) {
      if (this.daleks.has(name)) return true;
      this.daleks.add(name); this.world.animateAway(name.replace('_trig', '_brush'));
      this.points(this.daleks.size === 3 ? 1500 : 100); this.notify(`Secret targets ${this.daleks.size}/3`, 2);
    } else if (/^answer_/.test(name)) {
      if (this.trivia >= 5) return true;
      this.answerCooldown = .8;
      if (name.at(-1) === triviaAnswers[this.trivia]) {
        this.world.setVisible(`trivia${this.trivia + 1}`, false); this.trivia++;
        this.world.setVisible(`trivia${this.trivia + 1}`, true);
        this.points(200); this.notify(this.trivia === 5 ? 'Trivia complete' : `Correct — question ${this.trivia + 1}/5`, 2);
      } else { this.notify('Wrong answer — try again', 1.5); this.sound.play('deny'); return true; }
    } else {
      this.troll = 10; this.notify('Watch your step!', 2);
    }
    if (this.posters.size === 5 && this.trivia === 5) { this.world.animateAway('end_game_door'); this.notify('Escape unlocked — reach the top', 3); }
    this.sound.play('pickup'); return true;
  }
  turnOnPower() {
    if (!this.built || this.world.power) return false;
    this.world.power = true; this.powerAnim = .5;
    this.notify('Power is on', 2); this.sound.play('power_on'); return true;
  }
  /**
   * `survivors` is one player or (co-op) a list of {feet, player, alive, health, hurt, carry}. Each one in the
   * rising cheese is hurt; `carry` players ride the moving steps. `visual` (co-op guests) only animates.
   */
  update(dt, survivors, {visual = false} = {}) {
    const players = Array.isArray(survivors) ? survivors : [survivors];
    this.elapsed += dt; this.answerCooldown = Math.max(0, this.answerCooldown - dt); this.troll = Math.max(0, this.troll - dt);
    if (this.powerAnim > 0) {
      this.powerAnim -= dt;
      for (const piece of this.world.byTarget.get('auto1') ?? []) {
        const original = this.world.originals.get(piece);
        if (original) { piece.quaternion.copy(original.quaternion); piece.rotateX(-Math.PI / 2 * (1 - Math.max(0, this.powerAnim) / .5)); }
      }
    }
    if (!this.rising && this.waterBounds && this.elapsed >= CHEESE_RULES.riseDelay) { this.rising = true; if (!visual) this.notify('The black cheese is rising — keep climbing!', 4); this.sound.play('cheese_unlimited_alarm'); }
    if (this.rising && this.waterBounds) {
      const risingSeconds = this.elapsed - CHEESE_RULES.riseDelay;
      this.rise = CHEESE_RULES.riseDistance * Math.min(1, risingSeconds / CHEESE_RULES.riseSeconds);
      this.world.waterLevel = this.waterBounds.max.y + this.rise;
      this.world.moveTarget('rising_brush', new THREE.Vector3(0, this.rise, 0));
      const check = Math.floor((risingSeconds + 1e-9) / CHEESE_RULES.waterCheckSeconds);
      if (check > this.waterHit) {
        this.waterHit = check;
        // Original black_cheese_area (?25) is one axis-aligned hull, with the
        // same bounds as rising_brush (*41), linked to follow its displacement.
        // Test contact with the browser's upright player capsule, not just feet.
        const b = this.waterBounds;
        if (!visual) for (const {player, alive, health = 100, hurt = this.hurt} of players) {
          const c = player.collider;
          const dx = Math.max(b.min.x - c.start.x, 0, c.start.x - b.max.x);
          const dz = Math.max(b.min.z - c.start.z, 0, c.start.z - b.max.z);
          const dy = Math.max(b.min.y + this.rise - Math.max(c.start.y, c.end.y), 0, Math.min(c.start.y, c.end.y) - b.max.y - this.rise);
          if (alive && dx * dx + dy * dy + dz * dz <= c.radius * c.radius) hurt(health + 666, {hazard: true});
        }
      }
    }
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i], part = this.world.collision.parts.get(step.targetname);
      const old = part?.offset.clone() ?? new THREE.Vector3();
      const offset = new THREE.Vector3(Math.sin(this.elapsed * .65 + i * .5) * 18, this.troll > 0 ? -Math.sin(this.troll * Math.PI / 10) * 24 : 0, 0);
      const b = step.bounds;
      for (const {feet, player, alive, carry = true} of players) {
        if (carry && alive && player.isGrounded && Math.abs(feet.y - (b.max[1] + old.y)) < 4 && feet.x >= b.min[0] + old.x && feet.x <= b.max[0] + old.x && feet.z >= b.min[2] && feet.z <= b.max[2]) {
          player.collider.translate(offset.clone().sub(old)); player.update(0);
        }
      }
      this.world.moveTarget(step.targetname, offset);
    }
  }
  // Co-op: the host's quest progress, applied by guests with the same scene changes as playing it.
  pack() {
    return {parts: [...this.collectedParts], built: this.built, cheese: [...this.collected], placed: [...this.placed], posters: [...this.posters],
      daleks: [...this.daleks], rewards: [...this.rewards], trivia: this.trivia, elapsed: Math.round(this.elapsed * 100) / 100, troll: this.troll, escaped: this.escaped};
  }
  applyRemote(s, power) {
    for (const n of s.parts) if (!this.collectedParts.has(n)) { this.collectedParts.add(n); this.world.animateAway(`powcraft_pick${n + 1}`); }
    if (s.built && !this.built) { this.built = true; this.world.setVisible('powcraft_build1', true); this.world.setVisible('auto1', true); this.world.setVisible('powcraft_clip_build', false); }
    if (power && !this.world.power) { this.world.power = true; this.powerAnim = .5; }
    for (const n of s.cheese) if (!this.collected.has(n)) {
      this.collected.add(n); this.world.animateAway(`cheese_model_${words[n]}`);
      if (n === 0) this.world.animateAway('cheese_unlock_cage_trig');
    }
    for (const n of s.placed) if (!this.placed.has(n)) {
      this.placed.add(n); this.world.setVisible(`cheese_place_brush${n + 1}`, true);
      if (this.placed.size === this.cheeses.length) this.world.animateAway('cheese_reward_cage_model');
    }
    for (const name of s.posters) if (!this.posters.has(name)) { this.posters.add(name); this.world.animateAway(name.replace('_trig', '_brush')); }
    for (const name of s.daleks) if (!this.daleks.has(name)) { this.daleks.add(name); this.world.animateAway(name.replace('_trig', '_brush')); }
    this.rewards = new Set(s.rewards);
    while (this.trivia < Math.min(5, s.trivia)) { this.world.setVisible(`trivia${this.trivia + 1}`, false); this.trivia++; this.world.setVisible(`trivia${this.trivia + 1}`, true); }
    if (this.posters.size === 5 && this.trivia === 5 && !this.escapeOpen) { this.escapeOpen = true; this.world.animateAway('end_game_door'); }
    // The local clock keeps the water and steps smooth between snapshots.
    if (Math.abs(this.elapsed - s.elapsed) > .25) this.elapsed = s.elapsed;
    this.troll = s.troll; this.escaped = s.escaped;
  }
  get waterStopped() { return this.rising && this.rise >= CHEESE_RULES.riseDistance; }
  get objective() {
    if (!this.built) return `Build power · parts ${this.collectedParts.size}/${this.parts.length}`;
    if (!this.world.power) return 'Turn on the power switch';
    return `Cheese ${this.collected.size}/6 · placed ${this.placed.size}/6 · targets ${this.posters.size}/5 · trivia ${this.trivia}/5`;
  }
}
