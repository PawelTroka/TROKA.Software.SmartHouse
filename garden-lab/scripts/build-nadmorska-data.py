#!/usr/bin/env python3
"""Rebuild Nadmorska 17 from official ULDK, GUGiK LoD1, DTM and LiDAR.
Requires numpy, pyproj, shapely and laspy[lazrs].
Large originals stay outside git; the JSON source extract records native
coordinates and SHA-256 digests. --download obtains missing official originals.

Example:
  python scripts/build-nadmorska-data.py --source-dir /tmp/nadmorska-sources \
    --building-archive /tmp/gdansk_lod1_2024.zip --download

The mapped 709.29 m2 parcel union is not scaled to the 800 m2 advertisement or
809 m2 earlier manual outline. Cadastral geometry does not verify ownership.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
import numpy as np
from pyproj import Transformer, Proj
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union
import laspy

DATE='2026-11-15'
TILE='2261_N-34-50-c-a-4-4.gml'
PARCELS=['226101_1.0008.136/2','226101_1.0008.135/8']
HOUSE='ID-2261-26BC7442-F05E-FAF6-E053-CA2BA8C0FAE4'
ARCHIVE_URL='https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/22/2261.zip'
DTM_URL='https://opendata.geoportal.gov.pl/NumDaneWys/NMT/81008/81008_1561305_N-34-50-C-a-4-4.asc'
LIDAR_URL='https://opendata.geoportal.gov.pl/NumDaneWys/DanePomiaroweLAZ/81005/81005_1559704_N-34-50-C-a-4-4-3-1.laz'
NS={'b':'http://www.opengis.net/citygml/building/2.0','g':'http://www.opengis.net/gml','a':'http://www.opengis.net/citygml/generics/2.0'}
TARGETS={
 'ID-2261-26BC7442-F11C-FAF6-E053-CA2BA8C0FAE4':(1,'Nadmorska 15 · neighbouring house · SE'),
 'ID-2261-26BC7442-F11B-FAF6-E053-CA2BA8C0FAE4':(3,'Across Nadmorska · NE · west part'),
 'ID-2261-26BC7443-699B-FAF6-E053-CA2BA8C0FAE4':(8,'Across Nadmorska · NE · east part'),
 'ID-2261-26BC7443-75D7-FAF6-E053-CA2BA8C0FAE4':(9,'Across side access lane · SW'),
 'ID-2261-26BC7442-D72E-FAF6-E053-CA2BA8C0FAE4':(12,'Large building across garden-side road · NW'),
}

def fetch(path,url,download):
 if not path.exists():
  if not download:raise FileNotFoundError(f'{path}; use --download or obtain {url}')
  path.parent.mkdir(parents=True,exist_ok=True)
  with urllib.request.urlopen(url,timeout=90) as r,path.open('wb') as f:
   while block:=r.read(1024*1024):f.write(block)
 return path

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  while block:=f.read(1024*1024):h.update(block)
 return h.hexdigest()

def uldk_url(parcel):
 return f'https://uldk.gugik.gov.pl/?request=GetParcelById&id={parcel}&result=geom_wkt&srid=2180'

def parcel(path):
 text=path.read_text();match=re.search(r'POLYGON\s*\(\(([^)]+)\)\)',text)
 if not match:raise ValueError('ULDK did not return polygon: '+str(path))
 return Polygon([[float(v) for v in p.split()] for p in match[1].split(',')])

def mask_inside(x,y,ring):
 result=np.zeros(np.shape(x),dtype=bool)
 for a,b in zip(ring,ring[1:]):
  result^=((a[1]>y)!=(b[1]>y))&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1]+1e-99)+a[0])
 return result

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--source-dir',type=Path,required=True)
 ap.add_argument('--building-archive',type=Path,required=True)
 ap.add_argument('--output',type=Path,default=Path('data/nadmorska-17.json'))
 ap.add_argument('--source-snapshot',type=Path,default=Path('data/nadmorska-source.json'))
 ap.add_argument('--download',action='store_true')
 args=ap.parse_args();base=args.source_dir;base.mkdir(parents=True,exist_ok=True)
 paths=[fetch(base/('parcel-'+p.rsplit('.',1)[1].replace('/','-')+'.txt'),uldk_url(p),args.download) for p in PARCELS]
 polys=[parcel(p) for p in paths];plot=unary_union(polys)
 assert plot.geom_type=='Polygon' and plot.is_valid and 709<plot.area<710
 archive=fetch(args.building_archive,ARCHIVE_URL,args.download)
 dtm=fetch(base/'nadmorska-2024.asc',DTM_URL,args.download)
 laz=fetch(base/'nadmorska-2024.laz',LIDAR_URL,args.download)
 road_paths={}
 for number in ['136/1','135/11']:
  name='road-136-1.txt' if number=='136/1' else 'parcel-135-11.txt'
  road_paths[number]=fetch(base/name,uldk_url('226101_1.0008.'+number),args.download)
 # NW broad-garden frame, separate from NE main entry/street direction.
 origin=np.array([473943.647708163,728775.125777694])
 front_left=np.array([473927.171068031,728750.103141208])
 ux=(front_left-origin)/np.linalg.norm(front_left-origin);uy=np.array([ux[1],-ux[0]])
 def local(p):
  a=np.asarray(p);d=a[...,:2]-origin;xy=np.stack([d@ux,d@uy],axis=-1)
  return np.concatenate([xy,a[...,2:]],axis=-1) if a.shape[-1]>2 else xy
 def native(x,y):return origin+x*ux+y*uy
 def rnd(p):return np.round(p,8).tolist()
 ring=np.array(plot.exterior.coords[:-1]);start=int(np.argmin(np.linalg.norm(ring-origin,axis=1)))
 nxt=int(np.argmin(np.linalg.norm(ring-front_left,axis=1)));step=1 if (nxt-start)%len(ring)==1 else -1
 ordered=np.array([ring[(start+step*i)%len(ring)] for i in range(len(ring))]+[ring[start]])
 boundary=local(ordered);local_plot=Polygon(boundary)
 names=['front','left','left','left','rear','right','right','right','right']
 assert len(names)==len(boundary)-1 and abs(boundary[1,1])<1e-7 and np.linalg.det([ux,uy])<0
 with dtm.open() as f:
  header={k.lower():float(v) for k,v in (f.readline().split() for _ in range(6))};grid=np.loadtxt(f)[::-1]
 def ground_en(e,n):
  gx=(e-header['xllcenter'])/header['cellsize'];gy=(n-header['yllcenter'])/header['cellsize']
  ix,iy=math.floor(gx),math.floor(gy);dx,dy=gx-ix,gy-iy;v=grid[iy:iy+2,ix:ix+2]
  if v.shape!=(2,2) or np.any(v==header['nodata_value']):raise ValueError('Missing DTM inside crop')
  return float((1-dy)*((1-dx)*v[0,0]+dx*v[0,1])+dy*((1-dx)*v[1,0]+dx*v[1,1]))
 def ground(x,y):return ground_en(*native(x,y))
 with zipfile.ZipFile(archive) as z:xml=z.read(TILE)
 raw=[]
 for e in ET.fromstring(xml).findall('.//b:Building',NS):
  pos=e.find('.//g:surfaceMember/g:Polygon/g:exterior/g:LinearRing/g:posList',NS)
  if pos is None:continue
  xyz=np.array(list(map(float,pos.text.split()))).reshape(-1,3);fp=xyz[:,:2];distance=Polygon(fp).distance(plot)
  if distance>145:continue
  attrs={a.attrib['name']:a.find('a:value',NS).text for a in e.findall('a:stringAttribute',NS)}
  raw.append({'officialId':e.attrib['{'+NS['g']+'}id'],'footprintEN':fp.tolist(),'baseZ':float(xyz[0,2]),
              'measuredHeight':float(e.find('b:measuredHeight',NS).text),'attributes':attrs,'distanceToPlot':distance})
 raw.sort(key=lambda b:(b['distanceToPlot'],b['officialId']))
 own=next(b for b in raw if b['officialId']==HOUSE)
 assert plot.covers(Polygon(own['footprintEN']))
 assert set(TARGETS)<=set(b['officialId'] for b in raw), 'Target identifier not present in source tile'
 roof_sources=[b for b in raw if b['officialId']==HOUSE or b['officialId'] in TARGETS]
 clouds={b['officialId']:[] for b in roof_sources}
 with laspy.open(laz) as r:
  cloud_bounds={'min':r.header.mins.tolist(),'max':r.header.maxs.tolist(),'pointCount':r.header.point_count}
  for b in roof_sources:
   p=np.array(b['footprintEN'])
   assert np.all(p.min(axis=0)>=r.header.mins[:2]) and np.all(p.max(axis=0)<=r.header.maxs[:2]), 'Target crosses LiDAR tile; partial roofs are not silently accepted'
  for chunk in r.chunk_iterator(1_000_000):
   m=np.asarray(chunk.classification)==6;x,y,z=np.asarray(chunk.x)[m],np.asarray(chunk.y)[m],np.asarray(chunk.z)[m]
   for b in roof_sources:
    p=np.array(b['footprintEN']);box=(x>=p[:,0].min())&(x<=p[:,0].max())&(y>=p[:,1].min())&(y<=p[:,1].max())
    if not box.any():continue
    xx,yy,zz=x[box],y[box],z[box];keep=mask_inside(xx,yy,p)&(zz>b['baseZ']+2)
    if keep.any():clouds[b['officialId']].append(np.stack([xx[keep],yy[keep],zz[keep]],axis=1))
 def thin(points,cell):
  buckets={}
  for p in points:
   k=(math.floor(p[0]/cell),math.floor(p[1]/cell))
   if k not in buckets or p[2]>buckets[k][2]:buckets[k]=p
  return np.array([buckets[k] for k in sorted(buckets)])
 buildings=[];house=None;counts={};next_index=100
 center=np.array(Polygon(own['footprintEN']).centroid.coords[0]);center_xy=local(center)
 for b in raw:
  oid=b['officialId'];is_house=oid==HOUSE;target=TARGETS.get(oid);fp=local(b['footprintEN']);c=np.array(Polygon(fp).centroid.coords[0]);delta=c-center_xy
  dn=np.array(Polygon(b['footprintEN']).centroid.coords[0])-center
  compass=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][int((math.degrees(math.atan2(dn[0],dn[1]))+360+11.25)//22.5)%16]
  if c[0]<boundary[:,0].min():side='across-street';prefix='Across Nadmorska · entry side'
  elif c[1]>boundary[:,1].max():side='garden-side-road';prefix='Across Nadmorska · garden side'
  elif c[0]>boundary[:,0].max():side='side-access';prefix='Beyond side access lane'
  else:side='neighbour-side';prefix='Neighbouring property'
  if is_house:index,label,kind=0,'Nadmorska 17','house'
  elif target:index,label=target;kind='target'
  else:index,label,kind=next_index,f'{prefix} · {compass} · {np.linalg.norm(delta):.0f} m','context';next_index+=1
  parts=clouds.get(oid,[]);cloud=np.concatenate(parts) if parts else np.empty((0,3));counts[oid]=len(cloud)
  if is_house or target:assert len(cloud)>50,'Missing target LiDAR evidence'
  roof=local(thin(cloud,.6 if is_house else (1.4 if index==12 else .9))) if len(cloud) else np.empty((0,3))
  roof_z=b['baseZ']+b['measuredHeight'];samples=[]
  if target:
   samples=roof.tolist()
   for a,q in zip(fp,fp[1:]):
    count=max(1,math.ceil(np.linalg.norm(q-a)/1.6))
    for j in range(count):
     p=a+(q-a)*(j+.5)/count
     for zz in np.arange(b['baseZ']+1.5,roof_z+.01,1.7):samples.append([p[0],p[1],zz])
  attrs=b['attributes']
  result={'id':f'building-{index}','index':index,'officialId':oid,'label':label,'footprint':rnd(fp),
   'baseZ':b['baseZ'],'roofZ':round(roof_z,3),'roofTopZ':round(float(cloud[:,2].max()) if len(cloud) else roof_z,3),
   'kind':kind,'roofPoints':rnd(roof),'highFeatures':[],'samples':rnd(samples),'roofSampleCount':len(roof) if target else 0,
   'source':'2024 GUGiK LiDAR + LoD1 footprint' if len(cloud) else '2024 GUGiK LoD1 median roof',
   'sourceDetails':{'dataset':'GUGiK LoD1 2024','tile':TILE,'heightMethod':'2024-09-30 class-6 LiDAR roof returns' if len(cloud) else 'ALS building-class median',
    'sourceMeasuredHeightM':b['measuredHeight'],'roofSourceYear':attrs.get('aktZrodla'),'roofSourceType':attrs.get('zrodloDach'),'geometryVersion':attrs.get('wersjaId'),'buildingId':attrs.get('buildingId')},
   'context':{'streetSide':side,'compassDirection':compass,'centroidXY':rnd(c),'centroidDistanceM':round(float(np.linalg.norm(delta)),3),
    'nearestFootprintDistanceM':round(Polygon(fp).distance(Point(center_xy)),3)}}
  if is_house:house=result
  else:buildings.append(result)
 hp=np.array(house['footprint']);hp_poly=Polygon(hp)
 # Actual NW wall chosen for proposed side glazing. The terrace starts beyond
 # the complete stepped envelope; the threshold bridges the 1.1 m wall offset.
 house['rearEdge']=rnd([hp[6],hp[5]])
 rear=[20.37,float(hp[:,1].max())];floor_xy=[20.37,rear[1]+1]
 terrace={'x':15.5,'y':rear[1],'width':10,'depth':3.8,'maxDepth':5.8,'thresholdDepth':1.3,'stairOffset':5.5,'stairWidth':3}
 pool={'x':9.4,'y':16,'width':3,'length':7}
 furniture={'loungers':[[13.4,20.4],[14.55,20.4]],'dining':{'x':24.5,'y':19.3,'width':3.4,'length':3.1},'path':[[18.8,21.8],[18.8,23],[18.8,24.2]]}
 def rect(x,y,w,l):return Polygon([(x,y),(x+w,y),(x+w,y+l),(x,y+l)])
 assert local_plot.covers(rect(pool['x']-.28,pool['y']-.28,pool['width']+.56,pool['length']+.56))
 assert not hp_poly.intersects(rect(pool['x']-.28,pool['y']-.28,pool['width']+.56,pool['length']+.56))
 assert local_plot.covers(rect(terrace['x'],terrace['y']-terrace['thresholdDepth'],terrace['width'],terrace['depth']+terrace['thresholdDepth']))
 assert local_plot.covers(rect(21,terrace['y']+3.8,3,3.5))
 for p in [[20.3,11.2],[18.5,22],[2.3,3.7]]:assert local_plot.covers(Point(p))
 assert hp_poly.covers(Point(20.3,11.2)) and not hp_poly.covers(Point(2.3,5.7))
 def crop(rings,margin,cell):
  p=np.array([v for r in rings for v in r]);lo=np.floor((p.min(axis=0)-margin)/cell).astype(int)*cell;hi=np.ceil((p.max(axis=0)+margin)/cell).astype(int)*cell
  values=[round(ground_en(e,n),2) for n in range(lo[1],hi[1]+1,cell) for e in range(lo[0],hi[0]+1,cell)]
  corners=local([[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]])
  return {'originEN':lo.tolist(),'columns':int((hi[0]-lo[0])//cell+1),'rows':int((hi[1]-lo[1])//cell+1),'cellSize':cell,'rowOrder':'north-increasing','elevations':values,
   'outside':'Clamp to crop edge; context buildings retain source base elevations.','bounds':{'minX':float(corners[:,0].min()),'maxX':float(corners[:,0].max()),'minY':float(corners[:,1].min()),'maxY':float(corners[:,1].max())}}
 terrain=crop([ordered],12,1);context_terrain=crop([b['footprintEN'] for b in raw],12,4)
 context_terrain.update({'purpose':'rendering-only','sourceUrl':DTM_URL,'sourceAcquisitionDate':'2024-09-30'})
 lon,lat=Transformer.from_crs(2180,4326,always_xy=True).transform(*center);convergence=Proj('EPSG:2180').get_factors(lon,lat).meridian_convergence
 az=math.degrees(math.atan2(uy[0],uy[1]))%360
 roads=[]
 for n,label,label_xy in [('136/1','Nadmorska · entry-side street',[-7,7]),('135/11','Nadmorska · garden-side street',[19,32])]:
  p=parcel(road_paths[n]);roads.append({'id':'road-'+n.replace('/','-'),'label':label,'labelPosition':label_xy,'footprint':rnd(local(p.exterior.coords)),
   'source':'Official ULDK road parcel boundary; carriageway and paving within it are illustrative','parcel':'226101_1.0008.'+n,'sourceUrl':uldk_url('226101_1.0008.'+n)})
 # The SW lane is visible on orthophoto but lies in a larger cadastral parcel.
 # Its 3.8 m width is a planning estimate, not a mapped public-road boundary.
 side=np.array([boundary[1],boundary[4]])
 strip=np.array([side[0],side[1],side[1]+[3.8,0],side[0]+[3.8,0],side[0]])
 roads.append({'id':'side-access-lane','label':'Side access lane · width assumed','labelPosition':[33,12],'footprint':rnd(strip),
  'source':'Paved lane observed on GUGiK orthophoto; 3.8 m width is a visual planning assumption, not a mapped road parcel or right-of-way statement'})
 p=np.array([v for b in buildings for v in b['footprint']]);bounds={'minX':float(p[:,0].min()),'maxX':float(p[:,0].max()),'minY':float(p[:,1].min()),'maxY':float(p[:,1].max())}
 sources=[{'title':'GUGiK ULDK — '+p,'url':uldk_url(p),'details':f'Official EPSG:2180 polygon retrieved {DATE}; area {poly.area:.2f} m². Geometry does not verify ownership.'} for p,poly in zip(PARCELS,polys)]
 sources += [
  {'title':'GUGiK 2024 3D buildings (LoD1)','url':ARCHIVE_URL,'details':'Official footprints and median ALS roof/base elevations; tile '+TILE+'. Native extract retained in data/nadmorska-source.json.'},
  {'title':'GUGiK 1 m digital terrain model','url':DTM_URL,'details':'Acquired 2024-09-30, EPSG:2180 and PL-EVRF2007-NH. Native 1 m analytical crop and separate 4 m rendering grid.'},
  {'title':'GUGiK 2024 LiDAR roof returns','url':LIDAR_URL,'details':'Acquired 2024-09-30; class 6 in house and five privacy targets. Maximum per 0.6 m house / 0.9 m neighbour / 1.4 m large-building plan voxel; metadata reports 12 points/m².'},
  {'title':'GUGiK official orthophoto','url':'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution','details':'Cross-check of corner plot, NW garden, NE entry street and SW paved access. Windows, furniture and access-lane width remain illustrative.'},
  {'title':'Dom & House listing DH292716','url':'https://www.domhouse.pl/property/dom-sprzedaz-267m2-jelitkowo-gdansk-pomorskie-dh292716/','details':'Listing: 267 m² house, 800 m² plot, 1993 construction. Advertised area is retained separately and never used to resize the official 709.29 m² parcel union.'},
 ]
 data={'schemaVersion':1,'created':DATE,'roofEvidence':'2024 LiDAR for house and five privacy targets; LoD1 median roofs for other context',
  'coordinates':{'localOriginEN':origin.tolist(),'xUnitEN':ux.tolist(),'yUnitEN':uy.tolist(),'horizontalCRS':'EPSG:2180','verticalDatum':'PL-EVRF2007-NH',
   'latitude':lat,'longitude':lon,'yGridAzimuth':az,'gridConvergenceDegrees':convergence,'meridianConvergence':convergence,'yTrueAzimuth':(az+convergence)%360},
  'site':{'id':'nadmorska-17','address':'Nadmorska 17, Gdańsk Jelitkowo','streetLabel':'NADMORSKA',
   'sideLabels':{'left':'SW · side access','right':'NE · Nadmorska'},
   'edgeLabels':{'front':'Neighbour boundary · SE','left':'Side access lane · SW','rear':'Nadmorska · garden side · NW','right':'Nadmorska · entry side · NE'},
   'viewLabels':{'garden':'Garden','opposite':'Neighbour boundary','left':'Side access lane','right':'Nadmorska'},
   'streetView':{'axis':'x','side':'min','lookYaw':90,'yaw':90,'facade':'right','label':'Nadmorska'},
   'frontLabel':'Neighbour boundary · SE','frontageLabel':'neighbour-side plot edge','planTopLabel':'Neighbour boundary',
   'floorHeightNote':'Owner measured: lounge 1.50 m above original garden; exact DTM registration remains approximate.',
   'boundary':rnd(boundary),'boundaryNames':names,'parcels':PARCELS,
   'parcelAreas':[{'id':p,'area':round(poly.area,3)} for p,poly in zip(PARCELS,polys)],
   'area':round(plot.area,2),'advertisedArea':800,'priorManualOutlineArea':809,
   'areaNote':'Mapped 136/2 + 135/8 union = 709.29 m²; listing says 800 m² and earlier manual outline 809 m². The model uses the official union without enlargement; the discrepancy needs documentary reconciliation.',
   'frontage':float(boundary[1,0]),'depth':float(boundary[:,1].max()),'frontSetback':float(hp[:,1].min()),'house':house,'garage':None,
   'rearMidpoint':rear,'floorReference':{'xy':floor_xy,'z':ground(*floor_xy)},
   'observers':{'sofa':[20.3,11.2],'standing':[20.3,11.2],'garden':[18.5,22],'front':[2.3,3.7]},
   'terrace':terrace,'pool':pool,'jacuzzi':{'x':15.65,'y':rear[1]+1.45,'width':2.2,'length':2.2},'furniture':furniture,
   'frontAccessOpenings':[],
   'boundaryOpenings':[{'edgeIndex':8,'from':2,'to':3.2,'id':'entry-pedestrian','label':'Proposed pedestrian gate','kind':'pedestrian'},
                       {'edgeIndex':8,'from':6.2,'to':10.2,'id':'entry-vehicle','label':'Proposed vehicle gate','kind':'vehicle'}],
   'defaultFloorHeight':1.5,'defaultGardenRaise':0,'defaultHedges':{'rear':4,'left':4,'right':4,'front':4},
   'floorHeightEvidence':'Owner-measured lounge-to-original-garden difference 1.50 m from Nadmorska17_R4_Original_Plans_Reconciled.pdf. DTM registration is approximate.',
   'designNotes':['The broad garden is NW of the house; main Nadmorska entry street is NE, on the right when looking into that garden. The opposite SE boundary adjoins a house.',
    'The official two-parcel union is 709.29 m². Advertised 800 m² and earlier manual 809 m² outlines are retained separately, not silently substituted.',
    'Pool 7 × 3 m, terrace 10 × 3.8 m, integrated jacuzzi, threshold bridge, stairs, furniture, 4 m hedges and gate positions are concept proposals, not existing surveyed features.',
    'The living-room view uses proposed NW side glazing; the original lounge is at the SW end and its wraparound glazing remains a renovation proposal.',
    'The house has a small tower/strych, not a full second storey. Upper-floor/tower levels remain editable assumptions until registered to original drawings.',
    'The two-car garage is integrated in the house; no separate garage-removal proposal is included.',
    'A ks200 service is shown through the garden on the recovered utility map. Pool siting needs a utility survey and clearance confirmation.']},
  'buildings':buildings,'terrain':terrain,'contextTerrain':context_terrain,
  'neighborhood':{'expanded':DATE,'radiusM':145,'radius':145,'referenceXY':rnd(center_xy),'referenceEN':rnd(center),'bounds':bounds,
   'originalBuildingCount':len(buildings),'addedBuildingCount':0,'totalBuildingCount':len(buildings),'acrossStreetCount':sum(b['context']['streetSide']=='across-street' for b in buildings),
   'originalBuildingIds':[b['id'] for b in buildings],'addedBuildingIds':[],'labelsById':{},'originalContextById':{},'roads':roads,
   'sourceUrl':ARCHIVE_URL,'sourceTile':TILE,'sourceSnapshot':'data/nadmorska-source.json',
   'selectionMethod':'All LoD1 footprints within 145 m of the official parcel union, excluding the house.',
   'labelMethod':'Direction and centroid distance. Nadmorska 15 is matched to recovered address map; other labels are descriptive.',
   'heightMethod':'House and five privacy targets use class-6 LiDAR. Other context uses median LoD1 roofs, not surveyed ridges.',
   'analysisScope':'Five volumes pre-sampled; all mapped neighbours can be inspected individually.',
   'terrainScope':'Native 1 m terrain is analytical; the separate 4 m grid is for rendering.'},
  'sources':sources,
  'limitations':['Cadastral geometry is not a title, boundary-staking or current survey; the advertised/manual area discrepancy is unresolved.',
   '2024 footprints, terrain and roof returns can differ from current conditions. LoD1-only context lacks roof-ridge and facade surveys.',
   'Windows, finishes, night occupation, furniture and proposed screening are illustrative. Existing vegetation visible on orthophoto is not a surveyed occluder.',
   'Opaque hedge/crown comparisons omit foliage gaps and do not guarantee privacy throughout the property.',
   'The 1.50 m lounge offset is owner-measured; DTM registration and upper-level assumptions need a measured building/terrain survey.',
   'Gate positions and SW access-lane width are proposals/visual assumptions; access rights are not established.',
   'Pool, terrace, canopy and spa features are concepts. Model fit does not establish structural, drainage, utility or planning approval.'],
  'provenance':{'generator':'scripts/build-nadmorska-data.py','sourceTile':TILE,'houseOfficialId':HOUSE,'rawClass6PointCounts':{k:v for k,v in counts.items() if v},
   'frameDefinition':'Origin NE end of SE neighbour-side boundary; +x SW, +y NW into broad garden. Main street is local -x and view yaw +90°, not local -y.',
   'parcelGeometryRetrieved':DATE,'localFloorMeasurementSource':'Nadmorska17_R4_Original_Plans_Reconciled.pdf, owner-measured 1.50 m lounge-to-garden offset'}}
 snapshot={'provider':'Główny Urząd Geodezji i Kartografii (GUGiK)','created':DATE,'horizontalCRS':'EPSG:2180','verticalDatum':'PL-EVRF2007-NH',
  'parcels':[{'id':p,'url':uldk_url(p),'geometryWKT':poly.wkt,'areaM2':poly.area,'responseSha256':sha(path)} for p,poly,path in zip(PARCELS,polys,paths)],
  'buildingSource':{'url':ARCHIVE_URL,'archiveSha256':sha(archive),'tile':TILE,'tileSha256':hashlib.sha256(xml).hexdigest()},
  'terrainSource':{'url':DTM_URL,'sha256':sha(dtm),'acquisitionDate':'2024-09-30','cellSizeM':1},
  'lidarSource':{'url':LIDAR_URL,'sha256':sha(laz),'acquisitionDate':'2024-09-30','class':6,'bounds':cloud_bounds,'rawClass6PointCounts':{k:v for k,v in counts.items() if v}},
  'roads':[{'parcel':'226101_1.0008.'+n,'geometryWKT':parcel(p).wkt,'url':uldk_url('226101_1.0008.'+n),'responseSha256':sha(p)} for n,p in road_paths.items()],
  'buildings':raw,'attribution':'Derived from public GUGiK cadastral lookup, LoD1, DTM and LiDAR products. Building-source metadata describes CC BY 4.0.',
  'modelledFeatures':'Gate positions, pool, terrace, jacuzzi, furniture, facade openings, lighting and four-metre hedges are proposals.'}
 for path,obj in [(args.output,data),(args.source_snapshot,snapshot)]:
  path.parent.mkdir(parents=True,exist_ok=True)
  path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n')
 print(json.dumps({'output':str(args.output),'area':data['site']['area'],'houseFootprintArea':hp_poly.area,'houseRoofTop':house['roofTopZ'],
  'contextBuildings':len(buildings),'acrossStreet':data['neighborhood']['acrossStreetCount'],'targets':[(b['index'],b['label'],len(b['samples'])) for b in buildings if b['kind']=='target'],
  'terrainRange':[min(terrain['elevations']),max(terrain['elevations'])],'floorReference':data['site']['floorReference'],'bearing':data['coordinates']['yTrueAzimuth']},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
