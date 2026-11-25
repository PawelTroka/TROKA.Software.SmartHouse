#!/usr/bin/env python3
"""Derive mortar-free unit samples and the browser's compact PBR catalogue.

Unit crops preserve source texel density, never upscale. Periodic boundary
correction removes the crop edge, not the material's pores or colour variation.
The wool diffuse derivative removes broad printed dye only; original measured
normal and roughness maps retain the looped yarn structure.
"""
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'assets/materials'
manifest=json.loads((FOLDER/'manifest.json').read_text())
records={a['id']:a for a in manifest['assets'] if not a.get('derivedFrom')}
BASELINE={'fine_grained_wood','grass_ground','rough_linen','white_stucco','marble_01','wood_floor_worn'}

# Preserve baseline files exactly. Deliver new PBR maps as high-quality JPEGs
# rather than the provider's near-lossless, unusually large JPEG downloads.
# Keep source checksums separately so the entire transformation is auditable.
for record in records.values():
    if record['id'] in BASELINE:continue
    for channel,entry in record['maps'].items():
        if entry.get('deliveryCompression'):continue
        path=FOLDER/entry['file'];raw=path.read_bytes()
        source_image=Image.open(path).convert('RGB');before=np.asarray(source_image,dtype=float)
        output=source_image.getchannel('G') if channel=='Rough' else source_image
        quality=96 if record['id']=='Concrete034' and channel=='nor_gl' else 94
        output.save(path,quality=quality,optimize=True,subsampling=0)
        delivered=path.read_bytes();after=np.asarray(Image.open(path).convert('RGB'),dtype=float)
        entry['deliveryCompression']={
            'format':'JPEG','quality':quality,'chromaSubsampling':'4:4:4' if channel!='Rough' else 'grayscale green channel',
            'sourceBytes':len(raw),'sourceMd5':hashlib.md5(raw).hexdigest(),
            'sourceSha256':hashlib.sha256(raw).hexdigest(),
            'meanAbsoluteError8Bit':round(float(np.mean(np.abs(before-after))),4),
        }
        if channel=='nor_gl':
            a=before/127.5-1;b=after/127.5-1
            cosine=np.sum(a*b,axis=2)/np.maximum(1e-8,np.linalg.norm(a,axis=2)*np.linalg.norm(b,axis=2))
            entry['deliveryCompression']['normalAngularErrorP95Degrees']=round(float(np.percentile(np.degrees(np.arccos(np.clip(cosine,-1,1))),95)),4)
        entry.update(bytes=len(delivered),md5=hashlib.md5(delivered).hexdigest(),sha256=hashlib.sha256(delivered).hexdigest())
ALIASES={
    'wood':'fine_grained_wood','grass':'grass_ground','linen':'rough_linen',
    'plaster':'white_stucco','stone':'marble_01','floor':'wood_floor_worn',
    'plaster-fine':'white_plaster_02','clay-plaster':'clay_plaster','oak':'oak_veneer_02',
    'walnut':'natural_walnut_veneer','teak':'teak_veneer','ash':'ash_veneer',
    'cedar':'japanese_cedar_planks','weathered-wood':'wood_planks_grey',
    'board-concrete':'wood_textured_concrete','brick':'red_brick_03',
    'terracotta':'terracotta_floor_tiles','terrazzo':'terrazzo_tiles',
    'slate-roof':'roof_slates_03','slate-floor':'slate_floor','wool':'wool_boucle',
    'leather':'brown_leather','oak-floor':'oak_wood_planks','parquet':'herringbone_parquet',
    'terracotta-roof':'clay_roof_tiles_02','sandstone':'red_sandstone_tiles',
    'travertine':'Travertine003','limestone':'Tiles139','concrete':'Concrete034',
    'velvet':'velour_velvet','porcelain':'Porcelain001','marble':'Marble012',
}
CROPS={
    'brick':(315,170,488,208),'terracotta':(240,242,328,328),
    'terrazzo':(40,40,470,470),'limestone':(15,15,115,115),
    'slate-floor':(420,350,535,430),'sandstone':(70,60,330,250),
    'cedar':(448,40,506,990),'weathered-wood':(235,15,323,1000),
}

def metadata(file,source,operation):
    raw=(FOLDER/file).read_bytes()
    with Image.open(FOLDER/file) as image:w,h=image.size
    return dict(file=file,sourceUrl=source['sourceUrl'],md5=hashlib.md5(raw).hexdigest(),
        sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),sourceResolution=source['sourceResolution'],
        colorSpace=source['colorSpace'],width=w,height=h,
        derivedFromFile=source['file'],derivation=operation)

def stats(record):
    rgb=np.asarray(Image.open(FOLDER/record['maps']['Diffuse']['file']).convert('RGB'),dtype=float)/255
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    record['linearAlbedoMean']=linear.mean(axis=(0,1)).round(9).tolist()
    record['linearAlbedoStd']=linear.std(axis=(0,1)).round(9).tolist()

