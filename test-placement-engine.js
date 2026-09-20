'use strict';
const assert=require('assert');
const {placeCreativeBlueprint,validateAndRepair}=require('./base-placement-engine');
const b={townHall:11,gridSize:22,placements:[
 {id:'town_hall',x:9,y:9,w:2,h:2},
 {id:'inferno_tower',x:4,y:4,w:1,h:1},
 {id:'inferno_tower',x:15,y:15,w:1,h:1},
 {id:'inferno_tower',x:12,y:4,w:1,h:1},
 {id:'wall',x:1,y:1,w:1,h:1}
]};
const r=placeCreativeBlueprint(b,11);
assert.strictEqual(r.placements.filter(x=>x.id==='town_hall').length,1);
assert.ok(r.placements.every(x=>Number.isInteger(x.x)&&Number.isInteger(x.y)));
assert.strictEqual(r.gridSize, undefined); // placement engine returns normalized placements; compiler owns grid size
assert.ok(r.placements.every(x=>x.x>=0&&x.y>=0&&x.x+x.w<=44&&x.y+x.h<=44));
assert.ok(r.placements.filter(x=>x.id==='inferno_tower').length<=2);
const bad=validateAndRepair({gridSize:22,placements:[{id:'town_hall',x:0,y:0},{id:'town_hall',x:4,y:0}]},11);
assert.strictEqual(bad.ok,false);
console.log('placement engine tests PASS');
