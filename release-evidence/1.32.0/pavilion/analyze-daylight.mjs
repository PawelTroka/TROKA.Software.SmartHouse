// Reproduce the live Beach House pavilion height comparison without changing
// the repository. Run: node analyze-daylight.mjs [garden-lab directory]
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const outputDir=dirname(fileURLToPath(import.meta.url));
const root=resolve(process.argv[2]||resolve(outputDir,'../smarthouse/garden-lab'));
const repo=dirname(root),expectedHead='5ca6301ce7181fe4eda66564828fc576b89fce63';
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),expectedHead,'This comparison is pinned to the requested source head');
assert.equal(git('status','--porcelain','--','garden-lab/src','garden-lab/data'),'','Analysis inputs must match the source commit');
const module=filename=>import(pathToFileURL(resolve(root,'src',filename)).href);
const [{createStateModel},{getSiteProfile},{changePresentationSettings},{applyPlanExterior},{applyBuildingOverrides},
  {PAVILION_PLACEMENTS},{privacyStructures},{analyzeSunlight,prepareSunGeometry},{sunForSettings},{existingVegetationSummary}]=
  await Promise.all(['state.js','sites.js','studio-state.js','plan-exterior.js','buildings.js','corner-pavilion.js','geometry.js',
    'shade.js','solar.js','existing-vegetation.js'].map(module));
const hash=value=>createHash('sha256').update(value).digest('hex');
const files=['site-data.json','sternicza-surrounding-nature.json','sternicza-neighbor-roofs.json','sternicza-ground-colour.json'];
const inputs=await Promise.all(files.map(async name=>{const bytes=await readFile(resolve(root,'data',name));return {name,hash:hash(bytes),data:JSON.parse(bytes)};}));
const source=inputs[0].data;
source.existingVegetation=inputs[1].data;source.neighborRoofObservations=inputs[2].data;source.contextGroundColour=inputs[3].data;
const model=createStateModel(getSiteProfile('sternicza-11',source));
const styleSettings=model.sanitizeState(changePresentationSettings(model.DEFAULTS,{designStyle:'beach-house'}));
const base=model.sanitizeState({...styleSettings,pavilionEnabled:true,sunEnabled:true,existingVegetation:true,
  existingCanopyAnalysis:true,existingLeafMode:'auto',treeLeafMode:'auto'});
const moments=[{date:'2026-06-21',minutes:540},{date:'2026-06-21',minutes:720},{date:'2026-06-21',minutes:1080},
  {date:'2026-12-21',minutes:720}];
const zoneNames=['garden','terrace','pool'];
const receiverRecord=({x,y,z,size,zone,sampleX,sampleY})=>({x,y,z,size,zone,...(sampleX===undefined?{}:{sampleX,sampleY})});
const clock=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
const out={sourceHead:expectedHead,packageVersion:JSON.parse(await readFile(resolve(root,'package.json'),'utf8')).version,
  inputs:inputs.map(({name,hash})=>({file:relative(repo,resolve(root,'data',name)),sha256:hash})),
  settingsBase:base,
  setup:'The same data loading, state sanitization, first style adoption and applyPlanExterior(applyBuildingOverrides(...)) path as the live app. Both heights keep the pavilion enabled and retain the same alternative garden, mapped vegetation, proposed planting, house renovation, hedges and pool. Auto foliage gives summer crowns in June and the existing model leaf-off treatment in December. Heights are above the lowest original terrain corner.',
  scope:'Snapshot direct-sun visibility at outdoor sample receivers, not irradiance, sunshine hours, indoor daylight or a regulatory insolation assessment.',
  placements:[]};

for(const placement of PAVILION_PLACEMENTS){
  const proposal={id:placement.id,label:placement.label,settings:placement.settings,moments:[]};
  let placementReceiverHash;
  for(const moment of moments){
    const result={date:moment.date,localTime:clock(moment.minutes),heights:[],differences:{}};
    const analyses=[];
    for(const height of [6.5,8]){
      const settings=model.sanitizeState({...base,...placement.settings,pavilionHeight:height,sunDate:moment.date,sunMinutes:moment.minutes});
      const data=applyPlanExterior(applyBuildingOverrides(source,settings),settings);
      const sun=sunForSettings(settings,data),prepared=prepareSunGeometry(settings,data),shade=analyzeSunlight(settings,data,sun);
      const receivers=prepared.cells.map(receiverRecord),receiverHash=hash(JSON.stringify(receivers));
      placementReceiverHash??=receiverHash;
      assert.equal(receiverHash,placementReceiverHash,'Receiver positions/zones changed within '+placement.id);
      assert.equal(shade.status,'daylight','Requested moment must have sun above the horizon');
      const p=privacyStructures(settings,data).pavilion;
      assert.equal(p.enabled,true);assert.equal(data.site.house.architecturalModel?.styleId??settings.designStyle,'beach-house');
      result.heights.push({height,roofZ:p.topZ,floorZ:p.floorZ,storeys:p.storeys.length,receiverHash,
        solar:{timeZone:sun.timeZone,utcISO:sun.utcISO,azimuth:sun.azimuth,elevation:sun.elevation,direction:sun.direction},
        vegetation:existingVegetationSummary(data,settings),zones:Object.fromEntries(zoneNames.map(zone=>[zone,shade.zones[zone]])),
        allZones:shade.zones});
      analyses.push(shade);
      out.modelNote??=shade.modelNote;out.method??=shade.method;out.limitations??=shade.limitations;
    }
    for(const zone of zoneNames){
      const low=analyses[0].cells.filter(c=>c.zone===zone),high=analyses[1].cells.filter(c=>c.zone===zone);
      const changed=low.flatMap((a,i)=>{
        const b=high[i];assert.deepEqual(receiverRecord(a),receiverRecord(b));
        return a.sunlit===b.sunlit?[]:[{x:a.x,y:a.y,z:a.z,change:b.sunlit?'gained':'lost',
          lowBlocker:a.blockedBy,lowLabel:a.blockedLabel,highBlocker:b.blockedBy,highLabel:b.blockedLabel}];
      });
      result.differences[zone]={total:low.length,lowSunlit:result.heights[0].zones[zone].sunlit,highSunlit:result.heights[1].zones[zone].sunlit,
        netSunlit:result.heights[1].zones[zone].sunlit-result.heights[0].zones[zone].sunlit,
        percentagePoints:result.heights[1].zones[zone].percent-result.heights[0].zones[zone].percent,
        lost:changed.filter(c=>c.change==='lost').length,gained:changed.filter(c=>c.change==='gained').length,changed};
    }
    proposal.moments.push(result);
    console.log(placement.id+' '+moment.date+' '+clock(moment.minutes)+' '+zoneNames.map(zone=>{
      const d=result.differences[zone];return `${zone} ${d.lowSunlit}/${d.total}→${d.highSunlit}/${d.total} (${d.percentagePoints.toFixed(2)} pp)`;
    }).join('; '));
  }
  proposal.receiverHash=placementReceiverHash;out.placements.push(proposal);
}
assert.equal(git('rev-parse','HEAD'),expectedHead,'Source head changed while calculating');
assert.equal(git('status','--porcelain','--','garden-lab/src','garden-lab/data'),'','Analysis inputs changed while calculating');
await mkdir(outputDir,{recursive:true});
await writeFile(resolve(outputDir,'daylight-comparison.json'),JSON.stringify(out,null,2)+'\n');
