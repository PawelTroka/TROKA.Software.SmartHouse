import assert from 'node:assert/strict';

/** The fixed SwiftShader comparison explicitly selects its sampling mode.
 * An absent/unknown mode would exercise adaptive Auto and invalidate a control.
 */
export function expectedDiagnosticSampling(mode){
  assert.ok(mode==='keep'||mode==='single','Motion diagnostics require explicit keep or single sampling');
  return mode==='keep'?{label:'keep',samples:4,storage:4}:{label:'single',samples:0,storage:1};
}

export function motionDiagnosticUrl(base,fixtureHash,{sampling,profile=false,keepCoverage=false}={}){
  expectedDiagnosticSampling(sampling);
  const url=new URL('/',base);
  url.searchParams.set('site','sternicza-11');
  if(profile)url.searchParams.set('gpuPhaseProfile','1');
  url.searchParams.set('motionMsaa',sampling);
  if(keepCoverage)url.searchParams.set('motionAlphaCoverage','keep');
  url.hash=fixtureHash;
  return url.href;
}

/** Validate either live-canvas fields or actual completed phase metadata.
 * At idle the construction request persists, while no motion target is active.
 */
export function diagnosticSamplingMatches(data,mode,{idle=false}={}){
  const expected=expectedDiagnosticSampling(mode);
  return data?.motionMsaaDiagnostic===expected.label&&
    data.motionSamples===(idle?0:expected.samples)&&data.motionStorageSamples===(idle?0:expected.storage);
}