for alias,box in CROPS.items():
    source=records[ALIASES[alias]];record=copy.deepcopy(source);record['id']=source['id']+'_unit'
    record['name']=source['name']+' — mortar-free unit sample';record['derivedFrom']=source['id']
    record['cropPixels']=list(box);record['maps']={}
    original=source['maps']['Diffuse'];x0,y0,x1,y1=box
    record['physicalSizeMeters']=[source['physicalSizeMeters'][0]*(x1-x0)/original['width'],source['physicalSizeMeters'][1]*(y1-y0)/original['height']]
    for channel,suffix in [('Diffuse','diffuse'),('nor_gl','nor_gl'),('Rough','rough')]:
        image=Image.open(FOLDER/source['maps'][channel]['file']).convert('RGB').crop(box)
        pixels=np.asarray(image,dtype=float)
        # Subtract only the long-wave endpoint mismatch; fine scanned detail stays.
        h,w,_=pixels.shape
        pixels-=np.linspace(-.5,.5,w)[None,:,None]*(pixels[:,-1:]-pixels[:,:1])
        pixels-=np.linspace(-.5,.5,h)[:,None,None]*(pixels[-1:]-pixels[:1])
        if channel=='nor_gl':
            normals=pixels/127.5-1
            normals/=np.maximum(.001,np.linalg.norm(normals,axis=2,keepdims=True))
            pixels=(normals+1)*127.5
        file=record['id']+'_'+suffix+'.jpg'
        Image.fromarray(np.uint8(np.clip(np.round(pixels),0,255))).save(FOLDER/file,quality=96,subsampling=0)
        record['maps'][channel]=metadata(file,source['maps'][channel],'crop inside one material unit; periodic boundary correction; no resampling')
    stats(record);records[record['id']]=record;ALIASES[alias+'-unit']=record['id']

source=records['wool_boucle'];record=copy.deepcopy(source)
record.update(id='wool_boucle_undyed',name='Looped wool — undyed study',derivedFrom='wool_boucle')
image=Image.open(FOLDER/source['maps']['Diffuse']['file']).convert('RGB')
rgb=np.asarray(image,dtype=float)/255
linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
grey=linear@np.array([.2126,.7152,.0722])
# Remove the black/white yarn dye rather than painting a checker pattern onto
# every cream sofa. Sub-millimetre albedo variation remains; the full original
# measured loop normals and roughness are unchanged, not blurred or replaced.
radius=1.4;positions=np.arange(-5,6);weights=np.exp(-positions**2/(2*radius**2));weights/=weights.sum()
blur=sum(weight*np.roll(grey,int(offset),axis=0) for offset,weight in zip(positions,weights))
blur=sum(weight*np.roll(blur,int(offset),axis=1) for offset,weight in zip(positions,weights))
reflectance=np.clip(.62*(grey/np.maximum(.0001,blur))**.35,.12,.9)
srgb=np.where(reflectance<=.0031308,reflectance*12.92,1.055*reflectance**(1/2.4)-.055)
file='wool_boucle_undyed_diffuse.jpg'
Image.fromarray(np.uint8(np.clip(srgb*255,0,255))).convert('RGB').save(FOLDER/file,quality=96,subsampling=0)
record['maps']['Diffuse']=metadata(file,source['maps']['Diffuse'],'remove yarn dye with periodic 1.4 px Gaussian local luminance normalization in linear light; original loop normal and roughness maps unchanged')
stats(record);records[record['id']]=record;ALIASES['boucle']=record['id']

# Preserve the original six aliases and their exact calibration for Current.
legacy={
    'wood':dict(chroma=.55),'grass':dict(contrast=1.1,chroma=.7),
    'linen':dict(contrast=.8,chroma=.08),'plaster':dict(contrast=.9,chroma=.1),
    'stone':dict(chroma=.35),'floor':dict(chroma=.5),
}
palette={'plaster-fine','clay-plaster','boucle','wool','velvet'}
data={}
for alias,asset_id in ALIASES.items():
    a=records[asset_id];m=a['maps'];diffuse=m['Diffuse']
    entry=dict(id=a['id'],label=a['name'],meters=a['physicalSizeMeters'],mean=a['linearAlbedoMean'],
        pixels=[diffuse['width'],diffuse['height']],contrast=1,chroma=.85,
        colorMode='palette' if alias in legacy or alias in palette else 'natural',
        source=a['source'],license=a['license'],provider=a.get('provider','Poly Haven'),
        files={'diffuse':m['Diffuse']['file'],'nor_gl':m['nor_gl']['file'],'rough':m['Rough']['file']},
        grainAxis='u' if alias in ['oak','walnut','teak','ash','oak-floor','parquet'] else 'v')
    entry.update(legacy.get(alias,{}))
    # Catalogue cards use small previews, never trigger the full PBR downloads.
    preview=entry['id']+'_swatch.jpg'
    image=Image.open(FOLDER/entry['files']['diffuse']).convert('RGB')
    image.thumbnail((256,256),Image.Resampling.LANCZOS)
    image.save(FOLDER/preview,quality=86,optimize=True,subsampling=0)
    entry['preview']=preview
    data[alias]=entry

manifest['assets']=list(records.values())
manifest['derivativeNotes']='New source maps use quality-94 JPEG delivery with source hashes and measured compression error retained; the six baseline sets are unchanged. Mortar-free unit samples preserve source texel density. Boucle dye removal keeps the original measured normal/roughness structure. All operations are recorded per map.'
(FOLDER/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
code='// Generated by scripts/prepare-material-catalogue.py; source provenance in assets/materials/manifest.json.\n'
code+='const data='+json.dumps(data,indent=2)+';\n'
code+='for(const spec of Object.values(data)){Object.freeze(spec.meters);Object.freeze(spec.mean);Object.freeze(spec.pixels);Object.freeze(spec.files);Object.freeze(spec);}\nexport const MATERIAL_ASSETS=Object.freeze(data);\n'
(ROOT/'src/material-asset-data.js').write_text(code)
print(len(data),'registered samples;',len(records),'source/derived records')
