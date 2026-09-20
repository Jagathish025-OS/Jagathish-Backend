# Jagathish Backend — CoC AI V7

## What changed

V7 replaces AI-generated armies with a safer two-layer architecture:

1. **ClashArmies source data** is imported from `clash-armies-master/game-data.json5`.
2. **ClashArmies unlock rules** are implemented server-side for Town Hall, production buildings, Laboratory, Clan Castle donation rules, heroes, pets and equipment.
3. The AI is asked only to choose an **attack strategy**. It is not trusted to calculate troop counts or legality.
4. The server builds the actual army using exact housing-space and Town Hall capacities.
5. The final army is validated again before it is returned.
6. If OpenRouter returns 400/429, times out, or produces malformed strategy JSON, the server automatically selects a deterministic strategy and still returns a verified army.

## Important

The game data is community/fan-maintained ClashArmies data, not the official Supercell API.

## Existing API

- `GET /api/coc/game-data?townHall=5`
- `GET /api/coc/data-source`
- `POST /api/coc/generate-army`

Example generation request:

```json
{"townHall":5}
```

The response includes `generationMode`:

- `ai-strategy` when OpenRouter successfully selected the strategy.
- `verified-server-strategy` when the AI provider was unavailable and the server selected the strategy.

Both modes use the same server-side verified army builder and validator.

## Environment variables

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (optional; `openrouter/free` is internally mapped to a known free JSON-capable model)
