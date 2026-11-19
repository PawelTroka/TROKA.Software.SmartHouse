import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';

function fixture() {
  const listeners = new Map();
  const element = {
    style:{}, clientHeight:465, clientWidth:970,
    addEventListener(type, listener) {listeners.set(type, listener);},
    removeEventListener(type) {listeners.delete(type);},
    setPointerCapture() {}, releasePointerCapture() {},
  };
  const camera = new PerspectiveCamera(34,970/465,.035,140);
  camera.position.set(11.393448084450055,12.738133042137084,18.663080535084916);
  const controls = new OrbitControls(camera,element);
  controls.enableDamping = true;
  controls.dampingFactor = .13;
  // The original ground-floor fit exposed target clamp round-off on every frame.
  controls.target.set(5.385,.46,5.34);
  controls.update();
  const send = (type, fields) => listeners.get(type)?.({pointerId:1,pointerType:'mouse',button:2,clientX:100,clientY:100,...fields});
  return {camera,controls,send};
}

test('an unchanged original-floor camera does not keep requesting render frames',()=>{
  const {camera,controls} = fixture();
  const start = camera.position.clone();
  let changes = 0;
  controls.addEventListener('change',()=>changes++);
  for (let i=0;i<500;i++) assert.equal(controls.update(),false);
  assert.equal(changes,0);
  assert.ok(camera.position.distanceTo(start)<1e-10);
  controls.dispose();
});

test('a real pan still emits changes and settles after its damping tail',()=>{
  const {controls,send} = fixture();
  const start = controls.target.clone();
  let changes = 0;
  controls.addEventListener('change',()=>changes++);
  send('pointerdown');
  send('pointermove',{clientX:145,clientY:123});
  send('pointerup',{clientX:145,clientY:123});
  assert.ok(changes>0);
  for (let i=0;i<250;i++) controls.update();
  assert.ok(controls.target.distanceTo(start)>.1);
  const settled = changes;
  for (let i=0;i<250;i++) assert.equal(controls.update(),false);
  assert.equal(changes,settled);
  controls.dispose();
});
