import {mkdir,writeFile,readFile,appendFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const directory = new URL('../.local/',import.meta.url);
await mkdir(directory,{recursive:true,mode:0o700});
try {
 await writeFile(new URL('backends.env',directory),`POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nREDIS_PASSWORD=${randomBytes(32).toString('hex')}\n`,{flag:'wx',mode:0o600});
} catch(error) {if(error.code!=='EEXIST')throw error;}
const envFile=new URL('backends.env',directory);
if (!(await readFile(envFile,'utf8')).includes('GAME_DATABASE_PASSWORD=')) await appendFile(envFile,`GAME_DATABASE_PASSWORD=${randomBytes(32).toString('hex')}\n`);
const child=spawn('docker',['compose','--env-file','.local/backends.env','-f','infra/backends.compose.yml','up','-d','--wait'],{cwd:new URL('..',import.meta.url),stdio:'inherit'});
process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
