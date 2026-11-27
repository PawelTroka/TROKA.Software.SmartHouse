/** Reproduce the requested nearest-pine correction from the public viewpoint.
 * Run: node scripts/boundary-pine-study.mjs
 * The other two trees, neighbouring building and observer do not move.
 */
import fs from 'node:fs';
import {resolve} from 'node:path';
import {ROOT,studyInput} from './garden-study-support.mjs';
import {DEFAULTS} from '../src/state.js';
import {changePresentationSettings} from '../src/studio-state.js';
import {CLOSE_GROVE_TREE_POSITIONS,BOUNDARY_PINE_TREE_POSITIONS} from '../src/summer-garden.js';
import {observerForPreset,jacuzziBounds} from '../src/geometry.js';
import {analyzeFacadeVisibility} from '../src/facade-visibility.js';
import {screeningTreeVolumes} from '../src/screening-trees.js';
import {poolBounds} from '../src/garden-program.js';
import {closestBoundary,closestFootprints} from '../src/dimensions.js';
import {rectCorners} from '../src/layout.js';

const treeStock={typeId:'austrian-pine-tall',height:9.5,crownBase:2.5,crownWidth:5,crownDepth:5,rotation:0,enabled:true,unitPrice:0};
const records=positions=>positions.map(([x,y],i)=>({...treeStock,id:`pine-${i+1}`,x,y}));
const before=records(CLOSE_GROVE_TREE_POSITIONS),after=records(BOUNDARY_PINE_TREE_POSITIONS);
const round=x=>Math.round(x*10000)/10000;
const adoption=changePresentationSettings({...DEFAULTS,designStyle:'current'},{designStyle:'scandinavian'});
const scenarios=[['original-finish-default',DEFAULTS],['scandinavian-adoption',adoption]];
const studies=[];
for(const [id,input] of scenarios){
  const {data,settings,evidence}=studyInput({...input,screeningTrees:before});
  // This is the public preset operation in app.js: resolve its own eye height.
  const seated=observerForPreset('jacuzzi',{...settings,eyeHeight:undefined},data),tub=jacuzziBounds(settings,data);
  const viewpoints=[{id:'jacuzzi-seated-preset',...seated},
    {id:'jacuzzi-water-eye',...seated,z:tub.waterZ+.32,eyeHeight:.32,groundZ:tub.waterZ,surface:'jacuzzi-water'}];
  // Include both ends of the seat ring, without claiming all possible poses.
  for(const [name,index]of [['jacuzzi-east-seat',3],['jacuzzi-west-seat',6]]){
    const [x,y]=tub.seatCentres[index];viewpoints.push({id:name,...seated,x,y});
  }
  const views=viewpoints.map(view=>{
    const score=trees=>{const a=analyzeFacadeVisibility(view,'building-9',{...settings,screeningTrees:trees},data,{spacing:.25});
      return {blocked:a.total-a.visible,visible:a.visible,total:a.total,blockedPercent:round(a.blockedPercent)};};
    return {id:view.id,observer:{x:view.x,y:view.y,z:view.z,eyeHeight:view.eyeHeight,surface:view.surface},before:score(before),after:score(after)};
  });
  const pool=poolBounds(settings,data),pine=after[1],volume=screeningTreeVolumes({...settings,screeningTrees:after},data)[1];
  studies.push({id,style:settings.designStyle,terraceWidth:settings.terraceWidth,terraceDepth:settings.terraceDepth,
    terraceCoverType:settings.terraceCoverType,canopyEnabled:settings.canopyEnabled,evidence,views,
    nearestPine:{id:pine.id,before:[before[1].x,before[1].y],after:[pine.x,pine.y],stock:treeStock,
      trunkToLeftBoundary:round(closestBoundary([[pine.x,pine.y]],data,'left').distance),
      trunkToCoping:round(closestFootprints([[pine.x,pine.y]],rectCorners(pool,pool.coping)).distance),
      plantable:volume.plantable,crownInside:volume.crownInside,warnings:volume.warnings}});
}
const result={target:'PCK3 / building-9',facadeSpacing:.25,
  method:'The public named jacuzzi preset and three additional fixed spa positions, using the same mapped building, registered house, existing vegetation, terrain, hedges and finite purchased-size tree crowns as the app. Only pine-2 moves; its stock and both other pines are fixed.',
  limitations:'Facade sample counts are geometric screening estimates, not visible area. Ideal dense crown volumes cannot guarantee continuous real foliage. PCK3 remains partly visible. Crown overhang remains explicit; the illustrative trunk-to-coping gap is not a certified root-ball or excavation clearance.',
  before,after,studies};
fs.writeFileSync(resolve(ROOT,'data/boundary-pine-1.39.json'),JSON.stringify(result,null,2)+'\n');
for(const s of studies)console.log(JSON.stringify({scenario:s.id,terrace:[s.terraceWidth,s.terraceDepth],views:s.views,nearestPine:s.nearestPine}));
