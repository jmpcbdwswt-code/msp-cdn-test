// Inventory and first-person actions share the simulation clock, including animation events.
import * as THREE from 'three';
import { Rig } from './assets.js';
import { ViewmodelPose } from './viewmodel-pose.js';
import { MeleeViewmodel, MELEE_IMPACT } from './melee-viewmodel.js';

const smooth = t => t * t * (3 - 2 * t);
const readyStates = new Set(['idle', 'fire']);

export class Weapons {
  constructor({assets, game, camera, onFire, onAction = () => {}, onSound = () => {}, onReload = () => {}}) {
    Object.assign(this, {assets, game, camera, onFire, onAction, onSound, onReload});
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a3a, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(.3, 1, .6);
    this.scene.add(key);
    this.viewCamera = new THREE.PerspectiveCamera(65, camera.aspect, 8, 400);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.props = this.createActionProps();
    this.scene.add(this.props);
    this.ownedMaterials = [];
    this.camoTime = {value: 0};
    this.baseFov = camera.fov;
    this.hip = new THREE.Vector3(1.5, -4, -3);
    this.aim = new THREE.Vector3();
    this.sway = new THREE.Vector2();
    this.perks = new Set();
    this.prepared = new Map();
    this.token = 0;
    this.reset();
  }

  get current() { return this.slots[this.index] ?? null; }
  get maxSlots() { return this.perks.has('specialty_additionalprimaryweapon') ? 3 : 2; }
  get busy() { return !readyStates.has(this.state); }
  owned(name) { return this.slots.find(s => s && (s.def.name === name || this.game.weapons[name]?.upgrade === s.def.name)); }
  has(name) { return Boolean(this.owned(name)); }

