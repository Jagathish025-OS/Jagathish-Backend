# Jagathish Backend

This version keeps the existing Supabase API and adds a Clash of Clans AI backend.

## New environment variables

- `OPENROUTER_API_KEY` — secret OpenRouter key
- `OPENROUTER_MODEL` — `openrouter/free`

## New endpoints

- `GET /api/coc/game-data?townHall=10`
- `POST /api/coc/generate-army` with JSON body:
  `{"townHall":10}`

The server uses `clash-of-clans-data@0.16.0` as the structured game-data source, sends only verified Town Hall data to OpenRouter, and validates the AI result against troop/spell/Clan Castle capacities and unlocks before returning it.

The game-data package is community-maintained and sourced from the Clash of Clans Wiki; it is not an official Supercell API.

## Deployment

Replace `server.js`, `package.json`, and `README.md` in the GitHub repository used by the Render `Jagathish-Backend` service. Render will install the new dependency and redeploy automatically.

Do not commit `OPENROUTER_API_KEY`.


## CoC verified data

The CoC API now uses `data/coc-game-data.json`, generated from the uploaded Clash Armies
structured dataset version 0.12.5 (2026-09-05). The backend does not calculate spell
capacity by adding the two spell factories; it uses the dataset's `spellCapacity` field.
It also keeps player Siege Workshop capacity separate from Clan Castle siege capacity.

Example verified values:
- TH9: 220 army, 9 spell, 30 CC troop, 1 CC spell, 0 own siege, 0 CC siege, 17 standard troops.
- TH10: 240 army, 11 spell, 35 CC troop, 1 CC spell, 0 own siege, 1 CC siege, 19 standard troops.
- TH11: 260 army, 11 spell, 35 CC troop, 2 CC spell, 0 own siege, 1 CC siege, 21 standard troops.

Source is a fan-maintained structured dataset, not the official Supercell API.
