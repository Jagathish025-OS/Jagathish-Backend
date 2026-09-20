# Jagathish Backend — CoC AI V8

V8 keeps the ClashArmies-based verified game-data and deterministic strategy engine from V7, and adds:

- AI used only as a strategy selector, never as the authority for exact troop counts.
- Automatic deterministic fallback when OpenRouter is unavailable or rate-limited.
- Exact server-side capacity and unlock validation.
- Generated Clash of Clans Army Link using the same section format used by the ClashArmies source (`h`, `i`, `d`, `u`, `s`).
- Response metadata distinguishing `ai-strategy` from `verified-server-strategy`.

## Endpoints

- `GET /api/coc/game-data?townHall=8`
- `POST /api/coc/generate-army` with `{ "townHall": 8 }`

The generation response includes `armyLink` when the generated army has shareable content.

## Environment

- `OPENROUTER_API_KEY` — optional for AI strategy selection. The server still generates a verified army without it.
- `OPENROUTER_MODEL` — defaults to `openrouter/free`; the server resolves that to a free strategy-selector model.
- Existing Supabase variables remain unchanged.
