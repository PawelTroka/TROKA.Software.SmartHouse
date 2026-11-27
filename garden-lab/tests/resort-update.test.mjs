import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hstPanelLayout} from '../src/hst-system.js';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {applyPlanExterior} from '../src/plan-exterior.js';
import {jacuzziBounds,terraceCover} from '../src/geometry.js';

const source=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const model=createStateModel(getSiteProfile('sternicza-11',source));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('the three-track HST closes fully and slides two full leaves onto the left fixed leaf',()=>{
  for(const width of [3,8.5,10.36]){
    const opening={offset:.03,width};
    const closed=hstPanelLayout(opening,{hstOpen:0}),open=hstPanelLayout(opening,{hstOpen:1});
    assert.equal(open.panels.length,3);assert.equal(open.panels.filter(p=>p.fixed).length,1);
    near(closed.clear.width,0);near(open.clear.width,(width-2*open.frameWidth)*2/3);
    assert.equal(new Set(open.panels.map(p=>p.track)).size,3);
    for(const leaf of open.panels)near(leaf.lo,open.panels[0].lo);
    for(let step=0;step<=10;step++){
      const x=step/10,s=hstPanelLayout(opening,{hstOpen:x});
      near(s.clear.width,open.clear.width*x);near(s.panels[0].lo,closed.panels[0].lo);
      assert.ok(s.panels.every(p=>p.lo>=opening.offset&&p.hi<=opening.offset+width));
    }
  }
});

test('the spa stays at the deck centroid in both axes when deck dimensions change',()=>{
  for(const terraceWidth of [8.5,10.77])for(const terraceDepth of [4,4.5,6]){
    const s={...model.DEFAULTS,designStyle:'hidden-bali',terraceWidth,terraceDepth,jacuzziCentered:true};
    const data=applyPlanExterior(source,s),t=data.site.terrace,tub=jacuzziBounds(s,data);
    near((tub.x0+tub.x1)/2,t.x+t.width/2);
    near((tub.y0+tub.y1)/2,data.site.rearMidpoint[1]+terraceDepth/2);
    assert.ok(tub.x0-t.x>=.6&&t.x+t.width-tub.x1>=.6);
    assert.ok(tub.y0-data.site.rearMidpoint[1]>=.6&&data.site.rearMidpoint[1]+terraceDepth-tub.y1>=.6);
    for(const terraceCoverType of ['canopy','balcony']){
      const cover=terraceCover({...s,terraceCoverType,canopyEnabled:true},data);
      assert.equal(cover.supportSystem,'cantilever');assert.deepEqual(cover.supports,[]);
    }
  }
});

test('new controls round-trip while historical shared designs retain their layout',()=>{
  const state=model.sanitizeState({...model.DEFAULTS,mode:'walk',hstOpen:.43,poolSunbedSides:2,jacuzziMood:'amber',sceneMotion:false});
  assert.deepEqual(model.decodeState(model.encodeState(state)),state);
  const old=model.decodeState('v=29&site=sternicza-11');
  assert.equal(old.summerPoolLayout,false);assert.equal(old.jacuzziCentered,false);assert.equal(old.hstOpen,0);
  assert.deepEqual(model.decodeState(model.encodeState(old)),old);
  const adopted=model.migrateSavedState(old,29,{adoptResortUpdate:true});
  assert.equal(adopted.summerPoolLayout,true);assert.equal(adopted.jacuzziCentered,true);assert.equal(adopted.hstOpen,1);
  assert.deepEqual(adopted.screeningTrees,old.screeningTrees,'Adopting the new layout preserves the earlier planting');
  assert.notDeepEqual(adopted.screeningTrees,model.DEFAULTS.screeningTrees,'Current preset pines must not overwrite an earlier active design');
  assert.deepEqual(model.decodeState(model.encodeState(adopted)),adopted);
  const custom={...old,nightGardenIntensity:19,screeningTrees:old.screeningTrees.map((t,i)=>({...t,crownWidth:i===0?2.7:t.crownWidth}))};
  const kept=model.migrateSavedState(custom,29,{adoptResortUpdate:true});
  assert.deepEqual(kept.screeningTrees,custom.screeningTrees);assert.equal(kept.nightGardenIntensity,19);
});
