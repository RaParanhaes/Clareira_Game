import {flightStep} from './flight-prototype.mjs';
import {drawTreeSprite,preloadTreeSpriteAtlases} from './tree-sprites.mjs';
import {drawAvatarSprite,preloadAvatarIdle,selectAvatarFrame} from './avatar-sprites.mjs';
const canvas=document.querySelector('#flight-scene'),ctx=canvas.getContext('2d'),status=document.querySelector('#flight-status');
const rise=document.querySelector('#flight-rise'),land=document.querySelector('#flight-land');
const body={radius:.24,height:1.4},trees=[{x:0,y:0,radius:.38,baseZ:0,topZ:4,index:1},{x:3.4,y:-1.1,radius:.38,baseZ:0,topZ:4,index:3},{x:-2.4,y:2.7,radius:.38,baseZ:0,topZ:4,index:2}];
const appearance={archetypeId:'character.peasant'};let actor={x:-3.2,y:0,z:0},target=null,desired=0,last=0,phase=0,profile='controlled';
const size=()=>({w:canvas.clientWidth,h:canvas.clientHeight});
function resize(){const {w,h}=size(),ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.imageSmoothingEnabled=false;}
function project(x,y,z=0){const {w,h}=size();return{x:w/2+(x-y)*36,y:h*.57+(x+y)*18-z*24};}
function groundAt(clientX,clientY){const rect=canvas.getBoundingClientRect(),{w,h}=size(),a=(clientX-rect.left-w/2)/36,b=(clientY-rect.top-h*.57)/18;return{x:Math.max(-5,Math.min(5,(a+b)/2)),y:Math.max(-5,Math.min(5,(b-a)/2))};}
function diamond(x,y,color){const p=project(x,y);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(p.x,p.y-18);ctx.lineTo(p.x+36,p.y);ctx.lineTo(p.x,p.y+18);ctx.lineTo(p.x-36,p.y);ctx.closePath();ctx.fill();}
function avatar(){const base=project(actor.x,actor.y),p=project(actor.x,actor.y,actor.z);ctx.fillStyle=`rgba(5,16,10,${Math.max(.12,.36-actor.z*.035)})`;ctx.beginPath();ctx.ellipse(base.x,base.y+2,11+actor.z,4+actor.z*.25,0,0,Math.PI*2);ctx.fill();const selected=selectAvatarFrame({appearance,facing:'south',phase,moving:!!target,position:{z:actor.z},player:{},pose:{},time:performance.now()/1000,now:Date.now()});if(!drawAvatarSprite(ctx,p.x,p.y,selected,appearance,{scale:.7})){ctx.fillStyle='#dfbc83';ctx.fillRect(p.x-5,p.y-28,10,28);}}
function render(){const {w,h}=size();ctx.clearRect(0,0,w,h);ctx.fillStyle='#243b30';ctx.fillRect(0,0,w,h);for(let sum=-10;sum<=10;sum++)for(let x=-5;x<=5;x++){let y=sum-x;if(y< -5||y>5)continue;diamond(x,y,(x+y)%2?'#48664b':'#4f704f');}
 const order=trees.map(tree=>({type:'tree',tree,depth:tree.x+tree.y}));order.push({type:'actor',depth:actor.z>=4?Infinity:actor.x+actor.y});order.sort((a,b)=>a.depth-b.depth);for(const entry of order){if(entry.type==='actor'){avatar();continue;}const t=entry.tree,p=project(t.x,t.y);drawTreeSprite(ctx,p,t.index,.96,1,performance.now()/1000,false,t.x,t.y,false);}
 status.textContent=`Altura ${actor.z.toFixed(1)} · ${actor.blocked?'Obstáculo: procure espaço para passar ou descer.':actor.z>=4?'Acima das copas.':actor.z>.1?'Voando entre as árvores.':'No chão.'}`;}
function frame(now){const dt=last?Math.min(.05,(now-last)/1000):0;last=now;let x=0,y=0;if(target){const dx=target.x-actor.x,dy=target.y-actor.y,d=Math.hypot(dx,dy);if(d<.08)target=null;else{x=dx/d;y=dy/d;phase+=dt*5;}}
 const vertical=desired===0?(actor.z>1e-8?-1:0):Math.abs(actor.z-desired)<.08?0:Math.sign(desired-actor.z);actor=flightStep(actor,{x,y,vertical},dt,{trees,body,profile,targetZ:desired});render();requestAnimationFrame(frame);}
canvas.addEventListener('pointerdown',event=>{target=groundAt(event.clientX,event.clientY)});
rise.addEventListener('click',()=>{desired=5;rise.setAttribute('aria-pressed','true');land.setAttribute('aria-pressed','false')});
land.addEventListener('click',()=>{desired=0;rise.setAttribute('aria-pressed','false');land.setAttribute('aria-pressed','true')});
document.querySelector('#flight-reset').addEventListener('click',()=>{actor={x:-3.2,y:0,z:0};target=null;desired=0;rise.setAttribute('aria-pressed','false');land.setAttribute('aria-pressed','false')});
for(const [id,value] of [['flight-controlled','controlled'],['flight-smooth','smooth']])document.getElementById(id).addEventListener('click',()=>{profile=value;for(const [button,kind] of [['flight-controlled','controlled'],['flight-smooth','smooth']])document.getElementById(button).setAttribute('aria-pressed',String(kind===profile));});
window.addEventListener('resize',resize);resize();await Promise.all([preloadTreeSpriteAtlases(),preloadAvatarIdle(appearance)]);requestAnimationFrame(frame);
// Read-only hook for regression checks of the same controls a player uses.
export function inspectFlightLab(){return {actor:{...actor},desired,profile,target:target&&{...target}};}
