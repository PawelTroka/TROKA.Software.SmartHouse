const percentile=(sorted,p)=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]??0;
export function frameTimeSummary(values){
  const sorted=Array.from(values).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
  if(!sorted.length)return {samples:0,p50:0,p95:0,p99:0,mean:0,onePercentLowFps:0,stalls50ms:0,stalls100ms:0,stalls250ms:0};
  const mean=sorted.reduce((s,n)=>s+n,0)/sorted.length,worst=sorted.slice(-Math.max(1,Math.ceil(sorted.length*.01)));
  return {samples:sorted.length,p50:percentile(sorted,.5),p95:percentile(sorted,.95),p99:percentile(sorted,.99),mean,
    onePercentLowFps:1000/(worst.reduce((s,n)=>s+n,0)/worst.length),
    stalls50ms:sorted.filter(n=>n>50).length,stalls100ms:sorted.filter(n=>n>100).length,stalls250ms:sorted.filter(n=>n>250).length};
}

/** Rolling samples contain only continuous navigation, so a resting/on-demand
 * renderer's seconds between frames are never misreported as frame stalls. */
export function createFramePerformance(capacity=360){
  const intervals=new Float64Array(capacity),cpu=new Float64Array(capacity);let count=0,cpuCount=0,index=0,cpuIndex=0,last=0;
  const phases=new Map();
  return {
    begin(now,active){const delta=active&&last?now-last:0;last=active?now:0;if(delta>0){intervals[index++%capacity]=delta;count++;}return delta;},
    end(milliseconds,active){if(active&&Number.isFinite(milliseconds)){cpu[cpuIndex++%capacity]=milliseconds;cpuCount++;}},
    phase(name,milliseconds,active){
      if(!active||!Number.isFinite(milliseconds)||milliseconds<0)return;
      if(!phases.has(name))phases.set(name,{values:new Float64Array(capacity),count:0});
      const phase=phases.get(name);phase.values[phase.count++%capacity]=milliseconds;
    },
    reset(){count=cpuCount=index=cpuIndex=last=0;phases.clear();},
    getDiagnostics(){return {scope:'continuous-navigation',windowFrames:capacity,totalNavigationFrames:count,
      frameTimeMs:frameTimeSummary(intervals.subarray(0,Math.min(count,capacity))),cpuFrameMs:frameTimeSummary(cpu.subarray(0,Math.min(cpuCount,capacity))),
      phasesMs:Object.fromEntries([...phases].map(([name,phase])=>[name,frameTimeSummary(phase.values.subarray(0,Math.min(phase.count,capacity)))]))};},
  };
}

/** Learn a bounded motion buffer from delivered frame cadence. A gesture may
 * only move toward a cheaper level, at most once per 900 ms. Keeping the learned
 * level between gestures prevents alternating full/low buffers every second;
 * idle rendering always restores the selected still-image quality separately.
 */
export function createAdaptiveMotionQuality(){
  const scales=[1,.84,.68,.54],samples=[];let level=0,lastChange=-Infinity,lastEvaluation=0,changes=0,p75=0,pressureChanges=0,lastPressureAgeMs=0;
  return {
    sample(now,delta,active){
      if(!active||!(delta>0)){samples.length=0;return false;}
      samples.push(delta);if(samples.length>32)samples.shift();
      if(samples.length<8||now-lastEvaluation<450||now-lastChange<900)return false;
      lastEvaluation=now;const sorted=samples.slice().sort((a,b)=>a-b);p75=percentile(sorted,.75);
      if(p75<=24||level>=scales.length-1)return false;
      level++;changes++;lastChange=now;samples.length=0;return true;
    },
    // The caller must have observed two unretired fences and a nonblocking
    // TIMEOUT_EXPIRED while navigation is active. Severe queue pressure must
    // not wait for eight multi-second submissions before choosing the next
    // existing scale. This only changes policy state; resize waits for a slot.
    pressure(now,oldestPendingMs){
      if(!Number.isFinite(now)||!Number.isFinite(oldestPendingMs)||oldestPendingMs<=250||
        level>=scales.length-1||now-lastChange<900)return false;
      level++;changes++;pressureChanges++;lastPressureAgeMs=oldestPendingMs;
      lastChange=now;lastEvaluation=now;samples.length=0;return true;
    },
    reset(){level=0;changes=0;lastChange=-Infinity;lastEvaluation=0;samples.length=0;p75=0;pressureChanges=0;lastPressureAgeMs=0;},
    get scale(){return scales[level];},
    getDiagnostics(){return {mode:'measured-motion-buffer',level,scale:scales[level],changes,lastP75Ms:p75,targetMs:24,minimumScale:scales.at(-1),cooldownMs:900,
      pressureChanges,lastPressureAgeMs,pressureThresholdMs:250,recoversAtRest:true};},
  };
}
