const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 3000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const COC_DATA_VERSION = "clash-armies-game-data@0.12.5 (2026-09-05)";
const COC_DATA_SOURCE = "Uploaded Clash Armies structured game-data.json5";
const BACKEND_BUILD = "V4 · 2026-09-20";
const COC_GAME_DATA = require("./data/coc-game-data.json");

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "256kb" }));

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY EXISTS =", !!process.env.SUPABASE_KEY);
console.log("OPENROUTER_API_KEY EXISTS =", !!process.env.OPENROUTER_API_KEY);
console.log("OPENROUTER_MODEL =", OPENROUTER_MODEL);

/* -------------------- HOME -------------------- */

app.get("/", (req, res) => {
  res.json({
    message: "Jagathish Backend Running",
    cocAI: true,
    dataVersion: COC_DATA_VERSION
  });
});

/* -------------------- STATUS -------------------- */

app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    version: "1.1",
    service: "Jagathish Backend",
    backendBuild: BACKEND_BUILD,
    cocAI: !!process.env.OPENROUTER_API_KEY,
    cocData: COC_DATA_VERSION
  });
});

/* -------------------- EXISTING SUPABASE ROUTES -------------------- */

function requireSupabase(res) {
  if (!supabase) {
    res.status(503).json({ error: "Supabase is not configured on this server." });
    return false;
  }
  return true;
}

