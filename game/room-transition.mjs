// Freeze the last rendered scene while the authoritative destination loads.
// The destination is only revealed after its first complete frame is ready.
export function createRoomTransition(source, { reducedMotion = () => false } = {}) {
  const root=document.createElement('div');
  root.id='room-transition';root.hidden=true;root.setAttribute('aria-hidden','true');
  const frozen=document.createElement('canvas'),shade=document.createElement('div');
  frozen.className='room-transition-frame';shade.className='room-transition-shade';
  root.append(frozen,shade);document.body.append(root);
  let generation=0,active=false,animation=null,covered=Promise.resolve();
  const animate=(from,to,duration)=>{
    animation?.cancel();
    animation=shade.animate([{opacity:from},{opacity:to}],{duration,fill:'forwards',easing:'ease-in-out'});
    return animation.finished.catch(()=>{});
  };
  const stopInput=event=>{if(active){event.preventDefault();event.stopImmediatePropagation();}};
  window.addEventListener('keydown',stopInput,true);
  root.addEventListener('pointerdown',stopInput,true);
  function cancel(){
    generation++;active=false;animation?.cancel();animation=null;
    root.hidden=true;root.dataset.phase='idle';frozen.width=1;frozen.height=1;
  }
  return {
    get active(){return active;},
    start(){
      if(active)return;
      cancel();active=true;root.hidden=false;root.dataset.phase='out';
      // Cover immediately: copying a potentially large frame delays the
      // transition on mobile and exposes movement before server confirmation.
      frozen.hidden=true;shade.style.opacity='1';
      covered=Promise.resolve();
    },
    async reveal(){
      if(!active)return;
      const current=generation;
      await covered;if(current!==generation)return;
      root.dataset.phase='in';frozen.hidden=true;
      await animate(1,0,reducedMotion()?80:260);
      if(current===generation)cancel();
    },
    cancel,
  };
}
