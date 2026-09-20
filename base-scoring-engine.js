'use strict';

function centerOf(p){ return {x:p.x+p.w/2,y:p.y+p.h/2}; }
function distance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function clamp(v,min=0,max=100){ return Math.max(min,Math.min(max,v)); }

function scoreBase(layout, purpose='Creative', size=44){
  const ps=Array.isArray(layout?.placements)?layout.placements:[];
  const th=ps.find(p=>p.id==='town_hall');
  if(!th) return {overall:0,components:{},issues:['Town Hall missing']};
  const tc=centerOf(th), maxR=size/2;
  const defenses=ps.filter(p=>['defense','core'].includes(p.category) && p.id!=='town_hall');
  const walls=ps.filter(p=>p.id==='wall');
  const resources=ps.filter(p=>p.category==='resource');
  const coreDefense=defenses.length ? defenses.filter(p=>distance(centerOf(p),tc)<=maxR*0.45).length/defenses.length : 0;
  const wallDensity=walls.length ? clamp(walls.length/180*100) : 0;
  const resourceCentrality=resources.length ? clamp(100-(resources.reduce((s,p)=>s+distance(centerOf(p),tc),0)/resources.length)/maxR*100) : 50;
  const quadrants=defenses.reduce((a,p)=>{const c=centerOf(p); const q=(c.x>=tc.x?1:0)+(c.y>=tc.y?2:0);a[q]++;return a;},{0:0,1:0,2:0,3:0});
  const qVals=Object.values(quadrants); const avg=qVals.reduce((a,b)=>a+b,0)/4; const spread=avg?100-(Math.max(...qVals)-Math.min(...qVals))/avg*100:0;
  const symmetry=clamp(spread);
  const purposeKey=String(purpose||'Creative').toLowerCase();
  const weights=purposeKey.includes('farm')?{core:.25,wall:.15,resource:.35,sym:.25}:purposeKey.includes('trophy')?{core:.45,wall:.25,resource:.05,sym:.25}:purposeKey.includes('war')?{core:.4,wall:.3,resource:.05,sym:.25}:purposeKey.includes('hybrid')?{core:.3,wall:.25,resource:.2,sym:.25}:{core:.3,wall:.2,resource:.2,sym:.3};
  const components={coreProtection:Math.round(coreDefense*100),wallStructure:Math.round(wallDensity),resourcePlacement:Math.round(resourceCentrality),defenseDistribution:Math.round(symmetry)};
  const overall=Math.round(components.coreProtection*weights.core+components.wallStructure*weights.wall+components.resourcePlacement*weights.resource+components.defenseDistribution*weights.sym);
  return {overall,components,weights,summary:`${purpose} score ${overall}/100`,issues:[]};
}

module.exports={scoreBase};
