import {getBuildingTargets} from './buildings.js?v=1.14.0';
import {getScreeningLayouts} from './screening-layouts.js?v=1.14.0';

export const DEFAULT_SITE_ID = 'sternicza-11';
export const SITE_OPTIONS = Object.freeze([
  Object.freeze({id:DEFAULT_SITE_ID,label:'Sternicza 11',address:'Sternicza 11, Gdańsk Brzeźno',streetLabel:'STERNICZA',dataPath:'data/site-data.json'}),
  Object.freeze({id:'korzeniowskiego-40',label:'Korzeniowskiego 40',address:'Korzeniowskiego 40, Gdańsk Brzeźno',streetLabel:'KORZENIOWSKIEGO',dataPath:'data/korzeniowskiego-40.json'}),
]);
const known = id => SITE_OPTIONS.some(site=>site.id===id);
const finite = (value,fallback) => Number.isFinite(value)?value:fallback;
const wrap = angle => ((angle%360)+360)%360;
const cardinal = angle => ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(wrap(angle)/22.5)%16];

/** Property-aware v6–v16 share links win; older links always refer to Sternicza. */
export function resolveSiteId(search='',hash='') {
  const params=new URLSearchParams(String(search).replace(/^\?/,''));
  const shared=new URLSearchParams(String(hash).replace(/^#/,''));
  const version=shared.get('v');
  if(['6','7','8','9','10','11','12','13','14','15','16'].includes(version))return known(shared.get('site'))?shared.get('site'):DEFAULT_SITE_ID;
  if(['1','2','3','4','5'].includes(version))return DEFAULT_SITE_ID;
  return known(params.get('site'))?params.get('site'):DEFAULT_SITE_ID;
}

function boundaryBounds(boundary) {
  if(!boundary?.length)return null;
  return {minX:Math.min(...boundary.map(p=>p[0])),maxX:Math.max(...boundary.map(p=>p[0])),
    minY:Math.min(...boundary.map(p=>p[1])),maxY:Math.max(...boundary.map(p=>p[1]))};
}

function rearBoundaryY(x,boundary,fallback) {
  const hits=[];
  for(let i=0;i<(boundary?.length||0);i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length];
    if(Math.abs(a[0]-b[0])<1e-8){if(Math.abs(x-a[0])<1e-8)hits.push(a[1],b[1]);continue;}
    const t=(x-a[0])/(b[0]-a[0]);if(t>=0&&t<=1)hits.push(a[1]+t*(b[1]-a[1]));
  }
  return hits.length?Math.max(...hits):fallback;
}

/** Geographic metadata and design limits are evaluated from the selected data. */
export function getSiteProfile(siteId=DEFAULT_SITE_ID,data) {
  const option=SITE_OPTIONS.find(site=>site.id===siteId)||SITE_OPTIONS[0];
  const legacy=option.id===DEFAULT_SITE_ID,site=data?.site||{},coordinates=data?.coordinates||{};
  if(site.id&&site.id!==option.id)throw new Error('Site dataset does not match the selected property.');
  const bounds=boundaryBounds(site.boundary)||(legacy?{minX:0,maxX:20.320901257,maxY:38.21412931,minY:0}:null);
  const sideLabels={left:legacy?'east':'west',right:legacy?'west':'east',...(site.sideLabels||{})};
  const latitude=finite(coordinates.latitude,legacy?54.405452:undefined),longitude=finite(coordinates.longitude,legacy?18.6312142:undefined);
  const convergence=finite(coordinates.gridConvergenceDegrees,Number.isFinite(latitude)&&Number.isFinite(longitude)
    ?Math.atan(Math.tan((longitude-19)*Math.PI/180)*Math.sin(latitude*Math.PI/180))*180/Math.PI:0);
  const uy=coordinates.yUnitEN,ux=coordinates.xUnitEN;
  const rearBearing=wrap(finite(coordinates.yGridAzimuth,uy?Math.atan2(uy[0],uy[1])*180/Math.PI:legacy?203.43086313576222:28.4)+convergence);
  const leftBearing=wrap(ux?Math.atan2(ux[0],ux[1])*180/Math.PI+convergence:rearBearing-90);
  const rear=site.rearMidpoint||[9.6091676564,18.0150830369];
  const terrace=site.terrace;
  const screeningLayouts=getScreeningLayouts(option.id),startingLayout=screeningLayouts.find(layout=>layout.id==='default');
  const defaults=legacy?{hedgeFront:4,...startingLayout?.settings,screeningTrees:startingLayout?.trees||Object.freeze([])}:{floorHeight:1.7,hedgeRear:4,hedgeLeft:4,hedgeRight:4,hedgeFront:0,gardenRaise:.5,removeGarage:true};
  const fieldOverrides={
    hedgeLeft:{label:`Left hedge · ${sideLabels.left}`},hedgeRight:{label:`Right hedge · ${sideLabels.right}`},
    costTreePriceLeft:{label:`Left / ${sideLabels.left}: custom tree price`},
    costTreePriceRight:{label:`Right / ${sideLabels.right}: custom tree price`},
  };
  if(!legacy&&bounds&&terrace){
    const rearLimit=Math.min(rearBoundaryY(terrace.x,site.boundary,bounds.maxY),rearBoundaryY(terrace.x+terrace.width,site.boundary,bounds.maxY));
    let availableDepth=Math.max(.1,rearLimit-rear[1]-.5);
    const pool=site.pool;
    if(pool&&pool.x<terrace.x+terrace.width&&pool.x+pool.width>terrace.x&&pool.y>rear[1])availableDepth=Math.min(availableDepth,pool.y-rear[1]-.5);
    const maxDepth=Math.max(.1,Math.min(6,Math.floor(availableDepth*10)/10));
    const minDepth=Math.min(3,maxDepth),depth=Math.max(minDepth,Math.min(maxDepth,finite(terrace.depth,4.2)));
    const canopyWidth=Math.min(terrace.width,11);
    const garden=site.observers?.garden;
    const gardenX=Array.isArray(garden)?garden[0]:garden?.x;
    const gardenY=Array.isArray(garden)?garden[1]:garden?.y;
    Object.assign(defaults,{terraceDepth:depth,canopyDepth:depth,canopyWidth,observerX:finite(gardenX,rear[0]),observerY:finite(gardenY,(rear[1]+depth+bounds.maxY)/2)});
    Object.assign(fieldOverrides,{
      terraceDepth:{min:minDepth,max:maxDepth,value:depth},canopyDepth:{min:Math.min(1,maxDepth),max:maxDepth,value:depth},
      canopyWidth:{min:Math.min(4,canopyWidth),max:canopyWidth,value:canopyWidth},
      observerX:{min:bounds.minX+.05,max:bounds.maxX-.05,value:defaults.observerX},
      observerY:{min:bounds.minY+.05,max:bounds.maxY-.05,value:defaults.observerY},
    });
  }
  return Object.freeze({...option,address:site.address||option.address,streetLabel:site.streetLabel||option.streetLabel,
    latitude,longitude,gridConvergenceDegrees:convergence,bounds,sideLabels,
    rearBearing,rearBearingLabel:cardinal(rearBearing),frontBearingLabel:cardinal(rearBearing+180),
    leftBearingLabel:cardinal(leftBearing),rightBearingLabel:cardinal(leftBearing+180),
    defaults:Object.freeze(defaults),fieldOverrides:Object.freeze(fieldOverrides),screeningLayouts,
    buildingTargets:getBuildingTargets(data||(legacy?undefined:{buildings:[]})),
    hasGarage:Boolean(site.garage||(!data&&legacy)),
  });
}
