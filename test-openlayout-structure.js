const assert = require('node:assert/strict');
function decode(blob){
  const normalized=String(blob).replace(/-/g,'+').replace(/_/g,'/');
  const bytes=Buffer.from(normalized+'='.repeat((4-normalized.length%4)%4),'base64');
  assert.equal(bytes.length,24,'OpenLayout payload must decode to 24 bytes');
  const index=bytes.readUInt32BE(0); const slot=bytes.readUInt32BE(4); const tag=bytes.subarray(8,24);
  const counts=new Map(); for(const b of tag) counts.set(b,(counts.get(b)||0)+1);
  let entropy=0; for(const c of counts.values()){const p=c/tag.length; entropy-=p*Math.log2(p);}
  assert.ok(slot>=1&&slot<=3,'slot must be 1..3'); assert.ok(index<1000,'collection index must be <1000'); assert.ok(entropy>=2.5,'HMAC tag entropy too low');
  return {index,slot,entropy};
}
const real=[
 'AAAAUwAAAAIASkB5BwDnV3uMWbRrR5Du',
 'AAAAUwAAAAIAC0uAZNU-ILswszr_wwGu',
 'AAAAUwAAAAIAG6IRURXJqlXPDKa9U5Or'
];
for(const blob of real){const x=decode(blob); console.log('PASS',blob,x);}
console.log('OpenLayout structural fixtures passed.');
