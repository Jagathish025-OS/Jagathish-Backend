'use strict';

const CATALOG_SOURCE = require('./base-object-catalog.json');
const CATALOG = Object.fromEntries(CATALOG_SOURCE.objects.map(def => [def.id, {
  name:def.name, category:def.kind, w:def.w, h:def.h, minTH:def.minTH, maxCount:def.maxCount,
  aliases:def.aliases||[], mergeConsumes:def.mergeConsumes||[]
}]));

function normalize(s){ return String(s||'').toLowerCase().replace(/[_-]+/g,' ').trim(); }
function resolveBuilding(id, th){
  const key=normalize(id);
  const hit=Object.entries(CATALOG).find(([k,v])=>k===id || normalize(k)===key || v.aliases.some(a=>normalize(a)===key));
  if(!hit) return null;
  const [canonical,def]=hit;
  if(th < def.minTH) return null;
  return {id:canonical,...def};
}
function footprint(p, def){ return {x:p.x,y:p.y,w:def.w,h:def.h}; }
function intersects(a,b){ return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
function within(p,n){ return p.x>=0 && p.y>=0 && p.x+p.w<=n && p.y+p.h<=n; }

function buildInventory(th){
  const out={};
  for(const [id,def] of Object.entries(CATALOG)) if(th>=def.minTH) out[id]=def.maxCount;
  return out;
}

function catalogSummary(th){
  return Object.entries(CATALOG).filter(([,def])=>th>=def.minTH).map(([id,def])=>({id,name:def.name,category:def.category,size:[def.w,def.h],maxCount:def.maxCount,minTH:def.minTH,mergeConsumes:def.mergeConsumes||[]}));
}

function mapCreativeToReal(blueprint, th){
  const inventory=buildInventory(th);
  const requested=[];
  const used={};
  const source=Array.isArray(blueprint?.placements)?blueprint.placements:[];
  for(const p of source){
    let id=p.id;
    if(id==='wall') id='wall';
    const def=resolveBuilding(id,th);
    if(!def) continue;
    if((used[id]||0)>=inventory[id]) continue;
    requested.push({id,x:Number(p.x),y:Number(p.y),w:def.w,h:def.h,category:def.category,source:'creative'});
    used[id]=(used[id]||0)+1;
  }
  // Ensure a real Town Hall is always present and centered if the creative token was invalid.
  if(!requested.some(p=>p.id==='town_hall')){
    const n=blueprint.gridSize||44;
    requested.unshift({id:'town_hall',x:Math.floor(n/2)-2,y:Math.floor(n/2)-2,w:4,h:4,category:'core',source:'engine-fallback'});
  }
  return {requested,inventory};
}

function validateAndRepair(layout, th){
  const n=layout.gridSize;
  const issues=[];
  const placed=[];
  const counts={};
  for(const p of layout.placements){
    const def=resolveBuilding(p.id,th);
    if(!def){ issues.push(`Unknown or locked building: ${p.id}`); continue; }
    const q=footprint(p,def);
    if(!within(q,n)){ issues.push(`Out of bounds: ${p.id} @ ${p.x},${p.y}`); continue; }
    counts[p.id]=(counts[p.id]||0)+1;
    if(counts[p.id]>def.maxCount){ issues.push(`Inventory exceeded: ${p.id}`); continue; }
    if(placed.some(x=>intersects(q,x))){ issues.push(`Footprint overlap: ${p.id} @ ${p.x},${p.y}`); continue; }
    placed.push({...q,id:p.id,category:def.category});
  }
  const thCount=placed.filter(p=>p.id==='town_hall').length;
  if(thCount!==1) issues.push(`Town Hall count must be exactly 1 (found ${thCount}).`);
  return {ok:issues.length===0,issues,placements:placed,inventoryUsed:counts};
}

function placeCreativeBlueprint(blueprint, th){
  const mapped=mapCreativeToReal(blueprint,th);
  // The creative canvas is a 22x22 concept grid; the compiled game-layout model
  // uses a 44x44 coordinate space. Concept coordinates are mapped at 2x resolution;
  // individual object footprints remain defined by the canonical catalog. This keeps the visual concept
  // separate from the actual Clash footprint model.
  const n=44;
  const candidates=mapped.requested.map(p=>{
    return {...p,x:Math.max(0,Math.min(n-p.w,Math.round(p.x*2))),y:Math.max(0,Math.min(n-p.h,Math.round(p.y*2)))};
  }).sort((a,b)=>a.id==='town_hall'?-1:b.id==='town_hall'?1:0);
  const placed=[];
  for(const p of candidates){
    const maxX=n-p.w, maxY=n-p.h;
    let best=null;
    for(let radius=0;radius<Math.max(n,n);radius++){
      const xs=[];
      for(let dx=-radius;dx<=radius;dx++){ xs.push(Math.round(p.x+dx)); xs.push(Math.round(p.x+dx)); }
      const ys=[];
      for(let dy=-radius;dy<=radius;dy++){ ys.push(Math.round(p.y+dy)); ys.push(Math.round(p.y+dy)); }
      const tries=[];
      for(const x of xs) for(const y of ys) tries.push({x,y});
      for(const t of tries){
        const q={x:Math.max(0,Math.min(maxX,t.x)),y:Math.max(0,Math.min(maxY,t.y)),w:p.w,h:p.h};
        if(!placed.some(x=>intersects(q,x))){best=q;break;}
      }
      if(best) break;
    }
    if(best) placed.push({...best,id:p.id,category:p.category});
  }
  return validateAndRepair({gridSize:n,placements:placed},th);
}

module.exports={CATALOG,buildInventory,catalogSummary,resolveBuilding,mapCreativeToReal,placeCreativeBlueprint,validateAndRepair};
