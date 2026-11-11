import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,sanitizeState,encodeState,decodeState,scenarioState} from '../src/state.js';
test('share links preserve fill, fixed floors, independent hedge heights and observer settings',()=>{
 const state={...DEFAULTS,hedgeRear:6,hedgeLeft:4,hedgeRight:2.5,gardenRaise:.5,bedRaise:.25,floorHeight:1.2,raiseNewHedges:false,preset:'custom',observerX:7.2,observerY:28,mode:'section',canopyEnabled:true,fasciaDepth:.35};
 const decoded=decodeState(encodeState(state));
 for(const key of Object.keys(state))assert.ok(typeof state[key]==='number'?Math.abs(decoded[key]-state[key])<.0001:decoded[key]===state[key],key);
});
test('untrusted URL fields cannot introduce invalid numerical or executable settings',()=>{
 const s=decodeState('#v=1&hedgeRear=Infinity&gardenRaise=-20&canopyWidth=1000&preset=%3Cscript%3E&mode=other&removeGarage=false');
 assert.equal(s.hedgeRear,2.5);assert.equal(s.gardenRaise,0);assert.equal(s.canopyWidth,11);assert.equal(s.preset,'sofa');assert.equal(s.mode,'orbit');assert.equal(s.removeGarage,false);
 assert.equal(Object.hasOwn(s,'v'),false);assert.deepEqual(sanitizeState(null),DEFAULTS);
});
test('scenario presets never silently change house floor elevation or viewpoint',()=>{
 const s=scenarioState('raised',{...DEFAULTS,floorHeight:1.65,preset:'jacuzzi',eyeHeight:.7});
 assert.equal(s.floorHeight,1.65);assert.equal(s.preset,'jacuzzi');assert.equal(s.bedRaise,.5);assert.equal(s.gardenRaise,0);assert.equal(s.hedgeRear,4);
});
