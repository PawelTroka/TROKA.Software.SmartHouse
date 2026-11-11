import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'public');
await mkdir(output,{recursive:true});
for(const name of ['index.html','style.css','favicon.svg','.nojekyll','src','data','vendor']){
  await rm(path.join(output,name),{recursive:true,force:true});
  await cp(path.join(root,name),path.join(output,name),{recursive:true});
}
console.log('Static simulator built in public/');
