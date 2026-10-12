import * as THREE from 'three';
import {disposeObject} from './effects.js';
import {PowerupModels} from './powerups.js';

const drops = ['maxAmmo', 'doublePoints', 'instaKill', 'nuke'];
const names = {maxAmmo: 'MAX AMMO', doublePoints: 'DOUBLE POINTS', instaKill: 'INSTA-KILL', nuke: 'NUKE'};
const round1 = v => Math.round(v * 10) / 10;

export class Combat {
  constructor({scene, world, camera, zombies, weapons, playerState, effects, sound, notify, points, hurt, hit}) {
    Object.assign(this, {scene, world, camera, zombies, weapons, playerState, effects, sound, notify, points, hurt, hit});
    this.projectiles = []; this.pickups = []; this.buffs = {}; this.grenades = 4; this.killsSinceDrop = 0; this.serial = 0;
    this.powerupModels = new PowerupModels();
  }
  async load(base, manager) { await this.powerupModels.load(base, manager, this.scene.background); }
  // Grenades belong to the acting survivor; power-ups, drops and buffs are shared by the team.
  get grenades() { return this.playerState.grenades ?? 0; }
  set grenades(value) { this.playerState.grenades = value; }
  reset() {
    for (const p of this.projectiles) disposeObject(p.mesh);
    for (const p of this.pickups) p.mesh.removeFromParent();
    this.projectiles = []; this.pickups = []; this.buffs = {}; this.grenades = 4; this.killsSinceDrop = 0; this.serial = 0;
  }
  get multiplier() { return this.buffs.doublePoints > 0 ? 2 : 1; }
  melee() {
    const eye = this.camera.position, direction = this.camera.getWorldDirection(new THREE.Vector3());
    let best = null, distance = 86;
    for (const z of this.zombies.list) {
      const center = z.root.position.clone().add(new THREE.Vector3(0, 42, 0));
      const delta = center.clone().sub(eye), d = delta.length();
      if (d < distance && delta.normalize().dot(direction) > .55 && this.world.lineClear(eye, center)) { best = z; distance = d; }
    }
    this.sound.play('melee');
    if (!best) return;
    const killed = this.zombies.damage(best, this.buffs.instaKill > 0 ? best.health : 150, {melee: true});
    if (!killed) this.points(10);
    this.hit(killed);
    this.effects.burst(best.root.position.clone().add(new THREE.Vector3(0, 45, 0)), 0x932f22, 8);
  }
  throwGrenade() {
    if (this.grenades <= 0) return;
    this.grenades--;
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), new THREE.MeshStandardMaterial({color: 0x556331, roughness: .65}));
    // Start at the eye so a swept ray catches walls even when throwing at point-blank range.
    mesh.position.copy(this.camera.position).add(new THREE.Vector3(0, -3, 0));
    const velocity = direction.multiplyScalar(500); velocity.y += 150;
    this.scene.add(mesh); this.projectiles.push({id: ++this.serial, owner: this.owner?.() ?? null, mesh, velocity, fuse: 3, resting: false});
    this.sound.play('mechanism');
  }
  explode(position, {radius = 220, damage = 1000, self = true} = {}) {
    this.sound.play('explosion'); this.effects.burst(position, 0xff922a, 28, 4, 240, .65);
    for (const z of [...this.zombies.list]) {
      const center = z.root.position.clone().add(new THREE.Vector3(0, 32, 0)), d = center.distanceTo(position);
      if (d >= radius || !this.world.lineClear(position, center)) continue;
      const killed = this.zombies.damage(z, this.buffs.instaKill > 0 ? z.health : Math.max(50, damage * (1 - d / radius)));
      if (!killed) this.points(10);
      this.hit(killed);
    }
    const distance = this.camera.position.distanceTo(position);
    if (self && distance < radius && !this.playerState.perks.has('specialty_phdflopper') && this.world.lineClear(position, this.camera.position)) this.hurt(100 * (1 - distance / radius));
  }
  drop(position) {
    if (this.suppressDrops) return;
    this.killsSinceDrop++;
    if (this.pickups.length >= 3 || (this.killsSinceDrop < 6 && Math.random() > .12)) return;
    this.killsSinceDrop = 0;
    this.spawnPickup(drops[Math.floor(Math.random() * drops.length)], position);
    this.sound.play('powerup_spawn');
  }
  spawnPickup(kind, position, id = ++this.serial) {
    const visual = this.powerupModels.create(kind), {mesh} = visual;
    mesh.position.copy(position).add(new THREE.Vector3(0, 28, 0));
    const pickup = {id, ...visual, kind, life: 25, y: mesh.position.y, age: 0};
    this.powerupModels.animate(pickup);
    this.scene.add(mesh); this.pickups.push(pickup); return pickup;
  }
  collect(kind) {
    // `team` (co-op host) lists every survivor; power-ups reach all of them.
    const team = this.team?.() ?? [{weapons: this.weapons, playerState: this.playerState, points: n => this.points(n)}];
    if (kind === 'maxAmmo') {
      for (const member of team) {
        for (const slot of member.weapons.slots) if (slot) { slot.clip = slot.def.clip; slot.reserve = slot.def.reserve; }
        member.playerState.grenades = 4; member.weapons.rev = (member.weapons.rev ?? 0) + 1;
      }
    } else if (kind === 'nuke') {
      this.suppressDrops = true;
      for (const z of [...this.zombies.list]) this.zombies.damage(z, z.health);
      this.suppressDrops = false; for (const member of team) member.points(400);
    } else this.buffs[kind] = 30;
    // The original grab sound, then the power-up's own (Double Points has none of its own).
    this.sound.play('powerup_grab');
    const own = {maxAmmo: 'powerup_maxammo', instaKill: 'powerup_instakill', nuke: 'powerup_nuke'}[kind];
    if (own) this.sound.play(own);
    if (this.onPowerup) this.onPowerup(kind); else this.notify(names[kind], 2);
  }
  /** `feet` is the player's position, or (co-op host) a list of living survivors as {id, feet}. */
  update(dt, feet, alive) {
    const collectors = Array.isArray(feet) ? feet : alive ? [{id: null, feet}] : [];
    const as = (id, fn) => this.withOwner ? this.withOwner(id, fn) : fn();
    for (const key of Object.keys(this.buffs)) {
      const before = this.buffs[key]; this.buffs[key] = Math.max(0, before - dt);
      if (key === 'doublePoints' && before > 0 && this.buffs[key] === 0) this.sound.play('powerup_double_off');
    }
    for (const p of [...this.projectiles]) {
      p.fuse -= dt;
      // The thrower is credited with kills and is the only survivor its blast can hurt.
      if (p.fuse <= 0) { const at = p.mesh.position.clone(); disposeObject(p.mesh); this.projectiles.splice(this.projectiles.indexOf(p), 1); as(p.owner, () => this.explode(at)); continue; }
      for (let left = dt; left > 0 && !p.resting; left -= 1 / 120) {
        const slice = Math.min(left, 1 / 120);
        p.velocity.y -= slice * 600;
        const delta = p.velocity.clone().multiplyScalar(slice), length = delta.length();
        if (!length) continue;
        const direction = delta.clone().normalize();
        const wall = this.world.collision.rayIntersect(new THREE.Ray(p.mesh.position, direction), 0, length + 3);
        if (wall) {
          const normal = wall.triangle.getNormal(new THREE.Vector3());
          if (normal.dot(direction) > 0) normal.negate();
          p.mesh.position.addScaledVector(direction, Math.max(0, wall.distance - 3.2));
          p.velocity.reflect(normal).multiplyScalar(.45);
          if (normal.y > .6 && p.velocity.length() < 35) p.resting = true;
        } else p.mesh.position.add(delta);
      }
      p.mesh.rotation.x += dt * 4; p.mesh.rotation.z += dt * 3;
    }
    for (const p of [...this.pickups]) {
      this.animatePickup(p, dt);
      const collector = collectors.find(({feet}) => Math.abs(p.mesh.position.y - feet.y) < 70 && Math.hypot(p.mesh.position.x - feet.x, p.mesh.position.z - feet.z) < 34);
      if (collector || p.life <= 0) { if (collector) as(collector.id, () => this.collect(p.kind)); p.mesh.removeFromParent(); this.pickups.splice(this.pickups.indexOf(p), 1); }
    }
  }
  animatePickup(p, dt) {
    p.life -= dt; p.age += dt; p.core.rotation.y += dt * 1.8;
    p.mesh.position.y = p.y + Math.sin(p.age * 3) * 4;
    p.mesh.visible = p.life > 5 || Math.sin(p.life * 14) > 0;
    this.powerupModels.animate(p);
  }

  // Co-op: the host sends drops and live grenades; guests only draw them.
  pack() {
    return {pickups: this.pickups.map(p => [p.id, p.kind, round1(p.mesh.position.x), round1(p.y), round1(p.mesh.position.z), round1(p.life)]),
      grenades: this.projectiles.map(p => [p.id, round1(p.mesh.position.x), round1(p.mesh.position.y), round1(p.mesh.position.z)])};
  }
  applyRemote(pickups = [], grenades = []) {
    const drops = new Set(pickups.map(p => p[0])), live = new Set(grenades.map(g => g[0]));
    for (const p of [...this.pickups]) if (!drops.has(p.id)) { p.mesh.removeFromParent(); this.pickups.splice(this.pickups.indexOf(p), 1); }
    for (const [id, kind, x, y, z, life] of pickups) {
      const p = this.pickups.find(p => p.id === id) ?? this.spawnPickup(kind, new THREE.Vector3(x, y - 28, z), id);
      p.life = life;
    }
    for (const p of [...this.projectiles]) if (!live.has(p.id)) { disposeObject(p.mesh); this.projectiles.splice(this.projectiles.indexOf(p), 1); }
    for (const [id, x, y, z] of grenades) {
      let p = this.projectiles.find(p => p.id === id);
      if (!p) {
        p = {id, mesh: new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), new THREE.MeshStandardMaterial({color: 0x556331, roughness: .65})), target: new THREE.Vector3(x, y, z)};
        p.mesh.position.set(x, y, z); this.scene.add(p.mesh); this.projectiles.push(p);
      }
      (p.target ??= new THREE.Vector3()).set(x, y, z);
    }
  }
  animate(dt) {
    for (const p of this.pickups) this.animatePickup(p, dt);
    for (const p of this.projectiles) if (p.target) { p.mesh.position.lerp(p.target, 1 - Math.exp(-dt * 20)); p.mesh.rotation.x += dt * 4; p.mesh.rotation.z += dt * 3; }
  }
}
