import * as THREE from 'three';
import {label} from './effects.js';
import {CHEESE_RULES} from './map-rules.js';

function boxMesh(size, color, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({color, roughness: .65}));
  mesh.position.set(...position); return mesh;
}

export class Machines {
  constructor({world, scene, weapons, game, assets, notify, sound}) {
    Object.assign(this, {world, scene, weapons, game, assets, notify, sound});
    this.generation = 0;
    this.displays = new Map();
    this.box = world.box && this.build('box', world.box);
    this.pap = world.pap && this.build('pap', world.pap);
    this.reset();
  }
  build(kind, source) {
    const root = new THREE.Group(); root.position.copy(source.position);
    root.rotation.y = -(Number((source.entity.angles || '0 0 0').split(' ')[1]) || 0) * Math.PI / 180;
    // Zbarriers are omitted by the original map composer, so create their missing housings here.
    let lid = null;
    if (kind === 'box') {
      root.add(boxMesh([74, 24, 30], 0x69502a, [0, 12, 0]));
      for (const x of [-32, 32]) root.add(boxMesh([4, 26, 32], 0xb9a056, [x, 13, 0]));
      lid = new THREE.Group(); lid.position.set(0, 24, -15);
      lid.add(boxMesh([76, 5, 32], 0xbfa33e, [0, 2, 15])); root.add(lid);
    } else {
      root.add(boxMesh([54, 47, 34], 0x697d79, [0, 23.5, 0]));
      root.add(boxMesh([45, 12, 10], 0x182622, [0, 32, 21]));
      root.add(boxMesh([58, 8, 40], 0xabbbb4, [0, 50, 0]));
      for (const x of [-23, 23]) root.add(boxMesh([6, 44, 6], 0xabc1b6, [x, 26, 20]));
    }
    const title = label(kind === 'box' ? '? MYSTERY BOX ?' : 'PACK-A-PUNCH', '#fff0a0', 90);
    title.position.y = kind === 'box' ? 34 : 70; root.add(title);
    const glow = new THREE.PointLight(kind === 'box' ? 0x82aaff : 0x71ffda, 0, 180, 1);
    glow.position.y = 50; root.add(glow);
    const display = new THREE.Group(); display.position.y = 52; root.add(display);
    this.scene.add(root);
    root.updateMatrixWorld(true);
    const collision = new THREE.BoxGeometry(kind === 'box' ? 76 : 58, kind === 'box' ? 28 : 54, kind === 'box' ? 32 : 40);
    collision.translate(0, kind === 'box' ? 14 : 27, 0).applyMatrix4(root.matrixWorld);
    this.world.collision.add('machine:' + kind, collision);
    return {kind, root, lid, glow, display, title, state: 'idle', source};
  }
  reset() {
    this.generation++;
    for (const m of [this.box, this.pap]) if (m) {
      m.state = 'idle'; m.timer = 0; m.elapsed = 0; m.offer = null; m.slot = null; m.index = null; m.owner = null; m.weapons = null;
      m.display.clear(); m.glow.intensity = 0; if (m.lid) m.lid.rotation.x = 0;
    }
  }
  async prepareDisplay(name) {
    if (this.displays.has(name)) return this.displays.get(name);
    const root = await this.assets.model(this.game.weapons[name].viewModel);
    root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
    const holder = new THREE.Group(); holder.add(root);
    root.position.sub(bounds.getCenter(new THREE.Vector3()));
    holder.scale.setScalar(45 / Math.max(size.x, size.y, size.z, 1));
    this.displays.set(name, holder);
    return holder;
  }
  // `weapons` and `owner` are the buyer's: in co-op only they can collect the offer.
  async prepareBox(pool, weapons = this.weapons) {
    if (!pool.length) throw new Error('Every Mystery Box weapon is already owned');
    const name = pool[Math.floor(Math.random() * pool.length)];
    await Promise.all([weapons.prepare(name), this.prepareDisplay(name)]);
    return name;
  }
  startBox(name, owner = null) {
    const m = this.box;
    if (!m || m.state !== 'idle') return false;
    m.state = 'rolling'; m.timer = CHEESE_RULES.boxSeconds; m.elapsed = 0; m.offer = name; m.owner = owner;
    m.display.clear(); m.display.add(this.displays.get(name));
    this.sound.play('box_open'); this.sound.play('box_music'); return true;
  }
  async startPap(weapons = this.weapons, owner = null) {
    const m = this.pap, slot = weapons.current;
    const generation = this.generation;
    if (!m || m.state !== 'idle' || !slot?.def.upgrade || !this.game.weapons[slot.def.upgrade]) return false;
    await Promise.all([weapons.prepare(slot.def.upgrade), this.prepareDisplay(slot.def.upgrade)]);
    if (generation !== this.generation || weapons.current !== slot || m.state !== 'idle') return false;
    // Caller serializes purchases; retain the exact deposited slot even if the player switches later.
    m.slot = slot; m.index = weapons.index; m.offer = slot.def.upgrade; m.owner = owner; m.weapons = weapons;
    weapons.reserved.add(m.index);
    m.state = 'working'; m.timer = CHEESE_RULES.papSeconds; m.elapsed = 0;
    m.display.clear(); m.display.add(this.displays.get(m.offer));
    weapons.slots[m.index] = null;
    const alternative = weapons.slots.findIndex(s => s);
    if (alternative >= 0) weapons.index = alternative;
    weapons.rev = (weapons.rev ?? 0) + 1;
    await weapons.equip();
    this.sound.play('pap_upgrade'); this.sound.play('sting_specialty_packapunch'); return true;
  }
  async take(m, weapons = this.weapons) {
    if (!m || m.state !== 'offered') return false;
    m.state = 'claiming';
    const generation = this.generation;
    try {
      const given = await weapons.give(m.offer, {replaceIndex: m.kind === 'pap' ? m.index : null});
      if (generation !== this.generation) return false;
      if (!given) { m.state = 'offered'; return false; }
      if (m.kind === 'pap') weapons.reserved.delete(m.index);
      this.notify(this.game.weapons[m.offer].displayName, 1.5);
      if (m.kind === 'box') this.sound.play('box_close');
      m.state = 'closing'; m.timer = .5; m.display.clear(); m.slot = null;
      return true;
    } catch (error) { if (generation === this.generation) m.state = 'offered'; throw error; }
  }
  update(dt, time) { this.advance(dt); this.animate(dt, time); }
  advance(dt) {
    for (const m of [this.box, this.pap]) if (m) {
      if (m.state !== 'idle' && m.state !== 'claiming') m.timer -= dt;
      if (['rolling', 'working'].includes(m.state) && m.timer <= 0) {
        m.state = 'offered'; m.timer = CHEESE_RULES.offerSeconds;
        this.notify(`${this.game.weapons[m.offer].displayName}\nHold F at the machine to take it`, 2.5);
        if (m.kind === 'pap') this.sound.play('pap_ready');
      } else if (m.state === 'offered' && m.timer <= 0) {
        // A timed-out upgrade returns the original gun rather than silently destroying the only weapon.
        const weapons = m.weapons ?? this.weapons;
        if (m.kind === 'pap' && m.slot && !weapons.slots[m.index]) {
          weapons.reserved.delete(m.index);
          weapons.slots[m.index] = m.slot; weapons.rev = (weapons.rev ?? 0) + 1;
          if (!weapons.current) { weapons.index = m.index; weapons.equip().catch(error => this.notify(error.message, 3)); }
          this.notify('Upgrade expired — original weapon returned', 2);
        }
        m.state = 'closing'; m.timer = .5; m.display.clear(); m.slot = null; m.weapons = null;
      } else if (m.state === 'closing' && m.timer <= 0) { m.state = 'idle'; m.owner = null; }
    }
  }
  animate(dt, time) {
    for (const m of [this.box, this.pap]) if (m) {
      m.elapsed += dt;
      const open = ['rolling', 'working', 'offered', 'claiming'].includes(m.state);
      if (m.lid) m.lid.rotation.x = THREE.MathUtils.damp(m.lid.rotation.x, open ? -1.6 : 0, 8, dt);
      m.glow.intensity = open ? 30 + Math.sin(time * 9) * 10 : (m.kind === 'pap' && this.world.power ? 8 : 0);
      m.display.rotation.y += dt * (m.state === 'rolling' ? 12 : .5);
      m.display.position.y = (m.kind === 'box' ? 44 : 62) + Math.sin(time * 2) * 3;
      m.display.scale.setScalar(m.state === 'working' ? .6 + .4 * Math.sin(m.elapsed * 8) ** 2 : 1);
    }
  }

  // Co-op: the host runs both machines; guests mirror their state and displays.
  pack() { return [this.box, this.pap].map(m => m && {state: m.state, offer: m.offer, timer: Math.round(m.timer * 10) / 10, owner: m.owner}); }
  applyRemote(states = []) {
    [this.box, this.pap].forEach((m, i) => {
      const s = states[i]; if (!m || !s) return;
      const showing = ['rolling', 'working', 'offered', 'claiming'].includes(s.state);
      if (s.state !== m.state && ['rolling', 'working'].includes(s.state)) m.elapsed = 0;
      if (showing && s.offer && (s.offer !== m.offer || !m.display.children.length)) {
        const offer = s.offer;
        this.prepareDisplay(offer).then(display => { if (m.offer === offer && ['rolling', 'working', 'offered', 'claiming'].includes(m.state)) { m.display.clear(); m.display.add(display); } })
          .catch(error => this.notify(error.message, 3));
      }
      if (!showing) m.display.clear();
      Object.assign(m, {state: s.state, offer: s.offer, timer: s.timer, owner: s.owner});
    });
  }
}
