// Serial gate: source/exports, fresh Blender geometry, game contracts, content,
// then Chromium. This does not certify subjective appearance or live gameplay.
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'logs/cottage-art-revision');mkdirSync(out,{recursive:true});
const base=path.join(root,'game/art/buildings/medieval-cottage-3d');
const stamp=JSON.parse(readFileSync(path.join(base,'construction-checks.json'),'utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
for(const [file,expected] of Object.entries(stamp.sourceHashes||{}))if(hash(path.join(root,file))!==expected)throw Error(`Fonte mudou após o render: ${file}. Execute npm run art:cottage:build.`);
for(const [file,expected] of Object.entries(stamp.exportHashes||{}))if(hash(path.join(base,'frames',file))!==expected)throw Error(`Export divergente: ${file}. Regenere pela fonte.`);
if(Object.keys(stamp.sourceHashes||{}).length!==2||Object.keys(stamp.exportHashes||{}).length!==5)throw Error('Comprovante incompleto; regenere a cabana.');
const steps=[
 ['geometry','blender',['--background','--factory-startup','--python','scripts/blender/validate-medieval-cottage.py']],
 ['focused-tests','node',['--test','game/building-standard.test.mjs','game/house-collision.test.mjs']],
 ['content-check','npm',['run','content:check']],
 ['browser','node',['scripts/browser-cottage-sprite-check.mjs','logs/cottage-art-revision/browser']],
];
const checks=[{name:'source-export-hashes',passed:true}];
for(const [name,command,args] of steps){
 const log=path.join(out,`${name}.log`),fd=openSync(log,'w');console.log(`Validando ${name}...`);
 const start=Date.now();const r=spawnSync(command,args,{cwd:root,stdio:['ignore',fd,fd]});closeSync(fd);
 const passed=r.status===0;checks.push({name,passed,exitCode:r.status,durationMs:Date.now()-start,evidence:path.relative(root,log),...(r.error?{error:r.error.message}:{})});
 writeFileSync(path.join(out,'pipeline-checks.json'),JSON.stringify({checks,passed:checks.every(c=>c.passed),scope:'asset and isolated game renderer; live map separate'},null,2)+'\n');
 if(!passed){console.error(`Falhou: ${name}; consulte ${path.relative(root,log)}`);process.exit(1);}
 console.log(`Aprovado: ${name}`);
}
console.log('Etapas técnicas aprovadas. Revisão visual das imagens e passeio no mapa devem ser registrados separadamente.');