app.get("/api/files", async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    const { data, error } = await supabase.storage.from("files").list();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/files/:userid", async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    const { data, error } = await supabase.storage.from("files").list(req.params.userid);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/save-file", async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    const { user_id, filename, size, storage_path } = req.body;
    const { data, error } = await supabase
      .from("files_metadata")
      .insert([{ user_id, filename, size, storage_path, synced: false }])
      .select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/metadata/:userid", async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    const { data, error } = await supabase
      .from("files_metadata")
      .select("*")
      .eq("user_id", req.params.userid);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pending-files", async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    const { data, error } = await supabase
      .from("files_metadata")
      .select("*")
      .eq("synced", false);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/mark-synced/:id", async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    const { local_path } = req.body;
    const { data, error } = await supabase
      .from("files_metadata")
      .update({
        synced: true,
        local_path,
        synced_at: new Date().toISOString()
      })
      .eq("id", req.params.id)
      .select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/download-url/:id", async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    const { data, error } = await supabase
      .from("files_metadata")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const { data: urlData } = supabase.storage
      .from("files")
      .getPublicUrl(data.storage_path);

    res.json({
      filename: data.filename,
      url: urlData.publicUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------- COC VERIFIED DATA HELPERS -------------------- */

function validTH(value) {
  const th = Number(value);
  return Number.isInteger(th) && th >= 1 && th <= 18 ? th : null;
}

function getTownHallRecord(th) {
  return COC_GAME_DATA.townHalls.find(x => Number(x.level) === th) || null;
}

function maxEligibleLevel(entity, buildingLevel, laboratoryLevel) {
  if (!entity || !Array.isArray(entity.levels)) return null;

  const eligible = entity.levels.filter(level => {
    const buildingOk =
      buildingLevel == null ||
      Number(level.buildingLevel ?? level.petHouseLevel ?? level.blacksmithLevel ?? 0) <= Number(buildingLevel);

    const labRequired = level.laboratoryLevel;
    const laboratoryOk =
      laboratoryLevel == null ||
      labRequired == null ||
      Number(labRequired) <= Number(laboratoryLevel);

    return buildingOk && laboratoryOk;
  });

  return eligible.length ? eligible[eligible.length - 1] : null;
}

function summarizeEntity(entity, th, type, buildingLevel, laboratoryLevel) {
  const maxLevel = maxEligibleLevel(entity, buildingLevel, laboratoryLevel);
  if (!maxLevel) return null;

  return {
    name: entity.name,
    type,
    housingSpace: Number(entity.housingSpace || 0),
    maxLevel: Number(maxLevel.level || 0),
    productionBuilding: entity.productionBuilding || null,
    isSuper: Boolean(entity.isSuper),
    isFlying: Boolean(entity.isFlying),
    isJumper: Boolean(entity.isJumper),
    airTargets: Boolean(entity.airTargets),
    groundTargets: Boolean(entity.groundTargets)
  };
}

function getAvailableTroops(th) {
  const townHall = getTownHallRecord(th);
  if (!townHall) return [];

  return COC_GAME_DATA.troops
    .filter(troop => !troop.isSuper)
    .map(troop => {
      const buildingLevel =
        troop.productionBuilding === "Barrack"
          ? townHall.maxBarracks
          : townHall.maxDarkBarracks;

      return summarizeEntity(
        troop,
        th,
        "troop",
        buildingLevel,
        townHall.maxLaboratory
      );
    })
    .filter(Boolean);
}

function getAvailableSpells(th) {
  const townHall = getTownHallRecord(th);
  if (!townHall) return [];

  return COC_GAME_DATA.spells
    .filter(spell => !spell.isSuper)
    .map(spell => {
      const buildingLevel =
        spell.productionBuilding === "Spell Factory"
          ? townHall.maxSpellFactory
          : townHall.maxDarkSpellFactory;

      return summarizeEntity(
        spell,
        th,
        "spell",
        buildingLevel,
        townHall.maxLaboratory
      );
    })
    .filter(Boolean);
}

function getAvailableOwnSiegeMachines(th) {
  const townHall = getTownHallRecord(th);
  if (!townHall || !townHall.maxWorkshop || townHall.siegeCapacity < 1) return [];

  return COC_GAME_DATA.sieges
    .filter(siege => !siege.isSuper)
    .map(siege =>
      summarizeEntity(
        siege,
        th,
        "siege",
        townHall.maxWorkshop,
        townHall.maxLaboratory
      )
    )
    .filter(Boolean);
}

function getHeroData(th) {
  const townHall = getTownHallRecord(th);
  const allowed = new Map(
    (townHall?.heroMaxLevels || []).map(x => [String(x.hero).toLowerCase(), Number(x.maxLevel)])
  );

  return COC_GAME_DATA.heroes
    .map(hero => {
      const maxLevel = allowed.get(String(hero.name).toLowerCase());
      if (!maxLevel) return null;
      return {
        name: hero.name,
        maxLevel
      };
    })
    .filter(Boolean);
}

function getAvailablePets(th) {
  const townHall = getTownHallRecord(th);
  const petHouseLevel = Number(townHall?.maxPetHouse || 0);
  if (!petHouseLevel) return [];

  return COC_GAME_DATA.pets.map(pet => {
    const eligible = (pet.levels || []).filter(level =>
      Number(level.petHouseLevel || 0) <= petHouseLevel
    );
    if (!eligible.length) return null;
    return {
      name: pet.name,
      maxLevel: Number(eligible[eligible.length - 1].level || 0)
    };
  }).filter(Boolean);
}

function getAvailableEquipment(th) {
  const townHall = getTownHallRecord(th);
  const blacksmithLevel = Number(townHall?.maxBlacksmith || 0);
  if (!blacksmithLevel) return [];

  return COC_GAME_DATA.equipment.map(item => {
    const eligible = (item.levels || []).filter(level => {
      const required = level.blacksmithLevel;
      return required == null || Number(required) <= blacksmithLevel;
    });
    if (!eligible.length) return null;
    return {
      name: item.name,
      hero: item.hero || null,
      maxLevel: Number(eligible[eligible.length - 1].level || 0)
    };
  }).filter(Boolean);
}

function getCocSnapshot(th) {
  const townHall = getTownHallRecord(th);
  if (!townHall) throw new Error(`No verified game-data record for Town Hall ${th}.`);

  const troops = getAvailableTroops(th);
  const spells = getAvailableSpells(th);
  const siegeMachines = getAvailableOwnSiegeMachines(th);
  // A Clan Castle siege machine is donated by another player, so the
  // recipient does not need their own Siege Workshop.
  const clanCastleSiegeMachines = Number(townHall.ccSiegeCapacity || 0) > 0
    ? COC_GAME_DATA.sieges
        .filter(siege => !siege.isSuper)
        .map(siege => summarizeEntity(siege, th, "siege", null, townHall.maxLaboratory))
        .filter(Boolean)
    : [];
  const heroes = getHeroData(th);
  const pets = getAvailablePets(th);
  const equipment = getAvailableEquipment(th);

  return {
    townHall: th,
    dataVersion: COC_DATA_VERSION,
    dataSource: COC_DATA_SOURCE,
    army: {
      camps: Number(townHall.maxBarracks || 0),
      totalCapacity: Number(townHall.troopCapacity || 0),
      capacityPerCamp: townHall.maxBarracks
        ? Number(townHall.troopCapacity || 0) / Number(townHall.maxBarracks || 1)
        : 0,
      ownSiegeCapacity: Number(townHall.siegeCapacity || 0)
    },
    // This is the player's total spell-storage capacity.
    // Do NOT add Spell Factory + Dark Spell Factory capacities together.
    spellCapacity: Number(townHall.spellCapacity || 0),
    clanCastle: {
      level: Number(townHall.maxCc || 0),
      troopCapacity: Number(townHall.ccTroopCapacity || 0),
      spellCapacity: Number(townHall.ccSpellCapacity || 0),
      siegeMachineCapacity: Number(townHall.ccSiegeCapacity || 0)
    },
    heroes,
    heroHallLevel: null,
    pets,
    petHouseLevel: Number(townHall.maxPetHouse || 0),
    equipment,
    blacksmithLevel: Number(townHall.maxBlacksmith || 0),
    troops,
    spells,
    siegeMachines,
    clanCastleSiegeMachines,
    counts: {
      availableTroops: troops.length,
      availableSpells: spells.length,
      availableOwnSiegeMachines: siegeMachines.length,
      availableClanCastleSiegeMachines: clanCastleSiegeMachines.length,
      availableHeroes: heroes.length,
      availablePets: pets.length,
      availableEquipment: equipment.length
    }
  };
}

/* -------------------- COC GAME DATA -------------------- */

app.get("/api/coc/game-data", (req, res) => {
  const th = validTH(req.query.townHall);
  if (!th) return res.status(400).json({ error: "townHall must be an integer from 1 to 18." });

  try {
    res.json(getCocSnapshot(th));
  } catch (err) {
    console.error("CoC data error:", err);
    res.status(500).json({ error: "Unable to load Clash of Clans game data." });
  }
});

app.get("/api/coc/data-source", (_req, res) => {
  res.json({
    dataVersion: COC_DATA_VERSION,
    source: COC_DATA_SOURCE,
    townHalls: COC_GAME_DATA.townHalls.length,
    note: "Structured fan-maintained data supplied with this backend; not the official Supercell API."
  });
});

/* -------------------- COC AI GENERATOR -------------------- */

const armySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    army: {
      type: "object",
      additionalProperties: false,
      properties: {
        troops: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              count: { type: "integer", minimum: 1, maximum: 100 }
            },
            required: ["name", "count"]
          }
        },
        spells: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              count: { type: "integer", minimum: 1, maximum: 20 }
            },
            required: ["name", "count"]
          }
        },
        siegeMachine: { anyOf: [{ type: "string" }, { type: "null" }] },
        clanCastleTroops: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              count: { type: "integer", minimum: 1, maximum: 50 }
            },
            required: ["name", "count"]
          }
        },
        clanCastleSpells: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              count: { type: "integer", minimum: 1, maximum: 5 }
            },
            required: ["name", "count"]
          }
        },
        heroes: {
          type: "array",
          items: { type: "string" }
        },
        pets: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              hero: { type: "string" },
              pet: { type: "string" }
            },
            required: ["hero", "pet"]
          }
        },
        equipment: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              hero: { type: "string" },
              equipment: { type: "string" }
            },
            required: ["hero", "equipment"]
          }
        }
      },
      required: ["troops", "spells", "siegeMachine", "clanCastleTroops", "clanCastleSpells", "heroes", "pets", "equipment"]
    },
    attackGuide: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          phase: { type: "string" },
          steps: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["phase", "steps"]
      }
    },
    summary: { type: "string" }
  },
  required: ["army", "attackGuide", "summary"]
};

