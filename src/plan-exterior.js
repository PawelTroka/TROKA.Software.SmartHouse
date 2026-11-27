/** Register one drawing-based house and its decks. Source survey is preserved. */
import {houseModelFrame} from './house-model.js?v=1.38.0';
const cache=new WeakMap();
export function applyPlanExterior(data,settings={}){
  if(!data?.site?.terrace||(data.site.id||settings.siteId||'sternicza-11')!=='sternicza-11')return data;
  const original=data.site.terrace,frame=houseModelFrame(data,settings);
  const width=Number.isFinite(settings.terraceWidth)?Math.max(4,Math.min(10.77,settings.terraceWidth)):original.width;
  const key=JSON.stringify([width,frame.floorZ,settings.atticRise]);
  const previous=cache.get(data);if(previous?.key===key)return previous.result;
  const rear=frame.toSite(5.385,0).slice(0,2),terrace={...original,width,x:rear[0]-width/2,y:rear[1]};
  const sourceHouse=data.site.house,localRing=[[0,0],[10.77,0],[10.77,9],[7.26,9],[7.26,10.68],[3.51,10.68],[3.51,9],[0,9],[0,0]];
  const house={...sourceHouse,sourceFootprint:sourceHouse.sourceFootprint||sourceHouse.footprint,
    cellarFootprint:[[0,0],[10.77,0],[10.77,9],[0,9],[0,0]].map(p=>frame.toSite(...p).slice(0,2)),
    footprint:localRing.map(p=>frame.toSite(...p).slice(0,2)),
    architecturalModel:{origin:frame.origin,ex:frame.ex,ey:frame.ey,floorZ:frame.floorZ,atticRise:settings.atticRise??5.75}};
  const result={...data,site:{...data.site,house,terrace,rearMidpoint:rear}};
  cache.set(data,{key,result});return result;
}
export function planRegistrationSummary(data){
  const house=data?.site?.house,p=house?.sourceFootprint||house?.footprint;if(!p?.length)return null;
  const edges=p.slice(0,-1).map((a,i)=>Math.hypot(p[i+1][0]-a[0],p[i+1][1]-a[1]));
  return {drawing:{mainWidth:10.77,mainDepth:9,frontBayWidth:3.55},
    mapped:{mainWidth:(edges[0]+edges[2])/2,mainDepth:(edges[1]+edges[3])/2},
    registered:Boolean(house.architecturalModel),
    note:'Inside and outside use one 10.77 × 9.00 m drawing-based house, including its front bay. The model is centred on the surveyed street wall without scaling. The archived drawings and current photograph differ; exact registration and present-day alterations still need an as-built survey.'};
}
