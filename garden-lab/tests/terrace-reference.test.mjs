import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {terraceGroundReference,observerForPreset,gardenGroundAt,floorElevation} from '../src/geometry.js';
import {terraceStairs} from '../src/layout.js';
import {getSiteProfile} from '../src/sites.js';
import {createStateModel} from '../src/state.js';
import {renderPlan} from '../src/diagrams.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('terrace grade uses its offset centreline and the same beyond-edge reference on sloping ground',()=>{
  const data={coordinates:{localOriginEN:[0,0],xUnitEN:[1,0],yUnitEN:[0,1]},
    terrain:{originEN:[0,0],columns:31,rows:41,cellSize:1,
      elevations:Array.from({length:31*41},(_,i)=>2+.1*(i%31)+.05*Math.floor(i/31))},
    site:{boundary:[[0,0],[30,0],[30,40],[0,40],[0,0]],rearMidpoint:[11,10],
      terrace:{x:3,y:10,width:7,depth:4},floorReference:{z:3}}};
  const state={floorHeight:1.7,gardenRaise:.5,terraceDepth:4};
  const result=terraceGroundReference(state,data);
  near(result.x,6.5);near(result.y,14.6);near(result.floorZ,4.7);
  near(result.groundZ,2+.65+.73+.5);near(result.drop,.82);
  assert.notEqual(result.x,data.site.rearMidpoint[0],'House midpoint is not the offset terrace centre');
  near(terraceGroundReference({...state,gardenRaise:.8},data).drop,result.drop-.3);
  near(terraceGroundReference({...state,terraceDepth:5},data).drop,result.drop-.05);
});

test('actual-property plan readout equals the grade used to size the rendered stairs',()=>{
  for(const[id,file]of[['sternicza-11','site-data.json'],['korzeniowskiego-40','korzeniowskiego-40.json']]){
    const data=JSON.parse(readFileSync(new URL(`../data/${file}`,import.meta.url)));
    const state=createStateModel(getSiteProfile(id,data)).DEFAULTS;
    const result=terraceGroundReference(state,data),t=data.site.terrace;
    const grade=gardenGroundAt(t.x+t.width/2,t.y+state.terraceDepth+.6,state,data);
    near(result.groundZ,grade);near(result.drop,floorElevation(state,data)-grade);
    const stairs=terraceStairs(t,state.terraceDepth,result.drop);
    near(stairs.drop,result.drop);
    const frame={dataset:{mapScope:'garden'},clientWidth:900,clientHeight:760,innerHTML:'',
      querySelectorAll(){return [];},querySelector(){return {addEventListener(){}};}};
    renderPlan(frame,data,state,observerForPreset('terrace',state,data),{rays:[]});
    assert.ok(frame.innerHTML.includes(`Terrace drop <b>${result.drop.toFixed(2)} m</b>`),id);
    assert.ok(frame.innerHTML.includes('centreline, 0.6 m beyond edge'),id);
    if(id==='korzeniowskiego-40')assert.equal(result.drop.toFixed(2),'1.34','Default published reference must not regress to house-midpoint 1.24 m');
  }
});
