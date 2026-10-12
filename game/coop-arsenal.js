// A co-op guest's inventory as the host keeps it: the same slots, reload and switch rules as Weapons, without a
// viewmodel. The guest animates its own gun; the host decides ammo, purchases and which shots count.
import { Weapons } from './weapons.js';

const ready = new Set(['idle', 'fire']);

export class RemoteArsenal {
  constructor(game) { this.game = game; this.perks = new Set(); this.rev = 0; this.reset(); }

  get current() { return this.slots[this.index] ?? null; }
  get maxSlots() { return this.perks.has('specialty_additionalprimaryweapon') ? 3 : 2; }
  get busy() { return !ready.has(this.state); }
  owned(name) { return this.slots.find(s => s && (s.def.name === name || this.game.weapons[name]?.upgrade === s.def.name)); }
  has(name) { return Boolean(this.owned(name)); }
  damageAt(def, distance) { return Weapons.prototype.damageAt.call(this, def, distance); }

  reset() {
    this.slots = []; this.reserved = new Set(); this.index = 0;
    this.state = 'idle'; this.timer = 0; this.ads = 0; this.reloadSlot = null;
    this.budget = 0; this.lastShot = -Infinity; this.perks.clear(); this.rev++;
  }

  async prepare(name) {
    const def = this.game.weapons[name];
    if (!def) throw new Error('Unknown weapon ' + name);
    return {def};
  }

  async give(name, {replaceIndex = null} = {}) {
    const def = this.game.weapons[name];
    if (!def) throw new Error('Unknown weapon ' + name);
    const existing = this.slots.findIndex(s => s?.def.name === name);
    let index = replaceIndex ?? (existing >= 0 ? existing : this.slots.findIndex((s, i) => !s && !this.reserved.has(i)));
    if (index < 0) index = this.slots.length < this.maxSlots ? this.slots.length : this.index;
    if (replaceIndex === null && this.reserved.has(index)) return false;
    this.slots[index] = {def, clip: def.clip, reserve: def.reserve};
    this.index = index; this.rev++;
    return this.equip();
  }

  refill(name) { const slot = this.owned(name); if (slot) { slot.reserve = slot.def.reserve; this.rev++; } }

  async equip() {
    this.state = this.current ? 'raise' : 'idle'; this.timer = this.current ? .1 : 0; this.reloadSlot = null;
    return true;
  }

  switchTo(index) {
    if (index === this.index || !this.slots[index] || !['idle', 'fire', 'reload', 'raise'].includes(this.state)) return false;
    this.index = index; this.equip(); return true;
  }

  cycle() {
    for (let i = 1; i <= this.slots.length; i++) {
      const index = (this.index + i) % this.slots.length;
      if (this.slots[index]) return this.switchTo(index);
    }
    return false;
  }

  reload() {
    const slot = this.current;
    if (!slot || !['idle', 'fire', 'raise'].includes(this.state) || slot.clip >= slot.def.clip || slot.reserve <= 0) return false;
    let duration = (slot.clip === 0 ? slot.def.reloadEmptyTime : slot.def.reloadTime) || 2;
    if (this.perks.has('specialty_fastreload')) duration *= .5;
    this.state = 'reload'; this.timer = duration; this.reloadSlot = slot;
    return true;
  }

  finishReload() {
    const slot = this.reloadSlot;
    if (slot && slot === this.current) { const take = Math.min(slot.def.clip - slot.clip, slot.reserve); slot.clip += take; slot.reserve -= take; }
    this.reloadSlot = null; this.state = 'idle'; this.timer = 0;
  }

  perform(kind, duration = .65) {
    if (!this.current || !(ready.has(this.state) || this.state === 'raise')) return false;
    this.state = kind; this.timer = duration; return true;
  }

  /**
   * A guest's shot. Messages can bunch up on the network, so a small burst is allowed, but never a sustained
   * rate above the weapon's. A reload the guest finished a moment earlier is completed here.
   */
  fire(time) {
    const slot = this.current;
    if (!slot) return null;
    if (this.state === 'reload' && this.timer < .3) this.finishReload();
    if (this.state === 'raise') this.state = 'idle';
    if (!ready.has(this.state) || slot.clip <= 0) return null;
    const interval = Math.max(.06, slot.def.fireTime) * (this.perks.has('specialty_doubletap2') ? .75 : 1);
    this.budget = Math.min(3, this.budget + (time - this.lastShot) / interval); this.lastShot = time;
    if (this.budget < .9) return null;
    this.budget -= 1; slot.clip--; this.state = 'fire'; this.timer = interval;
    return slot;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0 && this.state !== 'idle') { if (this.state === 'reload') this.finishReload(); else this.state = 'idle'; }
    if (this.state === 'idle' && this.current?.clip === 0 && this.current.reserve > 0) this.reload();
  }
}

/** Inventory in a snapshot, for either the host's own Weapons or a RemoteArsenal. */
export function packArsenal(w) {
  return {slots: Array.from(w.slots, s => s ? [s.def.name, s.clip, s.reserve] : null), index: w.index, reserved: [...w.reserved], rev: w.rev ?? 0};
}
