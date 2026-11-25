import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DESIGN_STYLES} from '../src/design-styles.js';
import {getStyleMaterialSamples,MATERIAL_ASSETS} from '../src/material-catalogue.js';
import {captureStyleMaterials,calibratedSamplePixel} from '../scripts/prepare-style-material-swatches.mjs';

const folder=new URL('../assets/materials/style-swatches/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8'));
const byKey=new Map(manifest.samples.map(s=>[s.key,s]));

test('every cached style swatch matches the actual production pigment, source and colour mode',()=>{
  assert.equal(manifest.sampleCount,DESIGN_STYLES.length*8);
  for(const style of DESIGN_STYLES)for(const interior of [false,true]){
    const actual=captureStyleMaterials(style,{interior}),samples=getStyleMaterialSamples(style,{interior});
    for(const [index,material] of actual.entries()){
      const record=byKey.get(`${style.id}/${interior?'interior':'exterior'}/${material.role}`);
      assert.ok(record);assert.equal(record.sourceId,material.sourceId);
      assert.equal(record.sourceFile,material.sourceFile);assert.equal(record.colorMode,material.colorMode);
      // Linear-light conversions can differ by one floating-point rounding
      // step across runtimes; keep the tolerance far below an 8-bit colour step.
      assert.equal(record.pigment.length,material.pigment.length,record.key);
      for(const [channel,value] of material.pigment.entries())
        assert.ok(Math.abs(record.pigment[channel]-value)<=1e-12,`${record.key} pigment channel ${channel}`);
      assert.equal(samples[index].calibrated,true);assert.equal(samples[index].url,new URL(record.file,folder).href);
    }
  }
  assert.equal(getStyleMaterialSamples('current')[2].asset,'stone','The original outdoor floor is stone paving');
  assert.equal(getStyleMaterialSamples('current',{interior:true})[2].asset,'floor','The original indoor floor remains timber');
});

test('linen/velvet use the selected warm, aqua and plum colours while native wood retains its photograph',()=>{
  const fabric=id=>byKey.get(id+'/exterior/fabric');
  const coastal=fabric('coastal'),bali=fabric('hidden-bali'),palm=fabric('palm-springs'),party=fabric('party-club');
  assert.ok(coastal.meanSrgb[0]>220&&coastal.meanSrgb[1]>coastal.meanSrgb[2]+3);
  assert.ok(bali.meanSrgb[0]>bali.meanSrgb[2]+15,'Bali linen must be ivory, not the source blue dye');
  assert.ok(palm.meanSrgb[1]>palm.meanSrgb[0]+30,'Palm Springs upholstery must retain its aqua palette');
  assert.ok(party.meanSrgb[0]>party.meanSrgb[1]+25&&party.meanSrgb[2]>party.meanSrgb[1]+12);
  for(const record of [coastal,bali,palm,party])assert.ok(record.stdSrgb.some(v=>v>1),'Real texture variation must survive colouring');
  const native=captureStyleMaterials('hidden-bali').find(s=>s.role==='wood');
  assert.equal(native.colorMode,'natural');assert.deepEqual(calibratedSamplePixel([145,91,57],native),[145,91,57]);
  const mean=MATERIAL_ASSETS[bali.asset].mean.map(value=>Math.round(255*(value<=.0031308?12.92*value:1.055*value**(1/2.4)-.055)));
  const calibrated=calibratedSamplePixel(mean,bali);
  assert.ok(calibrated[0]>calibrated[2]+15&&calibrated.every(v=>v>180));
});

test('all published calibrated previews have verified bytes and stay a small static catalogue',async()=>{
  const unique=new Map(manifest.samples.map(record=>[record.file,record]));let total=0;
  for(const record of unique.values()){
    const bytes=await readFile(new URL(record.file,folder));total+=bytes.length;
    assert.equal(bytes.length,record.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
    assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
  }
  assert.equal(total,manifest.totalBytes);assert.equal(unique.size,manifest.uniqueFiles);
  assert.ok(total<2_000_000,'All 184 material/role previews together remain under 2 MB; individual cards are lazy-loaded');
});
