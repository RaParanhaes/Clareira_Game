// Long, gentle portrait reframing follows the broad areas of the six-minute
// film. Desktop and reduced-motion users keep their normal static framing.
const DURATION = 360;
const KEYS = Object.freeze([
  [0,72],[60,72],[90,18],[185,18],[218,90],[295,90],[318,18],[338,18],[360,72],
]);

export function getLoginFilmFraming(seconds) {
  const time=Number.isFinite(seconds)?((seconds%DURATION)+DURATION)%DURATION:0;
  let i=0;while(i<KEYS.length-2&&time>KEYS[i+1][0])i++;
  const [start,from]=KEYS[i],[end,to]=KEYS[i+1];
  let u=Math.max(0,Math.min(1,(time-start)/(end-start)));u=u*u*(3-2*u);
  return {position:from+(to-from)*u,scale:1,translateY:0};
}
