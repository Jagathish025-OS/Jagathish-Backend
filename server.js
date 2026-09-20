const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { home } = require("clash-of-clans-data");

const app = express();

const PORT = process.env.PORT || 3000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const COC_DATA_VERSION = "clash-of-clans-data@0.16.0";

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

/* -------------------- COC DATA HELPERS -------------------- */

function validTH(value) {
  const th = Number(value);
  return Number.isInteger(th) && th >= 1 && th <= 18 ? th : null;
}

function maxLevelForTH(entity, th, requirementKeys = ["townHallRequired"]) {
  if (!entity || !Array.isArray(entity.levels)) return null;

  const eligible = entity.levels.filter(level => {
    const key = requirementKeys.find(k => Number.isFinite(Number(level[k])));
    if (!key) return true;
    return Number(level[key]) <= th;
  });

  return eligible.length ? eligible[eligible.length - 1] : null;
}

function summarizeEntity(entity, th, type) {
  const maxLevel = maxLevelForTH(entity, th);
  if (!maxLevel) return null;

  return {
    id: entity.id,
    name: entity.name,
    type,
    housingSpace: Number(entity.housingSpace || 0),
    targetType: entity.targetType || null,
    troopType: entity.troopType || null,
    spellType: entity.spellType || null,
    maxLevel: maxLevel.level,
    townHallRequired: Number(maxLevel.townHallRequired || 0),
    image: entity.images?.icon || null
  };
}

function getArmyCampCapacity(th) {
  const camp = home().armyBuildings().armyCamp().first();
  const campLevel = maxLevelForTH(camp, th);
  const count = (camp?.availablePerTownHall || [])
    .find(x => Number(x.townHallLevel) === th)?.count || 0;
  return {
    camps: Number(count),
    capacityPerCamp: Number(campLevel?.housingSpace || 0),
    totalCapacity: Number(count) * Number(campLevel?.housingSpace || 0)
  };
}

function getBuildingCapacity(th, building, field) {
  const entity = home().armyBuildings()[building]?.() || null;
  if (!entity) return 0;
  const level = maxLevelForTH(entity, th);
  return Number(level?.[field] || 0);
}

function getClanCastle(th) {
  const cc = home().resourceBuildings().clanCastle().first();
  const level = maxLevelForTH(cc, th);
  return {
    level: Number(level?.level || 0),
    troopCapacity: Number(level?.troopCapacity || 0),
    spellCapacity: Number(level?.spellCapacity || 0),
    siegeMachineCapacity: Number(level?.siegeMachineCapacity || 0)
  };
}

function getHeroHallLevel(th) {
  const hall = home().armyBuildings().heroHall().first();
  const level = maxLevelForTH(hall, th);
  return Number(level?.level || 0);
}

function getPetHouseLevel(th) {
  const house = home().armyBuildings().petHouse().first();
  const level = maxLevelForTH(house, th);
  return Number(level?.level || 0);
}

function heroSummary(entity, th, heroHallLevel) {
  if (!entity || !Array.isArray(entity.levels)) return null;
  const eligible = entity.levels.filter(level => {
    if (Number.isFinite(Number(level.townHallRequired))) {
      return Number(level.townHallRequired) <= th;
    }
    if (Number.isFinite(Number(level.heroHallLevelRequired))) {
      return Number(level.heroHallLevelRequired) <= heroHallLevel;
    }
    return true;
  });
  if (!eligible.length) return null;
  const max = eligible[eligible.length - 1];
  return {
    id: entity.id,
    name: entity.name,
    maxLevel: max.level,
    heroHallLevelRequired: Number(max.heroHallLevelRequired || 0),
    image: entity.images?.icon || null
  };
}

function genericHeroData(th) {
  const hallLevel = getHeroHallLevel(th);
  const heroes = home().heroes().get()
    .map(h => heroSummary(h, th, hallLevel))
    .filter(Boolean);
  return { heroHallLevel: hallLevel, heroes };
}

