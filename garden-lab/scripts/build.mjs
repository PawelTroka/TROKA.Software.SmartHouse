import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'public');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const name of ['index.html','style.css','favicon.svg','.nojekyll','src','data','vendor','assets']){
  await rm(path.join(output,name),{recursive:true,force:true});
  await cp(path.join(root,name),path.join(output,name),{recursive:true});
}
await mkdir(path.join(output,'docs'),{recursive:true});
for(const name of ['sternicza-nature-provenance.md','sternicza-appearance-observations.md','sea-visibility-1.30.md','sternicza-realism-1-30.md','resort-living-1.31.md','design-style-research.md','corner-pavilion-study-1.32.md','renovation-depth-1.33.md','renovation-materials.md','material-transfer-budget.json','material-reference-board.jpg']){
  await cp(path.join(root,'docs',name),path.join(output,'docs',name));
}
await cp(path.join(root,'docs','source-evidence'),path.join(output,'docs','source-evidence'),{recursive:true});
console.log('Static simulator built in public/');
