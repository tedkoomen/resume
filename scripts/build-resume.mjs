import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildResume(){
 const source=path.join(root,'src/resume-experience'),out=path.join(root,'static/resume');
 await mkdir(out,{recursive:true});
 const result=await build({entryPoints:[path.join(source,'scene.js')],outdir:out,bundle:true,minify:true,format:'esm',entryNames:'scene-[hash]',metafile:true,legalComments:'linked'});
 const bundle=Object.entries(result.metafile.outputs).find(([,v])=>v.entryPoint)?.[0];
 if(!bundle)throw new Error('Missing resume bundle');
 let html=await readFile(path.join(source,'index.html'),'utf8');
 html=html.replace('src="./scene.js"',`src="/resume/${path.basename(bundle)}"`);
 await writeFile(path.join(out,'index.html'),html);
 await copyFile(path.join(source,'lab.css'),path.join(out,'lab.css'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildResume();