function cleanJsonText(text) {
  if (Array.isArray(text)) {
    text = text
      .map(part => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("AI returned an empty response.");
  }
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch (_) {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("AI returned invalid JSON.");
}

function normalizeList(list) {
  return Array.isArray(list) ? list.map(x => ({
    name: String(x.name || "").trim(),
    count: Number(x.count || 0)
  })).filter(x => x.name && Number.isInteger(x.count) && x.count > 0) : [];
}

function findByName(list, name) {
  const needle = String(name || "").trim().toLowerCase();
  return list.find(x => x.name.toLowerCase() === needle);
}

function validateArmy(output, data) {
  const errors = [];
  const army = output?.army || {};

  const troops = normalizeList(army.troops);
  const spells = normalizeList(army.spells);
  const ccTroops = normalizeList(army.clanCastleTroops);
  const ccSpells = normalizeList(army.clanCastleSpells);

  let troopSpace = 0;
  for (const item of troops) {
    const verified = findByName(data.troops, item.name);
    if (!verified) errors.push(`Unknown or locked troop: ${item.name}`);
    else troopSpace += item.count * Number(verified.housingSpace || 0);
  }

  let spellSpace = 0;
  for (const item of spells) {
    const verified = findByName(data.spells, item.name);
    if (!verified) errors.push(`Unknown or locked spell: ${item.name}`);
    else spellSpace += item.count * Number(verified.housingSpace || 0);
  }

  let ccTroopSpace = 0;
  for (const item of ccTroops) {
    const verified = findByName(data.troops, item.name);
    if (!verified) errors.push(`Unknown Clan Castle troop: ${item.name}`);
    else ccTroopSpace += item.count * Number(verified.housingSpace || 0);
  }

  let ccSpellSpace = 0;
  for (const item of ccSpells) {
    const verified = findByName(data.spells, item.name);
    if (!verified) errors.push(`Unknown Clan Castle spell: ${item.name}`);
    else ccSpellSpace += item.count * Number(verified.housingSpace || 0);
  }

  if (troopSpace > data.army.totalCapacity) {
    errors.push(`Troop capacity exceeded: ${troopSpace}/${data.army.totalCapacity}`);
  }
  if (spellSpace > data.spellCapacity) {
    errors.push(`Spell capacity exceeded: ${spellSpace}/${data.spellCapacity}`);
  }
  if (ccTroopSpace > data.clanCastle.troopCapacity) {
    errors.push(`Clan Castle troop capacity exceeded: ${ccTroopSpace}/${data.clanCastle.troopCapacity}`);
  }
  if (ccSpellSpace > data.clanCastle.spellCapacity) {
    errors.push(`Clan Castle spell capacity exceeded: ${ccSpellSpace}/${data.clanCastle.spellCapacity}`);
  }

  if (army.siegeMachine) {
    const siege = findByName(
      data.clanCastleSiegeMachines || data.siegeMachines,
      army.siegeMachine
    );
    if (!siege) errors.push(`Unknown or unavailable siege machine: ${army.siegeMachine}`);
    if (data.clanCastle.siegeMachineCapacity < 1) {
      errors.push("Clan Castle does not have siege machine capacity at this Town Hall.");
    }
  }

  const heroNames = Array.isArray(army.heroes) ? army.heroes.map(String) : [];
  const validHeroes = [];
  const seenHeroes = new Set();
  for (const name of heroNames) {
    const hero = findByName(data.heroes, name);
    if (!hero) {
      errors.push(`Unknown or locked hero: ${name}`);
    } else {
      if (seenHeroes.has(hero.id)) errors.push(`Duplicate hero: ${hero.name}`);
      seenHeroes.add(hero.id);
      validHeroes.push(hero.name);
    }
  }

  const seenPetHeroes = new Set();
  const seenPets = new Set();
  const pets = Array.isArray(army.pets) ? army.pets : [];
  for (const pair of pets) {
    const pet = findByName(data.pets, pair.pet);
    const hero = findByName(data.heroes, pair.hero);
    if (!pet) errors.push(`Unknown or locked pet: ${pair.pet}`);
    if (!hero) errors.push(`Invalid hero for pet: ${pair.hero}`);
    const key = `${String(pair.hero).toLowerCase()}|${String(pair.pet).toLowerCase()}`;
    if (seenPets.has(key)) errors.push(`Duplicate pet assignment: ${pair.hero}/${pair.pet}`);
    if (seenPetHeroes.has(String(pair.hero).toLowerCase())) errors.push(`A hero has more than one pet assignment: ${pair.hero}`);
    if (hero && !seenHeroes.has(hero.id)) errors.push(`Pet assigned to a hero not selected: ${pair.hero}`);
    seenPets.add(key);
    seenPetHeroes.add(String(pair.hero).toLowerCase());
  }

  const equipment = Array.isArray(army.equipment) ? army.equipment : [];
  const equipmentSlotsByHero = new Map();
  for (const pair of equipment) {
    const item = findByName(data.equipment, pair.equipment);
    const hero = findByName(data.heroes, pair.hero);
    if (!item) errors.push(`Unknown or locked equipment: ${pair.equipment}`);
    if (!hero) errors.push(`Invalid hero for equipment: ${pair.hero}`);
    if (hero && !seenHeroes.has(hero.id)) errors.push(`Equipment assigned to a hero not selected: ${pair.hero}`);
    if (item && item.hero && hero && String(item.hero).toLowerCase() !== hero.name.toLowerCase()) {
      errors.push(`Equipment ${item.name} does not belong to ${hero.name}`);
    }
    if (hero) {
      const key = hero.id;
      const count = (equipmentSlotsByHero.get(key) || 0) + 1;
      equipmentSlotsByHero.set(key, count);
      if (count > 2) errors.push(`More than two equipment items assigned to ${hero.name}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      ...army,
      troops,
      spells,
      clanCastleTroops: ccTroops,
      clanCastleSpells: ccSpells,
      heroes: validHeroes,
      pets,
      equipment
    },
    totals: {
      troopSpace,
      troopCapacity: data.army.totalCapacity,
      spellSpace,
      spellCapacity: data.spellCapacity,
      clanCastleTroopSpace: ccTroopSpace,
      clanCastleTroopCapacity: data.clanCastle.troopCapacity,
      clanCastleSpellSpace: ccSpellSpace,
      clanCastleSpellCapacity: data.clanCastle.spellCapacity
    }
  };
}

function buildAiData(data) {
  return {
    townHall: data.townHall,
    capacities: {
      troop: data.army.totalCapacity,
      spell: data.spellCapacity,
      clanCastleTroop: data.clanCastle.troopCapacity,
      clanCastleSpell: data.clanCastle.spellCapacity,
      clanCastleSiege: data.clanCastle.siegeMachineCapacity
    },
    troops: data.troops.map(x => ({ name: x.name, housingSpace: x.housingSpace })),
    spells: data.spells.map(x => ({ name: x.name, housingSpace: x.housingSpace })),
    ownSiegeMachines: (data.siegeMachines || []).map(x => x.name),
    clanCastleSiegeMachines: (data.clanCastleSiegeMachines || []).map(x => x.name),
    heroes: data.heroes.map(x => x.name),
    pets: data.pets.map(x => x.name),
    equipment: data.equipment.map(x => ({ name: x.name, hero: x.hero }))
  };
}

function buildPrompt(data, preferences) {
  const pref = preferences && typeof preferences === "object" ? preferences : {};
  return [
    "You are the Clash of Clans army planner for a fan website.",
    "The VERIFIED GAME DATA below is the only source of truth for legality. Do not invent units, capacities, unlocks, levels, or names.",
    "Choose a coherent attack army for the requested Town Hall. The user selected only the Town Hall; make the strategic choices yourself.",
    "Use as much troop and spell capacity as practical, but never exceed it.",
    "Use only one siege machine, and only if the Clan Castle has siege-machine capacity.",
    "Clan Castle troops and spells are optional; if used, stay within their verified capacities.",
    "Heroes must come only from the verified hero list. Pets and equipment must use verified names.",
    "Return JSON matching the supplied schema. Do not include markdown.",
    `Town Hall: ${data.townHall}`,
    `User preferences: ${JSON.stringify(pref)}`,
    "VERIFIED GAME DATA:",
    JSON.stringify(buildAiData(data))
  ].join("\n\n");
}

app.post("/api/coc/generate-army", async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: "OPENROUTER_API_KEY is not configured on the backend." });
  }

  const th = validTH(req.body?.townHall);
  if (!th) return res.status(400).json({ error: "townHall must be an integer from 1 to 18." });

  try {
    const data = getCocSnapshot(th);
    const messages = [
      {
        role: "system",
        content: "Return only the requested JSON object. Never invent facts outside the provided verified game data."
      },
      {
        role: "user",
        content: buildPrompt(data, req.body?.preferences)
      }
    ];

    const structuredBody = {
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      max_tokens: 4000,
      reasoning: { effort: "none" },
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "coc_army",
          strict: true,
          schema: armySchema
        }
      }
    };

    async function callOpenRouter(body, label) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://jagathish.online",
            "X-Title": "Jagathish CoC AI"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        const raw = await response.text();
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }

        console.log(
          `OpenRouter ${label}: status=${response.status}, model=${parsed?.model || "unknown"}, ` +
          `finish=${parsed?.choices?.[0]?.finish_reason || "unknown"}, ` +
          `contentLength=${typeof parsed?.choices?.[0]?.message?.content === "string" ? parsed.choices[0].message.content.length : 0}`
        );

        if (!response.ok) {
          console.error("OpenRouter error:", response.status, raw.slice(0, 1200));
          throw new Error(`AI provider request failed (${response.status}).`);
        }

        return parsed;
      } finally {
        clearTimeout(timeout);
      }
    }

    let parsed = await callOpenRouter(structuredBody, "structured");
    let content = parsed?.choices?.[0]?.message?.content;

    // Some routed reasoning models can consume the completion budget without
    // emitting final content. Retry once with plain JSON instructions and no
    // response_format so the router can select another compatible free model.
    if (!content || (typeof content === "string" && !content.trim())) {
      console.warn("OpenRouter returned empty final content; retrying with plain JSON mode.");
      const retryBody = {
        model: OPENROUTER_MODEL,
        temperature: 0.2,
        max_tokens: 5000,
        reasoning: { effort: "none" },
        messages: [
          ...messages,
          {
            role: "user",
            content: "IMPORTANT: Output the complete JSON object now. Do not explain anything. Do not use markdown fences."
          }
        ]
      };
      parsed = await callOpenRouter(retryBody, "plain-json-retry");
      content = parsed?.choices?.[0]?.message?.content;
    }

    if (!content || (typeof content === "string" && !content.trim())) {
      const finishReason = parsed?.choices?.[0]?.finish_reason || "unknown";
      console.error("OpenRouter returned no final content after retry:", JSON.stringify({
        model: parsed?.model,
        finishReason,
        usage: parsed?.usage || null
      }));
      return res.status(502).json({
        error: "AI provider returned no final answer. Please try Generate Army again.",
        providerStatus: 200,
        finishReason
      });
    }

    const aiOutput = cleanJsonText(content);
    const validation = validateArmy(aiOutput, data);

    if (!validation.ok) {
      return res.status(422).json({
        error: "AI generated an invalid army; it was blocked by the server validator.",
        validationErrors: validation.errors
      });
    }

    res.json({
      success: true,
      townHall: th,
      dataVersion: COC_DATA_VERSION,
      model: parsed?.model || OPENROUTER_MODEL,
      army: validation.normalized,
      attackGuide: aiOutput.attackGuide || [],
      summary: aiOutput.summary || "",
      totals: validation.totals
    });
  } catch (err) {
    console.error("CoC AI generation error:", err);
    const isTimeout = err?.name === "AbortError";
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? "AI provider timed out. Please try Generate Army again."
        : (err.message || "Unable to generate army.")
    });
  }
});

/* -------------------- START SERVER -------------------- */

app.listen(PORT, () => {
  console.log(`Server Running On Port ${PORT}`);
});
