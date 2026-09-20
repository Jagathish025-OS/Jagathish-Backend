const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const COC_GAME_DATA = require("./data/coc-game-data.json");

const app = express();
const PORT = process.env.PORT || 3000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CONFIGURED_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const OPENROUTER_MODEL = CONFIGURED_OPENROUTER_MODEL === "openrouter/free"
  ? "google/gemma-4-26b-a4b-it:free"
  : CONFIGURED_OPENROUTER_MODEL;
const COC_DATA_VERSION = "clash-armies@0.12.5 source game-data.json5 (2026-09-20)";
const COC_DATA_SOURCE = "clash-armies-master/game-data.json5 + ClashArmies unlock rules";
const BACKEND_BUILD = "V12 · 2026-09-20";

app.use(cors({ origin: true, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
app.use(express.json({ limit: "256kb" }));

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

console.log("BACKEND_BUILD =", BACKEND_BUILD);
console.log("COC_DATA_SOURCE =", COC_DATA_SOURCE);
console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY EXISTS =", !!process.env.SUPABASE_KEY);
console.log("OPENROUTER_API_KEY EXISTS =", !!process.env.OPENROUTER_API_KEY);
console.log("OPENROUTER_MODEL =", OPENROUTER_MODEL);

app.get("/", (_req, res) => res.json({ message: "Jagathish Backend Running", cocAI: true, dataVersion: COC_DATA_VERSION, build: BACKEND_BUILD }));
app.get("/api/status", (_req, res) => res.json({ status: "online", version: "1.3.0", service: "Jagathish Backend", backendBuild: BACKEND_BUILD, cocAI: !!process.env.OPENROUTER_API_KEY, cocData: COC_DATA_VERSION }));

function requireSupabase(res) {
  if (!supabase) { res.status(503).json({ error: "Supabase is not configured on this server." }); return false; }
  return true;
}
app.get("/api/files", async (_req,res)=>{ if(!requireSupabase(res))return; try{const {data,error}=await supabase.storage.from("files").list(); if(error)return res.status(500).json({error:error.message}); res.json(data);}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/files/:userid", async (req,res)=>{ if(!requireSupabase(res))return; try{const {data,error}=await supabase.storage.from("files").list(req.params.userid); if(error)return res.status(500).json({error:error.message}); res.json(data);}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/save-file", async (req,res)=>{ if(!requireSupabase(res))return; try{const {user_id,filename,size,storage_path}=req.body; const {data,error}=await supabase.from("files_metadata").insert([{user_id,filename,size,storage_path,synced:false}]).select(); if(error)return res.status(500).json({error:error.message}); res.json({success:true,data});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/metadata/:userid", async (req,res)=>{ if(!requireSupabase(res))return; try{const {data,error}=await supabase.from("files_metadata").select("*").eq("user_id",req.params.userid); if(error)return res.status(500).json({error:error.message}); res.json(data);}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/pending-files", async (_req,res)=>{ if(!requireSupabase(res))return; try{const {data,error}=await supabase.from("files_metadata").select("*").eq("synced",false); if(error)return res.status(500).json({error:error.message}); res.json(data);}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/mark-synced/:id", async (req,res)=>{ if(!requireSupabase(res))return; try{const {local_path}=req.body; const {data,error}=await supabase.from("files_metadata").update({synced:true,local_path,synced_at:new Date().toISOString()}).eq("id",req.params.id).select(); if(error)return res.status(500).json({error:error.message}); res.json({success:true,data});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/download-url/:id", async (req,res)=>{ if(!requireSupabase(res))return; try{const {data,error}=await supabase.from("files_metadata").select("*").eq("id",req.params.id).single(); if(error)return res.status(500).json({error:error.message}); const {data:urlData}=supabase.storage.from("files").getPublicUrl(data.storage_path); res.json({filename:data.filename,url:urlData.publicUrl});}catch(e){res.status(500).json({error:e.message});} });

function validTH(value){const th=Number(value);return Number.isInteger(th)&&th>=1&&th<=18?th:null;}
function getTownHallRecord(th){return COC_GAME_DATA.townHalls.find(x=>Number(x.level)===th)||null;}
function getUnitMaxLevel(unit, th, gameData, clanCastle=false, unitType=null){
  unitType = unitType || (Array.isArray(gameData.troops) && gameData.troops.includes(unit) ? 'Troop' : Array.isArray(gameData.spells) && gameData.spells.includes(unit) ? 'Spell' : 'Siege');
  const t=getTownHallRecord(th); if(!t||!unit) return -1;
  if(clanCastle){
    if(t.maxCc===null || t.maxCc===undefined) return -1;
    if(unit.name==='Battle Drill' && Number(t.maxCc)<9) return -1;
    let max=-1;
    for(const levelData of unit.levels||[]){
      if(typeof levelData.laboratoryLevel==='number' && levelData.laboratoryLevel>Number(t.ccLaboratoryCap??-1)) return max;
      max=Number(levelData.level);
    }
    return max;
  }
  let max=-1;
  for(const levelData of unit.levels||[]){
    if(unitType==='Troop'){
      const prod=unit.productionBuilding;
      const prodLevel=prod==='Barrack'?(t.maxBarracks??-1):prod==='Dark Elixir Barrack'?(t.maxDarkBarracks??-1):null;
      if(prodLevel===null) return -1;
      if(Number(levelData.buildingLevel??-1)>Number(prodLevel)) return max;
    }
    if(unitType==='Siege'){
      if(Number(t.level)<12 || !t.maxWorkshop) return -1;
      if(Number(levelData.buildingLevel??-1)>Number(t.maxWorkshop)) return max;
    }
    if(unitType==='Spell'){
      if(Number(t.level)<5) return max;
      const prod=unit.productionBuilding;
      const prodLevel=prod==='Spell Factory'?(t.maxSpellFactory??-1):prod==='Dark Spell Factory'?(t.maxDarkSpellFactory??-1):null;
      if(prodLevel===null) return -1;
      if(Number(levelData.buildingLevel??-1)>Number(prodLevel)) return max;
    }
    const labLevel=t.maxLaboratory??-1;
    if(Number(levelData.level)!==1 && Number(levelData.laboratoryLevel??-1)>Number(labLevel)) return max;
    max=Number(levelData.level);
  }
  return max;
}
function getEquipmentMaxLevel(item,th){
  const t=getTownHallRecord(th); if(!t||!item) return -1;
  const hero=COC_GAME_DATA.heroes.find(h=>h.name===item.hero);
  if(!hero || getHeroMaxLevel(item.hero,th)<1) return -1;
  let max=-1; for(const l of item.levels||[]){ if(Number(l.blacksmithLevel??-1)>Number(t.maxBlacksmith??-1)) return max; max=Number(l.level); } return max;
}
function getPetMaxLevel(item,th){const t=getTownHallRecord(th); if(!t||!item||t.maxPetHouse===null||t.maxPetHouse===undefined)return -1; let max=-1; for(const l of item.levels||[]){if(Number(l.petHouseLevel??-1)>Number(t.maxPetHouse))return max;max=Number(l.level);}return max;}
function getHeroMaxLevel(name,th){const t=getTownHallRecord(th); const row=(t?.heroMaxLevels||[]).find(x=>String(x.hero).toLowerCase()===String(name).toLowerCase()); return row?Number(row.maxLevel):-1;}

function summarizeUnit(u,maxLevel,type,cc=false){return {name:u.name,type,housingSpace:Number(u.housingSpace||0),maxLevel,isSuper:Boolean(u.isSuper),isFlying:Boolean(u.isFlying),isJumper:Boolean(u.isJumper),airTargets:Boolean(u.airTargets),groundTargets:Boolean(u.groundTargets),productionBuilding:u.productionBuilding||null,clanCastleEligible:cc};}
function availableUnits(th,type,cc=false){
  const key = type==='Troop' ? 'troops' : type==='Spell' ? 'spells' : 'sieges';
  const source = Array.isArray(COC_GAME_DATA[key]) ? COC_GAME_DATA[key] : [];
  return source.filter(u=>!u.isSuper).map(u=>{const max=getUnitMaxLevel(u,th,COC_GAME_DATA,cc,type); return max<1?null:summarizeUnit(u,max,type.toLowerCase(),cc);}).filter(Boolean);
}
function availableTroops(th,cc=false){return availableUnits(th,'Troop',cc);}
function availableSpells(th,cc=false){return availableUnits(th,'Spell',cc);}
function availableSieges(th,cc=false){const t=getTownHallRecord(th); if(!t)return []; if(cc ? Number(t.ccSiegeCapacity||0)<1 : Number(t.siegeCapacity||0)<1)return []; return availableUnits(th,'Siege',cc);}
function getHeroes(th){return COC_GAME_DATA.heroes.map(h=>{const max=getHeroMaxLevel(h.name,th);return max>0?{name:h.name,maxLevel:max}:null;}).filter(Boolean);}
function getPets(th){return COC_GAME_DATA.pets.map(p=>{const max=getPetMaxLevel(p,th);return max>0?{name:p.name,maxLevel:max}:null;}).filter(Boolean);}
function getEquipment(th){return COC_GAME_DATA.equipment.map(e=>{const max=getEquipmentMaxLevel(e,th);return max>0?{name:e.name,hero:e.hero,maxLevel:max}:null;}).filter(Boolean);}
function getCocSnapshot(th){
  const t=getTownHallRecord(th); if(!t)throw new Error(`No verified Town Hall ${th}`);
  const troops=availableTroops(th), spells=availableSpells(th), sieges=availableSieges(th), ccTroops=availableTroops(th,true), ccSpells=availableSpells(th,true), ccSieges=availableSieges(th,true), heroes=getHeroes(th), pets=getPets(th), equipment=getEquipment(th);
  return {townHall:th,dataVersion:COC_DATA_VERSION,dataSource:COC_DATA_SOURCE,army:{camps:Number(t.maxBarracks||0),totalCapacity:Number(t.troopCapacity||0),capacityPerCamp:t.maxBarracks?Number(t.troopCapacity||0)/Number(t.maxBarracks):0,ownSiegeCapacity:Number(t.siegeCapacity||0)},spellCapacity:Number(t.spellCapacity||0),clanCastle:{level:Number(t.maxCc||0),troopCapacity:Number(t.ccTroopCapacity||0),spellCapacity:Number(t.ccSpellCapacity||0),siegeMachineCapacity:Number(t.ccSiegeCapacity||0)},heroes,heroHallLevel:null,pets,petHouseLevel:Number(t.maxPetHouse||0),equipment,blacksmithLevel:Number(t.maxBlacksmith||0),troops,spells,siegeMachines:sieges,clanCastleTroops:ccTroops,clanCastleSpells:ccSpells,clanCastleSiegeMachines:ccSieges,counts:{availableTroops:troops.length,availableSpells:spells.length,availableOwnSiegeMachines:sieges.length,availableClanCastleSiegeMachines:ccSieges.length,availableClanCastleTroops:ccTroops.length,availableClanCastleSpells:ccSpells.length,availableHeroes:heroes.length,availablePets:pets.length,availableEquipment:equipment.length}};
}

app.get("/api/coc/game-data",(req,res)=>{const th=validTH(req.query.townHall);if(!th)return res.status(400).json({error:"townHall must be an integer from 1 to 18."});try{res.json(getCocSnapshot(th));}catch(e){console.error(e);res.status(500).json({error:"Unable to load Clash of Clans game data."});}});
app.get("/api/coc/data-source",(_req,res)=>res.json({dataVersion:COC_DATA_VERSION,source:COC_DATA_SOURCE,townHalls:COC_GAME_DATA.townHalls.length,note:"ClashArmies source game-data.json5 and its unlock/validation rules were imported into this backend. This is community data, not the official Supercell API."}));

function find(list,name){const n=String(name||'').trim().toLowerCase();return (list||[]).find(x=>String(x.name).toLowerCase()===n)||null;}
function normalizeCountList(list){return Array.isArray(list)?list.map(x=>({name:String(x?.name||'').trim(),count:Math.max(0,Math.floor(Number(x?.count||0)))})).filter(x=>x.name&&x.count>0):[];}
function addCount(list,name,count){if(count<=0)return;const row=list.find(x=>x.name===name);if(row)row.count+=count;else list.push({name,count});}
function fillCapacity(candidates,capacity,weights={}){
  const result=[]; let remaining=Number(capacity||0);
  for(const c of candidates){if(remaining<=0)break;const space=Number(c.housingSpace||0);if(space<=0)continue;const desired=weights[c.name];let count=desired==null?Math.floor(remaining/space):Math.min(Number(desired),Math.floor(remaining/space));if(count>0){result.push({name:c.name,count});remaining-=count*space;}}
  return result;
}
function totalSpace(list,verified){return normalizeCountList(list).reduce((s,x)=>s+x.count*Number(find(verified,x.name)?.housingSpace||0),0);}
function trimToCapacity(list,verified,capacity){const out=[];let remaining=Number(capacity||0);for(const item of normalizeCountList(list)){const v=find(verified,item.name);if(!v)continue;const space=Number(v.housingSpace||0);if(!space)continue;const count=Math.min(item.count,Math.floor(remaining/space));if(count>0){out.push({name:v.name,count});remaining-=count*space;}}return out;}
function chooseStrategy(th,data){
  const names=new Set(data.troops.map(x=>x.name));
  if(th>=14 && names.has('Root Rider')) return 'root-rider';
  if(th>=13 && names.has('Electro Titan')) return 'electro-titan';
  if(th>=11 && names.has('Electro Dragon')) return 'electro-dragon';
  if(th>=10 && names.has('Miner')) return 'miner';
  if(th>=9 && names.has('Hog Rider')) return 'hog';
  if(th>=7 && names.has('Dragon')) return 'dragon';
  if(th>=6 && names.has('Healer') && names.has('Giant')) return 'giant-healer';
  if(th>=4 && names.has('Wizard') && names.has('Giant')) return 'giant-wizard';
  if(names.has('Giant')) return 'giant';
  if(names.has('Archer')) return 'archer';
  return 'basic';
}
function chooseByNames(data,names){return names.map(n=>find(data,n)).filter(Boolean);}
function buildStrategyArmy(th,data,strategy){
  const troops=data.troops, spells=data.spells, ccTroops=data.clanCastleTroops, ccSpells=data.clanCastleSpells;
  const by=(name)=>find(troops,name);
  const available=(names)=>chooseByNames(troops,names);
  let army=[];
  const cap=data.army.totalCapacity;
  const has=n=>!!by(n);
  const use=(name,count)=>{const u=by(name);if(u)addCount(army,u.name,Math.max(0,Math.floor(count)));};

  if(strategy==='dragon' && has('Dragon')){
    const dragon=by('Dragon'); const balloon=by('Balloon'); const minion=by('Minion');
    const d=Math.floor(cap/dragon.housingSpace*0.65); use('Dragon',d); if(balloon){const rem=cap-totalSpace(army,troops);use('Balloon',Math.floor(rem/balloon.housingSpace*0.65));} if(minion){const rem=cap-totalSpace(army,troops);use('Minion',Math.floor(rem/minion.housingSpace));}
  } else if(strategy==='giant-healer' && has('Giant')){
    const giant=by('Giant'); const healer=by('Healer'); const wizard=by('Wizard'); const wb=by('Wall Breaker');
    use('Giant',Math.floor(cap*0.52/giant.housingSpace)); if(healer){const rem=cap-totalSpace(army,troops);use('Healer',Math.min(5,Math.floor(rem/healer.housingSpace)));} if(wb){const rem=cap-totalSpace(army,troops);use('Wall Breaker',Math.min(8,Math.floor(rem/wb.housingSpace)));} if(wizard){const rem=cap-totalSpace(army,troops);use('Wizard',Math.floor(rem/wizard.housingSpace));}
  } else if(strategy==='hog' && has('Hog Rider')){
    const hog=by('Hog Rider'); const wizard=by('Wizard'); const archer=by('Archer'); use('Hog Rider',Math.floor(cap*0.62/hog.housingSpace)); if(wizard){const rem=cap-totalSpace(army,troops);use('Wizard',Math.floor(rem*0.7/wizard.housingSpace));} if(archer){const rem=cap-totalSpace(army,troops);use('Archer',Math.floor(rem/archer.housingSpace));}
  } else if(strategy==='miner' && has('Miner')){
    const miner=by('Miner'); const healer=by('Healer'); const wizard=by('Wizard'); use('Miner',Math.floor(cap*0.7/miner.housingSpace)); if(healer){const rem=cap-totalSpace(army,troops);use('Healer',Math.min(5,Math.floor(rem/healer.housingSpace)));} if(wizard){const rem=cap-totalSpace(army,troops);use('Wizard',Math.floor(rem/wizard.housingSpace));}
  } else if(strategy==='electro-dragon' && has('Electro Dragon')){
    const ed=by('Electro Dragon'); const balloon=by('Balloon'); const minion=by('Minion'); use('Electro Dragon',Math.floor(cap*0.72/ed.housingSpace)); if(balloon){const rem=cap-totalSpace(army,troops);use('Balloon',Math.floor(rem*0.7/balloon.housingSpace));} if(minion){const rem=cap-totalSpace(army,troops);use('Minion',Math.floor(rem/minion.housingSpace));}
  } else if(strategy==='electro-titan' && has('Electro Titan')){
    const et=by('Electro Titan'); const healer=by('Healer'); const wizard=by('Wizard'); use('Electro Titan',Math.floor(cap*0.62/et.housingSpace)); if(healer){const rem=cap-totalSpace(army,troops);use('Healer',Math.min(5,Math.floor(rem/healer.housingSpace)));} if(wizard){const rem=cap-totalSpace(army,troops);use('Wizard',Math.floor(rem/wizard.housingSpace));}
  } else if(strategy==='root-rider' && has('Root Rider')){
    const rr=by('Root Rider'); const valk=by('Valkyrie'); const healer=by('Healer'); const wizard=by('Wizard'); use('Root Rider',Math.floor(cap*0.55/rr.housingSpace)); if(valk){const rem=cap-totalSpace(army,troops);use('Valkyrie',Math.floor(rem*0.55/valk.housingSpace));} if(healer){const rem=cap-totalSpace(army,troops);use('Healer',Math.min(5,Math.floor(rem/healer.housingSpace)));} if(wizard){const rem=cap-totalSpace(army,troops);use('Wizard',Math.floor(rem/wizard.housingSpace));}
  } else if(strategy==='giant-wizard' && has('Giant')){
    const giant=by('Giant'); const wizard=by('Wizard'); const wb=by('Wall Breaker'); const archer=by('Archer'); use('Giant',Math.floor(cap*0.48/giant.housingSpace)); if(wb){const rem=cap-totalSpace(army,troops);use('Wall Breaker',Math.min(8,Math.floor(rem/wb.housingSpace)));} if(wizard){const rem=cap-totalSpace(army,troops);use('Wizard',Math.floor(rem*0.75/wizard.housingSpace));} if(archer){const rem=cap-totalSpace(army,troops);use('Archer',Math.floor((cap-totalSpace(army,troops))/archer.housingSpace));}
  } else if(strategy==='giant' && has('Giant')){
    const giant=by('Giant'); const archer=by('Archer'); use('Giant',Math.floor(cap*0.55/giant.housingSpace)); if(archer){const rem=cap-totalSpace(army,troops);use('Archer',Math.floor(rem/archer.housingSpace));}
  } else if(strategy==='archer' && has('Archer')){use('Archer',Math.floor(cap/by('Archer').housingSpace));}
  else { const ordered=troops.slice(0,6); army=fillCapacity(ordered,cap); }

  army=trimToCapacity(army,troops,cap);
  // If rounding left space, fill with a cheap ranged troop rather than leaving a large gap.
  const rem=cap-totalSpace(army,troops); const filler=troops.find(x=>x.name==='Archer')||troops.find(x=>x.housingSpace===1)||troops[0]; if(rem>0&&filler)addCount(army,filler.name,Math.floor(rem/filler.housingSpace));
  army=trimToCapacity(army,troops,cap);

  let spellPlan=[]; const spellCap=data.spellCapacity;
  const addSpell=(name,count)=>{const s=find(spells,name);if(s)addCount(spellPlan,s.name,count);};
  if(spellCap>0){
    if(find(spells,'Rage')) addSpell('Rage',Math.min(2,Math.floor(spellCap/2)));
    if(find(spells,'Freeze')){const rems=spellCap-totalSpace(spellPlan,spells);addSpell('Freeze',Math.min(2,Math.floor(rems/1)));}
    if(find(spells,'Lightning') && totalSpace(spellPlan,spells)<spellCap){const rems=spellCap-totalSpace(spellPlan,spells);addSpell('Lightning',Math.floor(rems/find(spells,'Lightning').housingSpace));}
    if(find(spells,'Heal') && totalSpace(spellPlan,spells)<spellCap){const rems=spellCap-totalSpace(spellPlan,spells);addSpell('Heal',Math.floor(rems/find(spells,'Heal').housingSpace));}
  }
  spellPlan=trimToCapacity(spellPlan,spells,spellCap);

  // Recommended CC: use a high-impact troop that is actually donateable at this TH.
  const cc=[]; let ccRemaining=data.clanCastle.troopCapacity;
  const ccOrder=['Hog Rider','Balloon','Dragon','Wizard','Valkyrie','Giant','Archer','Barbarian'];
  for(const name of ccOrder){const u=find(ccTroops,name);if(!u||ccRemaining<=0)continue;const c=Math.floor(ccRemaining/u.housingSpace);if(c>0){addCount(cc,u.name,c);ccRemaining-=c*u.housingSpace;break;}}
  if(!cc.length && ccTroops.length){const u=ccTroops.find(x=>x.housingSpace>0);const c=Math.floor(ccRemaining/u.housingSpace);if(c>0)addCount(cc,u.name,c);}
  const ccSpell=[]; let ccs=data.clanCastle.spellCapacity; for(const name of ['Rage','Heal','Freeze','Lightning','Invisibility']){const s=find(ccSpells,name);if(s&&ccs>=s.housingSpace){addCount(ccSpell,s.name,1);ccs-=s.housingSpace;break;}}
  let siegeMachine=null; if(data.clanCastle.siegeMachineCapacity>0){const preferred=['Siege Barracks','Log Launcher','Wall Wrecker','Stone Slammer','Flame Flinger','Battle Drill']; siegeMachine=(preferred.map(n=>find(data.clanCastleSiegeMachines,n)).find(Boolean)||data.clanCastleSiegeMachines[0])?.name||null;}
  const heroes=data.heroes.map(h=>h.name);
  const pets=[]; for(const h of heroes){const pet=data.pets.find(p=>!pets.some(x=>x.pet===p.name)); if(pet)pets.push({hero:h,pet:pet.name});}
  const equipment=[]; for(const h of heroes){const eq=data.equipment.filter(e=>e.hero===h).slice(0,2); for(const e of eq)equipment.push({hero:h,equipment:e.name});}
  return {army:{troops:army,spells:spellPlan,siegeMachine,clanCastleTroops:cc,clanCastleSpells:ccSpell,heroes,pets,equipment},strategy,summary:`${strategy} strategy built from ClashArmies verified Town Hall ${th} rules.`,attackGuide:buildGuide(strategy)};
}
function generateArmyLink(army){
  const buildUnitStr=(list)=>normalizeCountList(list||[]).map(item=>{
    const u=COC_GAME_DATA.troops.concat(COC_GAME_DATA.sieges).find(x=>x.name===item.name);
    if(!u || !Number.isInteger(Number(u.clashId))) return null;
    return `${Math.max(0,Number(item.count)||0)}x${Number(u.clashId)}`;
  }).filter(Boolean).join('-');
  const buildSpellStr=(list)=>normalizeCountList(list||[]).map(item=>{
    const s=COC_GAME_DATA.spells.find(x=>x.name===item.name);
    if(!s || !Number.isInteger(Number(s.clashId))) return null;
    return `${Math.max(0,Number(item.count)||0)}x${Number(s.clashId)}`;
  }).filter(Boolean).join('-');
  const heroes={};
  for(const eq of Array.isArray(army.equipment)?army.equipment:[]){
    const h=String(eq.hero||''); if(!h) continue;
    if(!heroes[h]) heroes[h]={};
    const item=COC_GAME_DATA.equipment.find(x=>x.name===eq.equipment && x.hero===h);
    if(!item) continue;
    if(!heroes[h].eq1) heroes[h].eq1=item; else if(!heroes[h].eq2) heroes[h].eq2=item;
  }
  for(const pet of Array.isArray(army.pets)?army.pets:[]){
    const h=String(pet.hero||''); if(!h || !heroes[h]) heroes[h]={...(heroes[h]||{})};
    const item=COC_GAME_DATA.pets.find(x=>x.name===pet.pet);
    if(item && !heroes[h].pet) heroes[h].pet=item;
  }
  const parts=[];
  const heroParts=Object.entries(heroes).map(([name,h])=>{
    const hero=COC_GAME_DATA.heroes.find(x=>x.name===name);
    if(!hero || !Number.isInteger(Number(hero.clashId))) return null;
    let out=String(hero.clashId);
    if(h.pet && Number.isInteger(Number(h.pet.clashId))) out+=`p${Number(h.pet.clashId)}`;
    if(h.eq1 || h.eq2){
      const first=h.eq1||h.eq2; const second=first===h.eq1?h.eq2:h.eq1;
      if(first && Number.isInteger(Number(first.clashId))) out+=`e${Number(first.clashId)}`;
      if(second && Number.isInteger(Number(second.clashId))) out+=`_${Number(second.clashId)}`;
    }
    return out;
  }).filter(Boolean).join('-');
  if(heroParts) parts.push(`h${heroParts}`);
  const ccTroops=buildUnitStr(army.clanCastleTroops); if(ccTroops) parts.push(`i${ccTroops}`);
  const ccSpells=buildSpellStr(army.clanCastleSpells); if(ccSpells) parts.push(`d${ccSpells}`);
  const troops=buildUnitStr(army.troops); if(troops) parts.push(`u${troops}`);
  const spells=buildSpellStr(army.spells); if(spells) parts.push(`s${spells}`);
  return parts.length ? `https://link.clashofclans.com/?action=CopyArmy&army=${parts.join('')}` : null;
}

function buildGuide(strategy){const guides={
  'dragon':['Funnel both sides with a few support troops.','Deploy Dragons in a line toward the core.','Use Balloons to target key defenses and support the Dragons.','Use spells to keep the main air push moving through the core.'],
  'giant-healer':['Create a funnel on both sides.','Deploy Giants as the tank line.','Use Healers behind the Giants and Wall Breakers to open compartments.','Deploy Wizards behind the tank line for damage.'],
  'giant-wizard':['Create a funnel first.','Send Giants toward the main defenses.','Use Wall Breakers to open the first compartments.','Deploy Wizards behind the Giants and use spells on the densest defenses.'],
  'hog':['Create a funnel and remove key outer defenses.','Send Hog Riders toward defenses in a concentrated group.','Use Heal spells over high-damage areas.','Use the remaining support troops and heroes to clean up.'],
  'miner':['Create a funnel so the Miner group enters the intended area.','Deploy Miners in a controlled line or group.','Use Healers/support behind the push when available.','Use spells around concentrated defenses and the core.'],
  'electro-dragon':['Create a wide funnel.','Deploy Electro Dragons in a line so their chain attacks overlap.','Use Balloons to support the main push.','Use spells to help the air army reach the core.'],
  'electro-titan':['Create a funnel and keep the main group together.','Deploy Electro Titans with support behind them.','Use Healers where available to sustain the push.','Use spells on high-value defensive zones.'],
  'root-rider':['Create a funnel on both sides.','Send Root Riders into the main defensive line.','Use Valkyries and support troops behind the breach.','Use spells to sustain the ground push through the core.'],
  'giant':['Use Giants as the front line.','Open the first compartment with Wall Breakers when available.','Deploy ranged support behind the Giants.','Use spells on dense defenses.'],
  'archer':['Use small groups to clear exposed buildings.','Keep the army spread to reduce splash damage.','Use the hero and support units for the strongest defenses.','Clean up remaining buildings from the outside inward.'],
  'basic':['Use the basic troop group as the main push.','Keep the army spread enough to reduce splash damage.','Use the available support units around the main group.','Clean up remaining buildings from the outside inward.']}; return (guides[strategy]||guides.archer).map((text,i)=>({phase:`Phase ${i+1}`,steps:[text]}));}
function cleanAi(text){if(Array.isArray(text))text=text.map(x=>typeof x==='string'?x:(x&&x.text)||'').join('');if(typeof text!=='string')throw new Error('AI returned empty response');const t=text.trim();try{return JSON.parse(t);}catch{}const f=t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);if(f)return JSON.parse(f[1]);const s=t.indexOf('{'),e=t.lastIndexOf('}');if(s>=0&&e>s)return JSON.parse(t.slice(s,e+1));throw new Error('AI returned invalid JSON');}
function normalizeStrategy(s,data,th){const allowed=new Set(['dragon','giant-healer','giant-wizard','hog','miner','electro-dragon','electro-titan','root-rider','giant','archer']); const raw=String(s||'').toLowerCase().trim(); if(allowed.has(raw) && buildStrategyArmy(th,data,raw).army.troops.length)return raw; return chooseStrategy(th,data);}
async function askAiForStrategy(th,data){
  if(!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured.');
  const candidates=data.troops.map(x=>x.name).join(', ');
  const prompt=[`Town Hall ${th}. Choose one strategy name only from: dragon, giant-healer, giant-wizard, hog, miner, electro-dragon, electro-titan, root-rider, giant, archer.`,`Available verified troops: ${candidates}`,`Return JSON exactly like {"strategy":"dragon"}. Do not return an army. The server will build and validate the army.`].join('\n');
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),25000);
  try{const r=await fetch(OPENROUTER_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,"Content-Type":"application/json","HTTP-Referer":"https://jagathish.online","X-Title":"Jagathish CoC AI"},body:JSON.stringify({model:OPENROUTER_MODEL,temperature:0.1,max_tokens:120,reasoning:{effort:'none'},messages:[{role:'system',content:'You are a Clash of Clans strategy selector. Output JSON only.'},{role:'user',content:prompt}],response_format:{type:'json_object'}}),signal:controller.signal}); const raw=await r.text(); let j=null; try{j=JSON.parse(raw);}catch{} if(!r.ok)throw new Error(`AI provider request failed (${r.status})`); const out=cleanAi(j?.choices?.[0]?.message?.content); return {strategy:normalizeStrategy(out?.strategy,data,th),model:j?.model||OPENROUTER_MODEL};} finally{clearTimeout(timeout);}
}

app.post("/api/coc/generate-army",async(req,res)=>{
  const th=validTH(req.body?.townHall); if(!th)return res.status(400).json({error:"townHall must be an integer from 1 to 18."});
  try{
    const data=getCocSnapshot(th); let strategy,model=OPENROUTER_MODEL,generationMode='ai-strategy'; let providerReason='';
    try{const ai=await askAiForStrategy(th,data);strategy=ai.strategy;model=ai.model;}catch(e){providerReason=e?.message||'AI provider unavailable';strategy=chooseStrategy(th,data);generationMode='verified-server-strategy';console.warn('AI strategy unavailable; using deterministic strategy:',providerReason);}
    const built=buildStrategyArmy(th,data,strategy);
    const validation=validateFinalArmy(built.army,data);
    if(!validation.ok)return res.status(500).json({error:'Server strategy builder failed validation.',validationErrors:validation.errors});
    const armyLink=generateArmyLink(built.army);
    const strategySource=generationMode==='ai-strategy'?'AI':'verified-server-fallback';
    res.json({success:true,townHall:th,dataVersion:COC_DATA_VERSION,model,generationMode,strategySource,providerReason,repairApplied:false,strategy,army:built.army,armyLink,attackGuide:built.attackGuide,summary:providerReason?`AI strategy provider was unavailable (${providerReason}). A deterministic ${strategy} army was generated from verified ClashArmies data.`:built.summary,totals:validation.totals});
  }catch(e){console.error('CoC V7 generation error:',e);res.status(e?.name==='AbortError'?504:500).json({error:e?.name==='AbortError'?'AI provider timed out; a verified fallback should be used on the next request.':e.message||'Unable to generate army.'});}
});

function validateFinalArmy(army,data){const errors=[]; const troops=normalizeCountList(army.troops),spells=normalizeCountList(army.spells),ccTroops=normalizeCountList(army.clanCastleTroops),ccSpells=normalizeCountList(army.clanCastleSpells); const seen=new Set();
  for(const list of [troops,spells,ccTroops,ccSpells])for(const x of list){const key=x.name.toLowerCase(); if(seen.has(`${list===troops?'t':list===spells?'s':list===ccTroops?'c':'cs'}:${key}`))errors.push(`Duplicate unit: ${x.name}`); seen.add(`${list===troops?'t':list===spells?'s':list===ccTroops?'c':'cs'}:${key}`);}
  const ts=totalSpace(troops,data.troops), ss=totalSpace(spells,data.spells), cs=totalSpace(ccTroops,data.clanCastleTroops), css=totalSpace(ccSpells,data.clanCastleSpells); if(ts>data.army.totalCapacity)errors.push(`Troop capacity exceeded: ${ts}/${data.army.totalCapacity}`);if(ss>data.spellCapacity)errors.push(`Spell capacity exceeded: ${ss}/${data.spellCapacity}`);if(cs>data.clanCastle.troopCapacity)errors.push(`CC troop capacity exceeded: ${cs}/${data.clanCastle.troopCapacity}`);if(css>data.clanCastle.spellCapacity)errors.push(`CC spell capacity exceeded: ${css}/${data.clanCastle.spellCapacity}`);
  for(const x of troops)if(!find(data.troops,x.name))errors.push(`Unavailable troop: ${x.name}`); for(const x of spells)if(!find(data.spells,x.name))errors.push(`Unavailable spell: ${x.name}`); for(const x of ccTroops)if(!find(data.clanCastleTroops,x.name))errors.push(`Unavailable CC troop: ${x.name}`); for(const x of ccSpells)if(!find(data.clanCastleSpells,x.name))errors.push(`Unavailable CC spell: ${x.name}`);
  if(army.siegeMachine && !find(data.clanCastleSiegeMachines,army.siegeMachine))errors.push(`Unavailable CC siege machine: ${army.siegeMachine}`);
  const heroes=Array.isArray(army.heroes)?army.heroes:[], heroSet=new Set(); for(const h of heroes){const v=find(data.heroes,h);if(!v)errors.push(`Unavailable hero: ${h}`);else{if(heroSet.has(v.name))errors.push(`Duplicate hero: ${h}`);heroSet.add(v.name);}}
  const petHeroes=new Set(), pets=new Set(); for(const p of Array.isArray(army.pets)?army.pets:[]){const hero=find(data.heroes,p.hero),pet=find(data.pets,p.pet);if(!hero||!pet){errors.push(`Unavailable pet assignment: ${p.hero}/${p.pet}`);continue;}if(!heroSet.has(hero.name))errors.push(`Pet assigned to unselected hero: ${hero.name}`);if(petHeroes.has(hero.name))errors.push(`Hero has multiple pets: ${hero.name}`);if(pets.has(pet.name))errors.push(`Pet assigned twice: ${pet.name}`);petHeroes.add(hero.name);pets.add(pet.name);}
  const eqSlots=new Map(); for(const e of Array.isArray(army.equipment)?army.equipment:[]){const hero=find(data.heroes,e.hero),item=find(data.equipment,e.equipment);if(!hero||!item||item.hero!==hero.name){errors.push(`Unavailable equipment assignment: ${e.hero}/${e.equipment}`);continue;}if(!heroSet.has(hero.name))errors.push(`Equipment assigned to unselected hero: ${hero.name}`);const n=(eqSlots.get(hero.name)||0)+1;if(n>2)errors.push(`More than two equipment items on ${hero.name}`);eqSlots.set(hero.name,n);}
  return {ok:errors.length===0,errors,totals:{troopSpace:ts,troopCapacity:data.army.totalCapacity,spellSpace:ss,spellCapacity:data.spellCapacity,clanCastleTroopSpace:cs,clanCastleTroopCapacity:data.clanCastle.troopCapacity,clanCastleSpellSpace:css,clanCastleSpellCapacity:data.clanCastle.spellCapacity}};
}



// ---------------- AI BASE GENERATOR V11 ----------------
// Base layouts are community-shared deep links. We do not synthesize or alter layout payloads;
// the server selects a verified catalog entry matching the requested Town Hall and validates
// its Supercell share-link structure before returning it.
const BASE_CATALOG_URL = 'https://raw.githubusercontent.com/nschmeller/clash-bases/main/bases.json';
const BASE_CATALOG_TTL_MS = 10 * 60 * 1000;
let baseCatalogCache = { loadedAt: 0, entries: null };

function validBaseLink(link, th) {
  if (typeof link !== 'string' || !link.startsWith('https://link.clashofclans.com/')) return false;
  try {
    const u = new URL(link);
    if (u.searchParams.get('action') !== 'OpenLayout') return false;
    const id = decodeURIComponent(u.searchParams.get('id') || '');
    const m = id.match(/^TH(\d+):(HV|WB):([A-Za-z0-9_-]{32})$/);
    return !!m && Number(m[1]) === Number(th);
  } catch (_) { return false; }
}

async function loadBaseCatalog() {
  if (baseCatalogCache.entries && Date.now() - baseCatalogCache.loadedAt < BASE_CATALOG_TTL_MS) {
    return baseCatalogCache.entries;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(BASE_CATALOG_URL, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Base catalog request failed (${r.status})`);
    const raw = await r.json();
    // nschmeller/clash-bases currently wraps the catalogue in { bases: [...] }.
    // Keep compatibility with older array-shaped exports as well.
    const sourceEntries = Array.isArray(raw) ? raw : (Array.isArray(raw?.bases) ? raw.bases : null);
    if (!sourceEntries) throw new Error('Base catalog returned an invalid payload. Expected an array or { bases: [...] }.');
    const entries = sourceEntries.filter(x => Number.isInteger(Number(x?.town_hall)) && Number(x.town_hall) >= 4 && Number(x.town_hall) <= 18 && validBaseLink(x?.link, Number(x.town_hall)));
    if (!entries.length) throw new Error('Base catalog contains no structurally valid layouts.');
    baseCatalogCache = { loadedAt: Date.now(), entries };
    return entries;
  } finally { clearTimeout(timer); }
}

function baseTypesFor(entries, th) {
  const counts = {};
  for (const x of entries) if (Number(x.town_hall) === th) counts[x.type || 'Home Village'] = (counts[x.type || 'Home Village'] || 0) + 1;
  return counts;
}

function chooseBaseFallback(th, typeCounts) {
  const preferred = th >= 11 ? ['War', 'Hybrid', 'Trophy', 'Farm', 'Home Village'] : ['Hybrid', 'War', 'Farm', 'Trophy', 'Home Village'];
  return preferred.find(x => Number(typeCounts[x] || 0) > 0) || Object.keys(typeCounts)[0] || 'Home Village';
}

function normalizeRequestedBasePurpose(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'war') return 'War';
  if (['farm', 'farming', 'loot', 'loot/farming'].includes(v)) return 'Farm';
  if (v === 'trophy' || v === 'trophy push') return 'Trophy';
  if (v === 'hybrid') return 'Hybrid';
  if (v === 'home village' || v === 'general') return 'Home Village';
  return null;
}

async function askAiForBaseType(th, typeCounts) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured.');
  const available = Object.entries(typeCounts).map(([k,v]) => `${k}:${v}`).join(', ');
  const prompt = [
    `Town Hall ${th}. Choose one base purpose from the available community catalog.`,
    `Available types: ${available}`,
    `Prefer War for defensive war layouts, Farm for loot protection, Trophy for trophy protection, Hybrid for a balanced home base, and Home Village for general use.`,
    `Return JSON exactly like {"baseType":"War"}. Do not return a layout link or coordinates.`
  ].join('\n');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://jagathish.online', 'X-Title': 'Jagathish CoC Base AI' },
      body: JSON.stringify({ model: OPENROUTER_MODEL, temperature: 0.1, max_tokens: 80, reasoning: { effort: 'none' }, messages: [
        { role: 'system', content: 'You are a Clash of Clans base-purpose selector. Output JSON only.' },
        { role: 'user', content: prompt }
      ], response_format: { type: 'json_object' } }),
      signal: controller.signal
    });
    const raw = await r.text();
    let j = null; try { j = JSON.parse(raw); } catch (_) {}
    if (!r.ok) throw new Error(`AI provider request failed (${r.status})`);
    const out = cleanAi(j?.choices?.[0]?.message?.content);
    const type = String(out?.baseType || '').trim();
    if (!Object.prototype.hasOwnProperty.call(typeCounts, type)) throw new Error('AI selected an unavailable base type.');
    return { baseType: type, model: j?.model || OPENROUTER_MODEL };
  } finally { clearTimeout(timeout); }
}

function selectBase(entries, th, baseType) {
  const sameTh = entries.filter(x => Number(x.town_hall) === th);
  const typed = sameTh.filter(x => String(x.type || '').toLowerCase() === String(baseType).toLowerCase());
  const pool = typed.length ? typed : sameTh;
  if (!pool.length) throw new Error(`No community base layouts are available for Town Hall ${th}.`);
  // Prefer recently added entries, then stable id ordering. This keeps selection deterministic and avoids
  // making a subjective "best base" claim.
  return [...pool].sort((a,b) => String(b.added || '').localeCompare(String(a.added || '')) || String(a.id || '').localeCompare(String(b.id || '')))[0];
}


const CREATIVE_CATEGORIES = [
  'Fun', 'Character', 'Creature', 'Icon / Symbol', 'Shape / Pattern', 'Maze / Puzzle',
  'Meme / Troll', 'Theme', 'Fantasy', 'Seasonal', 'Letter / Number', 'Abstract',
  'Experimental', 'AI Surprise'
];

const CREATIVE_SHAPES = [
  'heart','skull','dragon','crown','star','eagle','tiger','robot','sword','shield','fire','space',
  'spiral','maze','circle','square','diamond','lightning','flower','clover','infinity','letter','number','chaos'
];

function normalizeCreativeCategory(value) {
  const v=String(value||'').trim().toLowerCase();
  const map={
    'fun':'Fun','character':'Character','creature':'Creature','icon':'Icon / Symbol','symbol':'Icon / Symbol',
    'icon / symbol':'Icon / Symbol','shape':'Shape / Pattern','pattern':'Shape / Pattern','shape / pattern':'Shape / Pattern',
    'maze':'Maze / Puzzle','puzzle':'Maze / Puzzle','maze / puzzle':'Maze / Puzzle','meme':'Meme / Troll','troll':'Meme / Troll',
    'meme / troll':'Meme / Troll','theme':'Theme','fantasy':'Fantasy','seasonal':'Seasonal',
    'letter':'Letter / Number','number':'Letter / Number','letter / number':'Letter / Number','abstract':'Abstract',
    'experimental':'Experimental','ai surprise':'AI Surprise'
  };
  return map[v] || 'Fun';
}

function fallbackCreativeIdeas(th, category, prompt) {
  const p=String(prompt||'').trim();
  const bank={
    'Fun':[
      ['Dragon Fortress','Creature','dragon','A recognizable dragon silhouette with a protected central core.'],
      ['Skull Maze','Meme / Troll','skull','A skull-shaped maze with misleading outer entrances.'],
      ['Clash Crown','Icon / Symbol','crown','A crown silhouette built from symmetric compartments.']
    ],
    'Character':[
      ['Robot Guardian','Character','robot','A robot-like silhouette with the Town Hall as its power core.'],
      ['Dragon Rider','Character','dragon','A fantasy character silhouette with layered defensive wings.'],
      ['Shield Hero','Character','shield','A shield-shaped defensive emblem with a compact core.']
    ],
    'Creature':[
      ['Dragon','Creature','dragon','A dragon head and wings surrounding the core.'],
      ['Eagle','Creature','eagle','A bird-like silhouette with wide defensive wings.'],
      ['Tiger','Creature','tiger','A striped creature-inspired pattern around the core.']
    ],
    'Icon / Symbol':[
      ['Heart of the Village','Icon / Symbol','heart','A heart-shaped defensive emblem.'],
      ['Royal Crown','Icon / Symbol','crown','A crown-shaped symmetric layout.'],
      ['Shield Emblem','Icon / Symbol','shield','A shield icon around the Town Hall.']
    ],
    'Shape / Pattern':[
      ['Galaxy Spiral','Shape / Pattern','spiral','A spiral with layered rings and a central core.'],
      ['Diamond Core','Shape / Pattern','diamond','A diamond silhouette with mirrored defensive arms.'],
      ['Infinite Loop','Shape / Pattern','infinity','An infinity-shaped route with two false cores.']
    ],
    'Maze / Puzzle':[
      ['Labyrinth','Maze / Puzzle','maze','A multi-ring maze with deceptive entry paths.'],
      ['Spiral Puzzle','Maze / Puzzle','spiral','A spiral route that makes the attacker cross multiple layers.'],
      ['Four Gates','Maze / Puzzle','square','Four mirrored gates around a compact center.']
    ],
    'Meme / Troll':[
      ['Giant Skull Troll','Meme / Troll','skull','A funny skull silhouette with intentionally confusing entrances.'],
      ['Fake Core','Meme / Troll','chaos','Several visual false cores surrounding the real center.'],
      ['Trap Maze','Meme / Troll','maze','A maze concept designed around surprise paths.']
    ],
    'Theme':[
      ['Space Station','Theme','space','A sci-fi orbital pattern around the core.'],
      ['Fire Temple','Theme','fire','A fiery symmetrical temple concept.'],
      ['Royal Fortress','Theme','crown','A castle-like royal emblem.']
    ],
    'Fantasy':[
      ['Dragon Realm','Fantasy','dragon','A fantasy dragon silhouette with a fortress core.'],
      ['Magic Star','Fantasy','star','A five-point magical star around the center.'],
      ['Sword Temple','Fantasy','sword','A sword-shaped fortress with protected edges.']
    ],
    'Seasonal':[
      ['Winter Star','Seasonal','star','A snowflake-inspired radial pattern.'],
      ['Festival Heart','Seasonal','heart','A festive heart with mirrored compartments.'],
      ['Firework Burst','Seasonal','star','A radial burst pattern around the Town Hall.']
    ],
    'Letter / Number':[
      [`TH${th} Number Base`,'Letter / Number','number',`A layout that visually forms the number ${th}.`],
      ['J Letter','Letter / Number','letter','A large J-shaped pattern.'],
      ['X Mark','Letter / Number','diamond','A bold X-like symmetric pattern.']
    ],
    'Abstract':[
      ['Chaos Geometry','Abstract','chaos','An intentionally asymmetric geometric pattern.'],
      ['Infinity Field','Abstract','infinity','A continuous-loop inspired shape.'],
      ['Radial Pulse','Abstract','star','A radial energy pattern from the core.']
    ],
    'Experimental':[
      ['AI Chaos','Experimental','chaos','A deliberately unusual asymmetric defensive concept.'],
      ['Double Core Illusion','Experimental','circle','Two visual centers with one actual Town Hall core.'],
      ['Broken Spiral','Experimental','spiral','A fragmented spiral with irregular defensive pockets.']
    ],
    'AI Surprise':[
      ['AI Dragon Eye','Creature','dragon','An unexpected dragon-eye concept with a strong central pupil.'],
      ['Clockwork Maze','Experimental','circle','A mechanical circular maze with repeating gears.'],
      ['Phoenix Emblem','Fantasy','fire','A fiery bird-inspired emblem rising around the core.']
    ]
  };
  const rows=bank[category]||bank['AI Surprise'];
  return rows.map((r,i)=>({title:r[0],category:r[1],icon:r[2],concept:r[3],style:i===0?'high symmetry':i===1?'layered':'asymmetric',defensiveGoal:'Protect the central core while preserving the requested visual identity.',visualPattern:r[2],tags:[category,'TH'+th,'AI concept'],userPrompt:p||null}));
}

async function askAiForCreativeIdeas(th, category, prompt) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured.');
  const requested = CREATIVE_CATEGORIES.includes(category) ? category : 'AI Surprise';
  const userPrompt=[
    `Town Hall ${th}. You are the creative director for a Clash of Clans base concept lab.`,
    `Category: ${requested}.`,
    `User idea: ${String(prompt||'No specific idea; invent something surprising.').slice(0,600)}`,
    'Invent THREE clearly different base concepts. You may invent a more specific sub-category if useful.',
    'Think about shapes, icons, characters, creatures, letters, numbers, mazes, symbols, themes, jokes, patterns, symmetry, asymmetry and unusual concepts.',
    'The concepts are design blueprints, not official Clash layouts. Never invent an OpenLayout link.',
    'Return JSON only: {"ideas":[{"title":"...","category":"...","icon":"...","concept":"...","style":"...","defensiveGoal":"...","visualPattern":"...","tags":["..."]}]}.'
  ].join('\n');
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),18000);
  try {
    const r=await fetch(OPENROUTER_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':'https://jagathish.online','X-Title':'Jagathish CoC AI Base Lab'},body:JSON.stringify({model:OPENROUTER_MODEL,temperature:0.9,max_tokens:900,reasoning:{effort:'none'},messages:[{role:'system',content:'You are a creative game-layout concept designer. Output JSON only.'},{role:'user',content:userPrompt}],response_format:{type:'json_object'}}),signal:controller.signal});
    const raw=await r.text(); let j=null; try{j=JSON.parse(raw);}catch(_){ }
    if(!r.ok) throw new Error(`AI provider request failed (${r.status})`);
    const out=cleanAi(j?.choices?.[0]?.message?.content);
    const ideas=Array.isArray(out?.ideas)?out.ideas.slice(0,3).map((x,i)=>({
      title:String(x?.title||`AI Concept ${i+1}`).slice(0,80), category:String(x?.category||requested).slice(0,50), icon:String(x?.icon||'✨').slice(0,12),
      concept:String(x?.concept||'Creative Town Hall base concept.').slice(0,500), style:String(x?.style||'distinctive').slice(0,100),
      defensiveGoal:String(x?.defensiveGoal||'Protect the core while preserving the concept.').slice(0,250), visualPattern:String(x?.visualPattern||'custom').slice(0,80),
      tags:Array.isArray(x?.tags)?x.tags.slice(0,6).map(v=>String(v).slice(0,30)):[]
    })):[];
    if(ideas.length<3) throw new Error('AI returned fewer than three creative concepts.');
    return {ideas,model:j?.model||OPENROUTER_MODEL};
  } finally {clearTimeout(timeout);}
}

function creativeThemeFromPrompt(prompt, shape) {
  const raw=String(shape||prompt||'').toLowerCase();
  const themes=[['dragon','Dragon'],['skull','Skull'],['heart','Heart'],['crown','Crown'],['star','Star'],['eagle','Eagle'],['tiger','Tiger'],['robot','Robot'],['sword','Sword'],['shield','Shield'],['fire','Fire'],['space','Space'],['spiral','Spiral'],['maze','Maze'],['circle','Geometric'],['square','Geometric'],['diamond','Diamond'],['lightning','Lightning'],['flower','Flower'],['clover','Clover'],['infinity','Infinity'],['letter','Letter'],['number','Number'],['chaos','Chaos']];
  return themes.find(([key])=>raw.includes(key))?.[1]||'Surprise';
}
function pointInTheme(theme,x,y,n=22) {
  const cx=(n-1)/2,cy=(n-1)/2,dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy);
  if(theme==='Heart') return (dx*dx+Math.pow(dy-Math.abs(dx)*.65,2)<42&&dy<5)||(r<5);
  if(theme==='Star') {const a=Math.atan2(dy,dx);const rr=8*Math.cos(5*a)+11;return r<Math.max(0,rr);}
  if(theme==='Geometric') return r>7&&r<9.5;
  if(theme==='Spiral') return Math.abs(r-(2*aWrap(dx,dy)))<1.0;
  if(theme==='Skull') return (Math.abs(dx)<7&&Math.abs(dy)<6)||(Math.abs(dx)<3&&dy>4&&dy<9);
  if(theme==='Crown') return dy>-2&&dy<7&&Math.abs(dx)<9&&((Math.abs(dx)>5&&dy<2)||Math.abs(dx)<7);
  if(theme==='Sword') return Math.abs(dx)<2||(Math.abs(dy)<2&&dy<-3);
  if(theme==='Shield') return (dx*dx/70)+(dy*dy/100)<1&&dy>-8;
  if(theme==='Fire') return r<8&&dy<5&&Math.sin(dx*1.4+dy*.8)>-.4;
  if(theme==='Robot') return (Math.abs(dx)<7&&Math.abs(dy)<7)||(Math.abs(dx)<9&&dy>5&&dy<9);
  if(theme==='Dragon') return (Math.abs(dx)<3&&dy<7)||(Math.abs(dx)>3&&Math.abs(dx)<9&&dy>0&&dy<5)||(dx*dx/70+dy*dy/35<1&&dy<0);
  if(theme==='Eagle'||theme==='Tiger') return Math.abs(dx)<2||(Math.abs(dx)>2&&Math.abs(dx)<10&&Math.abs(dy)<Math.max(1,7-Math.abs(dx)*.45));
  if(theme==='Maze') return (Math.abs(dx)%4<1||Math.abs(dy)%4<1)&&r<10;
  if(theme==='Space'||theme==='Flower') return r<9&&((Math.round(x*7+y*13)%17)===0||r<4);
  if(theme==='Diamond') return Math.abs(dx)+Math.abs(dy)<10;
  if(theme==='Lightning') return Math.abs(dx+dy*.55)<1.5||Math.abs(dx-dy*.55)<1.5;
  if(theme==='Clover') return ((dx-4)**2+(dy-4)**2<25)||((dx+4)**2+(dy-4)**2<25)||((dx-4)**2+(dy+4)**2<25)||((dx+4)**2+(dy+4)**2<25);
  if(theme==='Infinity') return Math.abs(((dx*dx)/20-(dy*dy)/16)-1)<1.4;
  if(theme==='Letter'||theme==='Number') return Math.abs(dx)<1.5||Math.abs(dy)<1.5||Math.abs(dx-dy)<1.5||Math.abs(dx+dy)<1.5;
  if(theme==='Chaos') return ((x*17+y*31)%7)<3&&r<10;
  return r<8;
}
function aWrap(x,y){const a=Math.atan2(y,x);return (a+Math.PI)/(2*Math.PI)*8;}

function buildCreativeBlueprint(th, purpose, prompt, idea={}) {
  const theme=creativeThemeFromPrompt(prompt,idea.visualPattern||idea.icon); const n=22,placements=[]; const cx=Math.floor(n/2),cy=Math.floor(n/2);
  placements.push({id:'town_hall',x:cx-1,y:cy-1,w:2,h:2,category:'core'});
  const defenseIds=['inferno_tower','x_bow','air_defense','wizard_tower','archer_tower','cannon']; let di=0;
  const density=Math.max(.12,Math.min(.45,Number(idea.density||.28)));
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    if(x>=cx-1&&x<=cx&&y>=cy-1&&y<=cy) continue;
    if(!pointInTheme(theme,x,y,n)) continue;
    if(x===0||y===0||x===n-1||y===n-1) continue;
    const hash=((x*37+y*61)%100)/100;
    if(hash<density && placements.length<90) placements.push({id:'wall',x,y,w:1,h:1,category:'wall'});
    else if(hash<density+.12 && placements.length<52) placements.push({id:defenseIds[di++%defenseIds.length],x,y,w:1,h:1,category:'defense'});
  }
  const occupied=new Set(),valid=[]; for(const p of placements){const key=`${p.x},${p.y}`;if(!occupied.has(key)){occupied.add(key);valid.push(p);}}
  return {townHall:th,purpose,theme,prompt,idea,gridSize:n,placements:valid,validation:{ok:true,level:'structural',issues:[]},note:'AI-designed creative blueprint rendered by the server. It is a concept/export blueprint, not an official OpenLayout export.'};
}

app.post('/api/coc/generate-base-ideas', async (req,res)=>{
  const th=validTH(req.body?.townHall); if(!th)return res.status(400).json({error:'townHall must be an integer from 1 to 18.'});
  if(th<4)return res.status(400).json({error:'Creative AI bases start at Town Hall 4.'});
  const category=CREATIVE_CATEGORIES.includes(String(req.body?.category||''))?String(req.body.category):'AI Surprise';
  const prompt=String(req.body?.prompt||'').trim();
  try{
    try{
      const ai=await askAiForCreativeIdeas(th,category,prompt);
      return res.json({success:true,townHall:th,category,prompt,ideas:ai.ideas,generationMode:'ai-creative-ideas',model:ai.model,strategySource:'AI'});
    }catch(e){
      const ideas=fallbackCreativeIdeas(th,category,prompt);
      return res.json({success:true,townHall:th,category,prompt,ideas,generationMode:'verified-creative-fallback',model:null,strategySource:'verified-server-fallback',providerReason:e?.message||'AI provider unavailable'});
    }
  }catch(e){return res.status(500).json({error:e?.message||'Creative idea generation failed.'});}
});

app.post('/api/coc/generate-base-blueprint', async (req,res)=>{
  const th=validTH(req.body?.townHall); if(!th)return res.status(400).json({error:'townHall must be an integer from 1 to 18.'});
  if(th<4)return res.status(400).json({error:'Creative base blueprints start at Town Hall 4.'});
  const prompt=String(req.body?.prompt||'').trim()||'Surprise me with a creative base shape.';
  const purpose=String(req.body?.basePurpose||'AI Surprise').trim();
  const idea=req.body?.idea&&typeof req.body.idea==='object'?req.body.idea:{};
  try{
    let refinedIdea={...idea},model=null,generationMode='ai-blueprint';
    if(process.env.OPENROUTER_API_KEY){
      try{
        const ai=await askAiForCreativeIdeas(th,purpose,prompt);
        const wanted=String(idea?.title||'').toLowerCase();
        refinedIdea=ai.ideas.find(x=>String(x.title).toLowerCase()===wanted)||ai.ideas[0]||refinedIdea;
        model=ai.model;
      }catch(e){generationMode='verified-blueprint-fallback';refinedIdea={...fallbackCreativeIdeas(th,purpose,prompt)[0],...idea};}
    }else generationMode='verified-blueprint-fallback';
    const selected=buildCreativeBlueprint(th,purpose,prompt,refinedIdea);
    return res.json({success:true,townHall:th,generationMode,strategySource:generationMode==='ai-blueprint'?'AI':'verified-server-fallback',model,selected,candidates:[selected],export:{openLayout:false,jsonBlueprint:true},provider:generationMode==='ai-blueprint'?'OpenRouter creative model':'verified-server-creative-engine'});
  }catch(e){return res.status(500).json({error:e?.message||'Creative blueprint generation failed.'});}
});

app.get('/api/coc/base-catalog-status', async (req, res) => {
  const th = validTH(req.query.townHall);
  if (!th) return res.status(400).json({ error: 'townHall must be an integer from 1 to 18.' });
  try {
    const entries = await loadBaseCatalog();
    const counts = baseTypesFor(entries, th);
    res.json({ townHall: th, available: Object.values(counts).reduce((a,b)=>a+b,0), types: counts, source: 'community catalog: nschmeller/clash-bases', catalogUrl: BASE_CATALOG_URL });
  } catch (e) {
    res.status(503).json({ error: e?.message || 'Base catalog unavailable.' });
  }
});

app.post('/api/coc/generate-base', async (req, res) => {
  const th = validTH(req.body?.townHall);
  if (!th) return res.status(400).json({ error: 'townHall must be an integer from 1 to 18.' });
  try {
    if (th < 4) return res.status(400).json({ error: 'Base generator starts at Town Hall 4 because the community layout catalog begins at TH4.' });
    const entries = await loadBaseCatalog();
    const typeCounts = baseTypesFor(entries, th);
    if (!Object.keys(typeCounts).length) return res.status(404).json({ error: `No community base layouts are available for Town Hall ${th}.` });

    const requestedBasePurpose = normalizeRequestedBasePurpose(req.body?.basePurpose);
    let baseType, model = OPENROUTER_MODEL, generationMode = 'ai-base-type', providerReason = '';

    if (req.body?.basePurpose !== undefined && !requestedBasePurpose) {
      return res.status(400).json({ error: 'Invalid base purpose. Use War, Farm, Trophy, Hybrid, or Home Village.' });
    }

    if (requestedBasePurpose) {
      if (!Object.prototype.hasOwnProperty.call(typeCounts, requestedBasePurpose)) {
        return res.status(404).json({
          error: `No ${requestedBasePurpose === 'Farm' ? 'Farming / Loot' : requestedBasePurpose} community base layouts are available for Town Hall ${th}.`,
          availablePurposes: Object.keys(typeCounts)
        });
      }
      baseType = requestedBasePurpose;
      generationMode = 'requested-base-purpose';
      providerReason = '';
    } else {
      try {
        const ai = await askAiForBaseType(th, typeCounts);
        baseType = ai.baseType;
        model = ai.model;
      } catch (e) {
        providerReason = e?.message || 'AI provider unavailable';
        baseType = chooseBaseFallback(th, typeCounts);
        generationMode = 'verified-server-base-fallback';
        console.warn('AI base selector unavailable; using deterministic base type:', providerReason);
      }
    }

    const selected = selectBase(entries, th, baseType);
    if (!validBaseLink(selected.link, th)) return res.status(500).json({ error: 'Selected base link failed server validation.' });

    const strategySource = generationMode === 'ai-base-type' ? 'AI' : generationMode === 'requested-base-purpose' ? 'requested-purpose' : 'verified-server-fallback';
    res.json({
      success: true,
      townHall: th,
      model,
      generationMode,
      strategySource,
      providerReason,
      base: {
        id: selected.id || null,
        name: selected.name || `TH${th} ${baseType} Base`,
        type: selected.type || baseType,
        link: selected.link,
        image: selected.image || null,
        description: selected.description || '',
        builder: selected.builder || 'Community catalog',
        tags: Array.isArray(selected.tags) ? selected.tags : [],
        added: selected.added || null
      },
      source: 'Community layout catalog · structurally validated Supercell OpenLayout link',
      summary: generationMode === 'requested-base-purpose'
        ? `A verified ${baseType} community layout was selected for TH${th} from the requested base purpose.`
        : providerReason
          ? `AI base selector was unavailable (${providerReason}). A verified ${baseType} community layout was selected for TH${th}.`
          : `AI selected ${baseType}. The server selected and validated a matching TH${th} community layout link.`
    });
  } catch (e) {
    console.error('CoC V12 base generation error:', e);
    res.status(e?.name === 'AbortError' ? 504 : 500).json({ error: e?.name === 'AbortError' ? 'Base catalog or AI provider timed out.' : (e.message || 'Unable to generate base.') });
  }
});

app.listen(PORT,()=>console.log(`Server Running On Port ${PORT}`));
