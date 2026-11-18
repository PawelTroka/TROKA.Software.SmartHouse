import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStateModel} from '../src/state.js';
import {getSiteProfile} from '../src/sites.js';
import {garagePresetState} from '../src/garage-options.js';
import {garageLayout,garageVehiclePose} from '../src/garage-ramp.js';
import {garageProfileSVG,garageParkingPlanSVG,garageClearanceResult,garageConfigurationWarnings} from '../src/garage-controls.js';
import {terrainAt} from '../src/geometry.js';

const data=JSON.parse(readFileSync(new URL('../data/site-data.json',import.meta.url)));
const model=createStateModel(getSiteProfile('sternicza-11',data));

test('equal-scale profile renders real wheel and car poses while full-drive assessment stays unchanged',()=>{
  const settings=garagePresetState('raised',model.DEFAULTS),layout=garageLayout(settings,data,{terrainAt});
  const before=JSON.stringify(layout.assessment),views=[];
  for(const [progress,reverse] of [[0,false],[.4,false],[1,false],[.4,true]]){
    const pose=garageVehiclePose(layout,progress,reverse),svg=garageProfileSVG(layout,pose);
    assert.match(svg,/data-scale="equal"/);
    assert.match(svg,/role="img"/);
    assert.match(svg,/fill="#4f8a76"/,'The car body must be drawn from the model transform');
    assert.match(svg,/fill="#343a35"/,'Real wheel centres and tyre radii must be drawn');
    assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
    assert.match(svg,/full front yard/);
    views.push(svg);
  }
  assert.equal(new Set(views).size,views.length,'Moving or reversing the car changes its drawing');
  assert.equal(JSON.stringify(layout.assessment),before,'Preview drawing cannot change the full-sweep result');
});

test('displayed reserve accounts for the numerical guard and remains separate from headroom or geometry',()=>{
  const base={minimumClearance:.0417,conservativeClearance:.0407,numericalAllowance:.001,
    requiredMargin:.03,minCoveredHeadroom:2.253,status:'conditional-clearance'};
  assert.equal(garageClearanceResult({assessment:base}).status,'reserve-met');
  assert.doesNotMatch(garageClearanceResult({assessment:base}).label,/safe|approved|compliant/i);
  assert.equal(garageClearanceResult({assessment:{...base,minimumClearance:.0306,conservativeClearance:.0296}}).status,'reserve-shortfall');
  assert.equal(garageClearanceResult({assessment:{...base,minimumClearance:-.004,conservativeClearance:-.005,status:'contact'}}).status,'contact');
  assert.equal(garageClearanceResult({assessment:{...base,minCoveredHeadroom:2.15,status:'geometry-limit'}}).status,'headroom-shortfall');
  assert.equal(garageClearanceResult({assessment:{...base,status:'geometry-limit'}}).status,'geometry-limit');
  assert.equal(garageClearanceResult(null).status,'unavailable');
});

test('both contrasting garage presets report their own clearance result',()=>{
  const raised=garageLayout(garagePresetState('raised',model.DEFAULTS),data,{terrainAt});
  const front=garageLayout(garagePresetState('forecourt',model.DEFAULTS),data,{terrainAt});
  const deep=garageLayout(garagePresetState('deeper',model.DEFAULTS),data,{terrainAt});
  assert.equal(garageClearanceResult(raised).status,'structure-conflict');
  assert.notEqual(garageClearanceResult(front).status,'reserve-met');
  assert.notEqual(garageClearanceResult(deep).status,'reserve-met');
  assert.ok(raised.assessment.minCoveredHeadroom>=2.2);
  assert.ok(raised.assessment.conservativeClearance>=.03);
});

test('the profile card exposes required controls, result text and primary assumptions without duplicate IDs',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ['basement-garage-controls','basementGarageEnabled','garage-profile-card','garage-profile',
    'garageProgress','garage-result','garage-forward-clearance','garage-reverse-clearance',
    'garage-level-controls','garage-ramp-controls','garage-car-controls','cost-garage-controls']){
    assert.ok(ids.includes(id),id+' is present');
  }
  assert.ok(html.indexOf('id="garage-profile-card"')>html.indexOf('class="viewer-card"'));
  assert.match(html,/data\/garage-sources\.json/);
  assert.match(html,/MG Cyberster/);
  assert.match(html,/door-opening envelopes remain unverified/);
});

test('visible warnings identify configuration failures while generic assumptions remain expandable',()=>{
  const settings=garagePresetState('raised',model.DEFAULTS),raised=garageLayout(settings,data,{terrainAt});
  assert.ok(garageConfigurationWarnings(raised).some(note=>/retained stair.*flue/i.test(note)), 'Documented structural obstructions remain visible even when the closed car clears the ramp');
  for(const id of ['forecourt','deeper']){
    const warnings=garageConfigurationWarnings(garageLayout(garagePresetState(id,model.DEFAULTS),data,{terrainAt}));
    assert.ok(warnings.length>0,id);
    assert.ok(warnings.every(note=>!/Concept only|Quasi-static|tyre radii are nominal|not surveyed|bottom curve continues/i.test(note)));
  }
  assert.ok(garageConfigurationWarnings({...raised,clearWidth:2.8,assessment:{...raised.assessment,widthBenchmarkPass:false}}).some(note=>/width/.test(note)));
  assert.ok(garageConfigurationWarnings({...raised,assessment:{...raised.assessment,minCoveredHeadroom:2.1}}).some(note=>/headroom/.test(note)));
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="garage-model-assumptions"/);
  assert.match(html,/Entry detail unresolved/);
});

test('the dimensioned parking plan and width warning use both actual vehicle envelopes',()=>{
  const settings=garagePresetState('raised',model.DEFAULTS),layout=garageLayout(settings,data,{terrainAt}),svg=garageParkingPlanSVG(layout);
  assert.match(svg,/data-spaces="2"/);assert.match(svg,/data-width-pass="true"/);
  assert.equal([...svg.matchAll(/data-car="[12]"/g)].length,2);
  assert.equal([...svg.matchAll(/data-length="4.535"/g)].length,2);
  assert.equal([...svg.matchAll(/data-mirror-width="2.11"/g)].length,2);
  assert.match(svg,/5.80 m clear/);assert.match(svg,/doors closed/);
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  const narrow=garageLayout({...settings,garageRampWidth:3.2},data,{terrainAt});
  assert.equal(garageClearanceResult(narrow).status,'geometry-limit');
  assert.match(garageClearanceResult(narrow).label,/too narrow for 2 cars/);
  assert.ok(garageConfigurationWarnings(narrow).some(note=>/5.42 m clear width/.test(note)));
  assert.match(garageParkingPlanSVG(narrow),/data-width-pass="false"/);
  const old=garageLayout({...settings,garageSpaces:1,garageRampWidth:3.2},data,{terrainAt});
  assert.equal([...garageParkingPlanSVG(old).matchAll(/data-car="/g)].length,2);
  assert.match(garageParkingPlanSVG(old),/5.80 m clear/);
});
