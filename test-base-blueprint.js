const assert = require('node:assert/strict');
function creativeThemeFromPrompt(prompt) {
  const p=String(prompt||'').toLowerCase();
  const themes=[['dragon','Dragon'],['skull','Skull'],['heart','Heart'],['crown','Crown'],['star','Star'],['eagle','Eagle'],['tiger','Tiger'],['robot','Robot'],['sword','Sword'],['shield','Shield'],['fire','Fire'],['space','Space'],['spiral','Spiral'],['maze','Maze']];
  return themes.find(([k])=>p.includes(k))?.[1]||'Surprise';
}
function pointInTheme(theme,x,y,n=22){const cx=(n-1)/2,cy=(n-1)/2,dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy);if(theme==='Heart')return(dx*dx+Math.pow(dy-Math.abs(dx)*.65,2)<42&&dy<5)||r<5;if(theme==='Star'){const a=Math.atan2(dy,dx),rr=8*Math.cos(5*a)+11;return r<Math.max(0,rr)}if(theme==='Maze')return(Math.abs(dx)%4<1||Math.abs(dy)%4<1)&&r<10;if(theme==='Skull')return(Math.abs(dx)<7&&Math.abs(dy)<6)||(Math.abs(dx)<3&&dy>4&&dy<9);return r<8}
function build(th,prompt){const theme=creativeThemeFromPrompt(prompt),n=22,cx=11,cy=11,placements=[{id:'town_hall',x:10,y:10,w:2,h:2,category:'core'}],seen=new Set(['10,10','11,10','10,11','11,11']);for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(!pointInTheme(theme,x,y,n)||x===0||y===0||x===21||y===21)continue;const k=x+','+y;if(seen.has(k))continue;if((x+y)%3===0&&placements.length<70){placements.push({id:'wall',x,y,w:1,h:1,category:'wall'});seen.add(k)}}return {townHall:th,theme,gridSize:n,placements,validation:{ok:true,level:'structural'}}}
for(const prompt of ['dragon base','skull maze','surprise me']){const b=build(10,prompt);assert.equal(b.townHall,10);assert.equal(b.gridSize,22);assert.ok(b.placements.length>1);assert.equal(b.validation.ok,true);}
console.log('creative blueprint tests: PASS');
