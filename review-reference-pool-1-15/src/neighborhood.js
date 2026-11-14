import {terrainAt} from './geometry.js?v=1.15.0';

/** The expanded DTM is for rendering only; property levels retain the native grid. */
export function contextTerrainAt(x,y,data){
  const grid=data.contextTerrain;
  if(!grid?.elevations?.length)return terrainAt(x,y,data);
  const {localOriginEN:o,xUnitEN:ux,yUnitEN:uy}=data.coordinates;
  const e=o[0]+x*ux[0]+y*uy[0],n=o[1]+x*ux[1]+y*uy[1];
  const gx=Math.max(0,Math.min(grid.columns-1,(e-grid.originEN[0])/grid.cellSize));
  const gy=Math.max(0,Math.min(grid.rows-1,(n-grid.originEN[1])/grid.cellSize));
  const ix=Math.floor(gx),iy=Math.floor(gy),jx=Math.min(ix+1,grid.columns-1),jy=Math.min(iy+1,grid.rows-1);
  const fx=gx-ix,fy=gy-iy,z=(i,j)=>grid.elevations[j*grid.columns+i];
  const value=(1-fy)*((1-fx)*z(ix,iy)+fx*z(jx,iy))+fy*((1-fx)*z(ix,jy)+fx*z(jx,jy));
  return Number.isFinite(value)?value:terrainAt(x,y,data);
}

export function neighborhoodBounds(data){
  const b=data.neighborhood?.bounds;
  if(b&&['minX','minY','maxX','maxY'].every(key=>Number.isFinite(b[key])))
    return {minX:b.minX-12,minY:b.minY-12,maxX:b.maxX+12,maxY:b.maxY+12};
  return {minX:-65,minY:-28,maxX:115,maxY:150};
}

export function buildingCenter(building){
  const source=building.context?.centroidXY;
  if(source?.length===2)return [...source];
  const polygon=building.footprint||[],points=polygon.length>1&&polygon[0][0]===polygon.at(-1)[0]&&polygon[0][1]===polygon.at(-1)[1]?polygon.slice(0,-1):polygon;
  if(!points.length)return [0,0];
  let area=0,x=0,y=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-b[0]*a[1];
    area+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
  }
  return Math.abs(area)>1e-8?[x/(3*area),y/(3*area)]:points.reduce((c,p)=>[c[0]+p[0]/points.length,c[1]+p[1]/points.length],[0,0]);
}

export function surroundingBuildings(data){
  return (data?.buildings||[]).filter(b=>b.id!==data.site.house.id&&b.id!==data.site.garage?.id&&b.kind!=='house'&&b.kind!=='garage'&&b.footprint?.length>=4&&Number.isFinite(b.baseZ)&&Number.isFinite(b.roofZ));
}

export function buildingViewLabel(building,data){
  return data.neighborhood?.labelsById?.[building.id]||building.label||building.id;
}

export function isAcrossStreet(building,data){
  const context=building.context||data.neighborhood?.originalContextById?.[building.id];
  return context?.streetSide?context.streetSide==='across-street':buildingCenter(building)[1]<Math.min(...data.site.boundary.map(p=>p[1]));
}

export function defaultViewBuilding(data,front=false){
  const buildings=surroundingBuildings(data);
  if(!front)return buildings.find(b=>/PCK\s*3/i.test(b.label))||buildings.find(b=>b.kind==='target')||buildings[0];
  const ref=data.neighborhood?.referenceXY||data.site.rearMidpoint;
  return buildings.filter(b=>isAcrossStreet(b,data)).sort((a,b)=>{
    const aa=buildingCenter(a),bb=buildingCenter(b);
    return Math.hypot(aa[0]-ref[0],aa[1]-ref[1])-Math.hypot(bb[0]-ref[0],bb[1]-ref[1]);
  })[0]||buildings[0];
}

/** Turn the camera without moving the eye, trees or mapped buildings. */
export function gazeAtBuilding(observer,building){
  const [x,y]=buildingCenter(building),ox=observer.x??observer[0],oy=observer.y??observer[1],oz=observer.z??observer[2];
  const dx=x-ox,dy=y-oy,z=building.baseZ+(building.roofZ-building.baseZ)*.62;
  return {lookYaw:Math.atan2(-dx,dy)*180/Math.PI,lookPitch:Math.max(-60,Math.min(60,Math.atan2(z-oz,Math.hypot(dx,dy))*180/Math.PI))};
}
