import test from 'node:test';
import assert from 'node:assert/strict';
import {motionDiagnosticUrl,expectedDiagnosticSampling,diagnosticSamplingMatches} from '../scripts/motion-diagnostic-controls.mjs';

const base='http://127.0.0.1:43210',hash='v=36&site=sternicza-11&sceneMotion=false&livingCinemaLayout=right-media';
const fields=(label,samples,storage)=>({motionMsaaDiagnostic:label,motionSamples:samples,motionStorageSamples:storage});

test('alpha A/A and A/B retain the same pinned multisample fixture',()=>{
  const control=new URL(motionDiagnosticUrl(base,hash,{sampling:'keep',keepCoverage:true}));
  const optimized=new URL(motionDiagnosticUrl(base,hash,{sampling:'keep'}));
  for(const url of [control,optimized]){
    assert.equal(url.origin,base);assert.equal(url.pathname,'/');assert.equal(url.hash.slice(1),hash);
    assert.equal(url.searchParams.get('site'),'sternicza-11');assert.equal(url.searchParams.get('motionMsaa'),'keep');
    assert.equal(url.searchParams.has('gpuPhaseProfile'),false);
  }
  assert.equal(control.searchParams.get('motionAlphaCoverage'),'keep');assert.equal(optimized.searchParams.has('motionAlphaCoverage'),false);
  control.searchParams.delete('motionAlphaCoverage');assert.equal(control.href,optimized.href);
});

test('paired profiling selects keep and single explicitly without changing coverage or fixture',()=>{
  const control=new URL(motionDiagnosticUrl(base,hash,{sampling:'keep',profile:true}));
  const single=new URL(motionDiagnosticUrl(base,hash,{sampling:'single',profile:true}));
  for(const url of [control,single]){
    assert.equal(url.hash.slice(1),hash);assert.equal(url.searchParams.get('gpuPhaseProfile'),'1');
    assert.equal(url.searchParams.has('motionAlphaCoverage'),false);
  }
  assert.equal(control.searchParams.get('motionMsaa'),'keep');assert.equal(single.searchParams.get('motionMsaa'),'single');
  control.searchParams.delete('motionMsaa');single.searchParams.delete('motionMsaa');assert.equal(control.href,single.href);
});

test('diagnostics cannot silently use an absent or unknown Auto sampling request',()=>{
  for(const mode of [undefined,null,'','auto','control','high']){
    assert.throws(()=>expectedDiagnosticSampling(mode),/explicit keep or single/);
    assert.throws(()=>motionDiagnosticUrl(base,hash,{sampling:mode}),/explicit keep or single/);
  }
});

test('pinned multisampling rejects both adaptive fallback and an unpinned four-sample frame',()=>{
  assert.equal(diagnosticSamplingMatches(fields('keep',4,4),'keep'),true);
  for(const data of [fields(null,4,4),fields(null,0,1),fields('single',0,1),fields('keep',0,1),fields('keep',2,2),fields('keep',4,1),fields('keep','4',4),{}])
    assert.equal(diagnosticSamplingMatches(data,'keep'),false);
});

test('explicit single mode requires zero MSAA and one actual storage sample',()=>{
  assert.deepEqual(expectedDiagnosticSampling('single'),{label:'single',samples:0,storage:1});
  assert.equal(diagnosticSamplingMatches(fields('single',0,1),'single'),true);
  for(const data of [fields('single',0,0),fields('single',1,1),fields('single',4,4),fields('keep',0,1),fields(null,0,1),null])
    assert.equal(diagnosticSamplingMatches(data,'single'),false);
});

test('idle restoration preserves the explicit construction mode and clears active motion sample counts',()=>{
  for(const mode of ['keep','single']){
    assert.equal(diagnosticSamplingMatches(fields(mode,0,0),mode,{idle:true}),true);
    assert.equal(diagnosticSamplingMatches(fields(null,0,0),mode,{idle:true}),false);
    assert.equal(diagnosticSamplingMatches(fields(mode,4,4),mode,{idle:true}),false);
    assert.equal(diagnosticSamplingMatches(fields(mode,0,1),mode,{idle:true}),false);
  }
});

test('completed phase metadata must identify the same pinned mode as the live capture',()=>{
  const metadata={expectedPublicFrame:12,sceneBufferWidth:691,sceneBufferHeight:315,...fields('keep',4,4)};
  assert.equal(diagnosticSamplingMatches(metadata,'keep'),true);
  assert.equal(diagnosticSamplingMatches({...metadata,motionMsaaDiagnostic:null},'keep'),false);
  assert.equal(diagnosticSamplingMatches({...metadata,...fields('single',0,1)},'keep'),false);
});