function genericPetData(th) {
  const petHouseLevel = getPetHouseLevel(th);
  const pets = home().pets().get().map(pet => {
    const eligible = (pet.levels || []).filter(level =>
      (!Number.isFinite(Number(level.townHallRequired)) || Number(level.townHallRequired) <= th) &&
      (!Number.isFinite(Number(level.petHouseLevelRequired)) || Number(level.petHouseLevelRequired) <= petHouseLevel)
    );
    if (!eligible.length) return null;
    return {
      id: pet.id,
      name: pet.name,
      maxLevel: eligible[eligible.length - 1].level,
      petHouseLevelRequired: Number(eligible[0].petHouseLevelRequired || 0),
      image: pet.images?.icon || null
    };
  }).filter(Boolean);
  return { petHouseLevel, pets };
}

function genericEquipmentData(th) {
  const blacksmith = home().armyBuildings().blacksmith().first();
  const blacksmithLevel = maxLevelForTH(blacksmith, th)?.level || 0;

  const equipment = home().heroEquipment().get().map(item => {
    const eligible = (item.levels || []).filter(level => {
      const thOk = !Number.isFinite(Number(level.townHallRequired)) || Number(level.townHallRequired) <= th;
      const bsOk = !Number.isFinite(Number(level.blacksmithLevelRequired)) || Number(level.blacksmithLevelRequired) <= blacksmithLevel;
      return thOk && bsOk;
    });
    if (!eligible.length) return null;
    return {
      id: item.id,
      name: item.name,
      hero: item.hero || item.heroName || null,
      maxLevel: eligible[eligible.length - 1].level,
      image: item.images?.icon || null
    };
  }).filter(Boolean);

  return { blacksmithLevel, equipment };
}

function getCocSnapshot(th) {
  const army = getArmyCampCapacity(th);
  const clanCastle = getClanCastle(th);
  const heroData = genericHeroData(th);
  const petData = genericPetData(th);
  const equipmentData = genericEquipmentData(th);

  const troops = home().troops().byTownHall(th).get()
    .map(x => summarizeEntity(x, th, "troop"))
    .filter(Boolean);

  const spells = home().spells().byTownHall(th).get()
    .map(x => summarizeEntity(x, th, "spell"))
    .filter(Boolean);

  const siegeMachines = home().siegeMachines().get()
    .map(x => summarizeEntity(x, th, "siege"))
    .filter(Boolean);

  return {
    townHall: th,
    dataVersion: COC_DATA_VERSION,
    army,
    spellCapacity: getBuildingCapacity(th, "spellFactory", "spellStorageCapacity") +
      getBuildingCapacity(th, "darkSpellFactory", "spellStorageCapacity"),
    clanCastle,
    heroes: heroData.heroes,
    heroHallLevel: heroData.heroHallLevel,
    pets: petData.pets,
    petHouseLevel: petData.petHouseLevel,
    equipment: equipmentData.equipment,
    blacksmithLevel: equipmentData.blacksmithLevel,
    troops,
    spells,
    siegeMachines
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
  if (!text) throw new Error("AI returned an empty response.");
  try { return JSON.parse(text); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
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
    const siege = findByName(data.siegeMachines, army.siegeMachine);
    if (!siege) errors.push(`Unknown or locked siege machine: ${army.siegeMachine}`);
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
    JSON.stringify(data)
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
    const body = {
      model: OPENROUTER_MODEL,
      temperature: 0.35,
      max_tokens: 2500,
      messages: [
        {
          role: "system",
          content: "Return only the requested JSON object. Never invent facts outside the provided verified game data."
        },
        {
          role: "user",
          content: buildPrompt(data, req.body?.preferences)
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "coc_army",
          strict: true,
          schema: armySchema
        }
      }
    };

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jagathish.online",
        "X-OpenRouter-Title": "Jagathish CoC AI"
      },
      body: JSON.stringify(body)
    });

    const raw = await response.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }

    if (!response.ok) {
      console.error("OpenRouter error:", response.status, raw.slice(0, 1000));
      return res.status(502).json({
        error: "AI provider request failed.",
        providerStatus: response.status
      });
    }

    const content = parsed?.choices?.[0]?.message?.content;
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
    res.status(500).json({ error: err.message || "Unable to generate army." });
  }
});

/* -------------------- START SERVER -------------------- */

app.listen(PORT, () => {
  console.log(`Server Running On Port ${PORT}`);
});
