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
