# Jagathish Backend — CoC AI V14

V14 preserves the verified Army Generator and completes the creative Base pipeline through a genuine playable OpenLayout bridge.

## Creative Base flow

1. Town Hall is loaded from verified ClashArmies data.
2. AI invents three creative concepts (or uses a deterministic fallback if the provider is unavailable).
3. The server compiles the chosen concept into a collision-checked 44×44 semantic blueprint.
4. The server loads the community layout catalogue and structurally validates every OpenLayout candidate.
5. AI can curate the closest existing playable community layout from a bounded candidate set.
6. If AI matching is unavailable, deterministic semantic matching selects a verified fallback.
7. The response contains the genuine `link.clashofclans.com/?action=OpenLayout...` URL plus source/builder/preview metadata.

## Important boundary

V14 does not fabricate or rewrite Supercell OpenLayout payloads. Public community research indicates that genuine share IDs contain a 24-byte base64url payload and additional validity constraints, and that the in-game deep-link handler is the authoritative resolver. Therefore the playable result is a genuine community-authored OpenLayout selected by AI to match the AI concept; the AI does not claim authorship of the binary payload.

## New endpoint

`POST /api/coc/generate-creative-openlayout`

Input: `{ townHall, category, prompt, idea }`

Output includes:
- `openLayout.link` — genuine validated OpenLayout link
- `openLayout.image` — community preview when available
- `openLayout.builder` — attribution
- `generationMode` — AI match or verified fallback
- `match.playable` — true
- `match.generatedByAI` — false (the link itself is community-authored)

## Existing endpoints

- `GET /api/coc/game-data?townHall=N`
- `POST /api/coc/generate-army`
- `GET /api/coc/base-catalog-status?townHall=N`
- `POST /api/coc/generate-base`
- `POST /api/coc/generate-base-ideas`
- `POST /api/coc/generate-base-blueprint`
- `POST /api/coc/compile-creative-layout`
- `POST /api/coc/generate-creative-openlayout`

## Environment

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (default: `openrouter/free`)
- `SUPABASE_URL`
- `SUPABASE_KEY`

## Build

`V14 · 2026-09-20`
