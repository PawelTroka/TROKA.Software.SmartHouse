/** Register proposed terrace dimensions without distorting surveyed buildings. */
const cache=new WeakMap();
export function applyPlanExterior(data,settings={}){
  if(!data?.site?.terrace||(data.site.id||settings.siteId||'sternicza-11')!=='sternicza-11')return data;
  const original=data.site.terrace;
  const width=Number.isFinite(settings.terraceWidth)?Math.max(4,Math.min(10.77,settings.terraceWidth)):original.width;
  if(Math.abs(width-original.width)<1e-8)return data;
  const previous=cache.get(data);if(previous?.width===width)return previous.result;
  const terrace={...original,width,x:original.x+(original.width-width)/2};
  const result={...data,site:{...data.site,terrace}};
  cache.set(data,{width,result});return result;
}
export function planRegistrationSummary(data){
  const p=data?.site?.house?.footprint;if(!p?.length)return null;
  const edges=p.slice(0,-1).map((a,i)=>Math.hypot(p[i+1][0]-a[0],p[i+1][1]-a[1]));
  return {drawing:{mainWidth:10.77,mainDepth:9,frontBayWidth:3.55},
    mapped:{mainWidth:(edges[0]+edges[2])/2,mainDepth:(edges[1]+edges[3])/2},
    note:'Interior geometry uses the photographed drawing dimensions. The surveyed outdoor footprint remains independent; its small size differences and missing front projection need an as-built survey before the models can be registered precisely.'};
}