  reset() {
    this.token++;
    this.meleePose?.dispose(); this.meleePose = null;
    this.rig?.dispose();
    this.rig = null;
    this.pose = null;
    this.flash?.geometry.dispose(); this.flash?.material.dispose(); this.flash = null;
    this.root = null;
    this.pivot.clear();
    this.pivot.visible = true;
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.length = 0;
    this.props.visible = false;
    this.slots = [];
    this.reserved = new Set();
    this.index = 0;
    this.cooldown = this.timer = this.ads = this.recoil = this.flashLeft = 0;
    this.state = 'idle';
    this.pendingSwitch = null;
    this.action = null;
    this.perks.clear();
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  // Prepare before charging for a purchase; failed downloads leave the old inventory intact.
  async prepare(name) {
    if (this.prepared.has(name)) return this.prepared.get(name);
    const def = this.game.weapons[name];
    if (!def) throw new Error('Unknown weapon ' + name);
    const pending = Promise.all([
      this.assets.model(this.game.hands), this.assets.model(def.viewModel),
      Promise.all(Object.entries(def.anims).map(async ([role, anim]) => [role, await this.assets.anim(anim)])),
    ]).then(([, , clips]) => ({def, clips}));
    this.prepared.set(name, pending);
    try { return await pending; } catch (error) { this.prepared.delete(name); throw error; }
  }

  async give(name, {replaceIndex = null, first = true} = {}) {
    const generation = this.token;
    const {def} = await this.prepare(name);
    if (generation !== this.token) return false;
    const slot = {def, clip: def.clip, reserve: def.reserve};
    const existing = this.slots.findIndex(s => s?.def.name === name);
    let index = replaceIndex ?? (existing >= 0 ? existing : this.slots.findIndex((s, i) => !s && !this.reserved.has(i)));
    if (index < 0) index = this.slots.length < this.maxSlots ? this.slots.length : this.index;
    if (replaceIndex === null && this.reserved.has(index)) return false;
    this.slots[index] = slot;
    this.index = index;
    return this.equip(first);
  }

  refill(name) { const slot = this.owned(name); if (slot) slot.reserve = slot.def.reserve; }

  async equip(first = false) {
    const slot = this.current;
    const token = ++this.token;
    this.state = 'loading';
    if (!slot) { this.pivot.visible = false; this.state = 'idle'; return true; }
    const [{clips}, hands, gun] = await Promise.all([
      this.prepare(slot.def.name), this.assets.model(this.game.hands), this.assets.model(slot.def.viewModel),
    ]);
    if (token !== this.token) return false;
    const mount = hands.getObjectByName('tag_weapon_right');
    if (!mount) throw new Error('Viewmodel is missing tag_weapon_right');
    mount.add(gun);
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.length = 0;
    if (slot.def.upgraded) {
      const copies = new Map();
      const camo = original => {
        if (copies.has(original)) return copies.get(original);
        const material = original.clone();
        material.onBeforeCompile = shader => {
          shader.uniforms.camoTime = this.camoTime;
          shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 camoPosition;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\ncamoPosition = position;');
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 camoPosition;\nuniform float camoTime;')
            .replace('#include <color_fragment>', '#include <color_fragment>\nfloat camo = smoothstep(0.4, 0.7, sin(camoPosition.x * 1.8 + camoPosition.y * 2.5 + camoTime * 2.0));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.6, 0.85), camo * 0.55);');
        };
        copies.set(original, material); this.ownedMaterials.push(material); return material;
      };
      gun.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(camo) : camo(o.material); });
    }
    const root = new THREE.Group();
    root.add(hands);
    root.rotation.y = Math.PI / 2;
    root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    this.meleePose?.dispose();
    this.rig?.dispose();
    this.flash?.geometry.dispose(); this.flash?.material.dispose();
    this.pivot.clear();
    this.pivot.add(root);
    this.pivot.visible = true;
    this.root = root;
    this.pose = new ViewmodelPose(root);
    this.meleePose = new MeleeViewmodel(root, gun);
    this.rig = new Rig(root, name => { if (/reload|mag|bolt|slide/.test(name)) this.onSound('mechanism'); });
    for (const [role, clip] of clips) this.rig.add(role, clip, {skipRootMotion: false});
    this.rig.play('idle', {fade: 0});
    this.rig.update(0);
    // Calibrate in the animated idle pose: each gun supplies its own sight height and offset.
    this.pivot.position.set(0, 0, 0);
    this.pivot.rotation.set(0, 0, 0);
    root.updateWorldMatrix(true, true);
    const sights = gun.getObjectByName('tag_iron_sights') ?? gun.getObjectByName('tag_sights') ?? gun.getObjectByName('tag_flash');
    const sight = sights?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(3, -1, -20);
    this.aim.set(-sight.x, -sight.y, Math.min(0, -16 - sight.z));
    this.muzzle = gun.getObjectByName('tag_flash');
    this.flash = new THREE.Mesh(new THREE.ConeGeometry(.8, 3, 6), new THREE.MeshBasicMaterial({color: 0xffe9a0, transparent: true, opacity: .9, depthWrite: false}));
    this.flash.rotation.z = -Math.PI / 2;
    this.flash.position.x = 1.3;
    this.flash.visible = false;
    this.muzzle?.add(this.flash);
    this.flashLeft = 0;
    this.action = null;
    this.pendingSwitch = null;
    this.ads = this.recoil = this.cooldown = 0;
    const raise = first && this.rig.has('firstRaise') ? 'firstRaise' : 'raise';
    this.playState('raise', raise, this.rig.duration(raise) || .35);
    this.update(0);
    return true;
  }

  playState(state, clip, duration, event = null, at = .5) {
    this.state = state;
    this.timer = Math.max(.05, duration);
    this.action = {duration: this.timer, event, at, fired: false};
    if (this.rig?.has(clip)) this.rig.play(clip, {loop: false, fade: .06, restart: true, speed: this.rig.duration(clip) / this.timer});
    else this.rig?.play('idle', {fade: .08});
  }

  switchTo(index) {
    if (index === this.index || !this.slots[index] || !['idle', 'fire', 'reload', 'sprint', 'sprintIn'].includes(this.state)) return false;
    this.pendingSwitch = index;
    this.playState('switching', 'drop', Math.min(.5, this.rig?.duration('drop') || .25));
    return true;
  }

  cycle() {
    for (let i = 1; i <= this.slots.length; i++) {
      const index = (this.index + i) % this.slots.length;
      if (this.slots[index]) return this.switchTo(index);
    }
  }

  reload() {
    const slot = this.current;
    if (!slot || !this.rig || !['idle', 'fire', 'sprint', 'sprintIn', 'sprintOut'].includes(this.state) || slot.clip >= slot.def.clip || slot.reserve <= 0) return false;
    const empty = slot.clip === 0;
    const key = empty && this.rig.has('reloadEmpty') ? 'reloadEmpty' : 'reload';
    let duration = (empty ? slot.def.reloadEmptyTime : slot.def.reloadTime) || this.rig.duration(key) || 2;
    if (this.perks.has('specialty_fastreload')) duration *= .5;
    this.reloadSlot = slot;
    this.playState('reload', key, duration);
    this.onSound('reload'); this.onReload();
    return true;
  }

  perform(kind, duration = .65, event = kind) {
    if (!this.current || !this.rig || !['idle', 'fire', 'sprint', 'sprintIn', 'sprintOut'].includes(this.state)) return false;
    this.playState(kind, kind === 'melee' ? 'melee' : null, duration, event, kind === 'melee' ? MELEE_IMPACT : .6);
    return true;
  }

  trigger(held, pressed) {
    const slot = this.current;
    if (!slot || !this.rig || this.cooldown > 0 || !readyStates.has(this.state)) return false;
    const auto = slot.def.name !== 'bo3_m1911_zm' && slot.def.auto;
    if (!(auto ? held : pressed)) return false;
    if (slot.clip <= 0) { if (pressed || held) this.reload(); return false; }
    slot.clip--;
    this.cooldown = Math.max(.06, slot.def.fireTime) * (this.perks.has('specialty_doubletap2') ? .75 : 1);
    const key = slot.clip === 0 && this.rig.has('lastShot') ? 'lastShot' : 'fire';
    this.playState('fire', key, Math.max(this.cooldown, Math.min(this.rig.duration(key), .45)));
    this.recoil = Math.min(1.6, this.recoil + .8);
    this.flashLeft = .045;
    this.onSound('fire');
    this.onFire(slot);
    return true;
  }

  damageAt(def, distance) {
    if (distance <= def.maxDamageRange) return def.damage;
    const t = THREE.MathUtils.clamp((distance - def.maxDamageRange) / Math.max(1, def.minDamageRange - def.maxDamageRange), 0, 1);
    return Math.round(THREE.MathUtils.lerp(def.damage, def.minDamage || def.damage, t));
  }

  look(dx, dy) { this.sway.x = THREE.MathUtils.clamp(this.sway.x + dx * .002, -.35, .35); this.sway.y = THREE.MathUtils.clamp(this.sway.y + dy * .002, -.25, .25); }

  createActionProps() {
    const root = new THREE.Group();
    const mesh = (geometry, color) => new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color, roughness: .45, metalness: .25}));
    const bottle = new THREE.Group(); bottle.name = 'drink';
    const body = mesh(new THREE.CylinderGeometry(.65, .75, 3.4, 12), 0x377e51);
    const neck = mesh(new THREE.CylinderGeometry(.28, .35, 1.4, 12), 0x6daa67); neck.position.y = 2.3;
    const label = mesh(new THREE.CylinderGeometry(.67, .72, 1.4, 12), 0xefe3b6);
    bottle.add(body, neck, label); root.add(bottle);
    const grenade = mesh(new THREE.SphereGeometry(.8, 10, 8), 0x5e6b36); grenade.name = 'grenade'; root.add(grenade);
    root.visible = false; return root;
  }

  update(dt, {sprinting = false, aiming = false, moving = false, time = 0, grounded = true, verticalSpeed = 0} = {}) {
    this.meleePose?.restore();
    this.pose?.restore();
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    if (this.flash) { this.flash.visible = this.flashLeft > 0; this.flash.rotation.x += dt * 70; }
    this.timer -= dt;
    const action = this.action;
    if (action?.event && !action.fired && this.timer <= action.duration * (1 - action.at)) { action.fired = true; this.onAction(action.event); }
    if (this.timer <= 0 && !['idle', 'sprint', 'loading'].includes(this.state)) {
      const state = this.state;
      if (state === 'reload' && this.reloadSlot === this.current) {
        const slot = this.current, take = Math.min(slot.def.clip - slot.clip, slot.reserve);
        slot.clip += take; slot.reserve -= take;
      }
      this.state = state === 'sprintIn' && sprinting ? 'sprint' : 'idle';
      this.action = null;
      if (state === 'switching' && this.pendingSwitch !== null) {
        this.index = this.pendingSwitch; this.pendingSwitch = null;
        this.equip().catch(error => { this.state = 'idle'; this.onAction({error}); });
      }
    }
    if (this.rig && this.current) {
      if (sprinting && this.state === 'idle') this.playState('sprintIn', 'sprintIn', this.rig.duration('sprintIn') || .2);
      if (!sprinting && ['sprint', 'sprintIn'].includes(this.state)) this.playState('sprintOut', 'sprintOut', this.rig.duration('sprintOut') || .2);
      if (this.state === 'sprint') this.rig.play(this.rig.has('sprintLoop') ? 'sprintLoop' : 'idle');
      if (this.state === 'idle') {
        this.rig.play(this.current.clip === 0 && this.rig.has('idleEmpty') ? 'idleEmpty' : 'idle');
        if (this.current.clip === 0 && this.current.reserve > 0 && !sprinting) this.reload();
      }
      this.rig.update(dt);
    }
    const wantAim = aiming && readyStates.has(this.state) && !sprinting && Boolean(this.current);
    this.ads = THREE.MathUtils.clamp(this.ads + (wantAim ? dt : -dt) * 5, 0, 1);
    const ads = smooth(this.ads);
    this.recoil *= Math.exp(-dt * 13);
    this.sway.multiplyScalar(Math.exp(-dt * 10));
    const bob = moving && grounded ? (1 - ads) * (sprinting ? .3 : .14) : 0;
    this.pivot.position.copy(this.hip).lerp(this.aim, ads);
    this.pivot.position.x += Math.sin(time * (sprinting ? 12 : 8)) * bob - this.sway.x * (1 - ads);
    this.pivot.position.y += Math.cos(time * (sprinting ? 24 : 16)) * bob * .5 + this.sway.y * (1 - ads);
    this.pivot.position.y -= THREE.MathUtils.clamp(verticalSpeed * .002, -.5, .5) * (1 - ads);
    this.pivot.position.z += this.recoil * .55;
    this.pivot.rotation.set(this.recoil * .018, -this.sway.x * .025, -Math.sin(time * 8) * bob * .025);
    const progress = action ? THREE.MathUtils.clamp(1 - this.timer / action.duration, 0, 1) : 0;
    const swing = Math.sin(progress * Math.PI);
    if (['grenade', 'drink', 'craft'].includes(this.state)) { this.pivot.position.y -= swing * 12; this.pivot.rotation.x -= swing * .5; }
    this.props.visible = ['drink', 'grenade'].includes(this.state);
    for (const prop of this.props.children) prop.visible = prop.name === this.state;
    this.props.position.set(3 - swing, -7 + swing * 4, -13);
    this.props.rotation.set(this.state === 'drink' ? -swing * 1.1 : 0, swing * .4, -swing * .4);
    this.camoTime.value = time;
    const aspect = this.camera.aspect;
    this.viewCamera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(65) / 2) * Math.max(1, (4 / 3) / aspect)));
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
    this.camera.fov = THREE.MathUtils.lerp(this.baseFov, Math.min(this.baseFov, 55), ads);
    this.camera.updateProjectionMatrix();
    this.pose?.apply(.2 + ads * .8);
    if (this.state === 'melee' && !this.rig?.has('melee')) this.meleePose?.apply(progress);
  }
}
