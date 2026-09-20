# Jagathish Backend — CoC AI V12

V12 keeps the verified Army Generator and expands the Base side into an AI Creative Base Lab.

## Base endpoints

- `GET /api/coc/base-catalog-status?townHall=10`
- `POST /api/coc/generate-base` — verified community OpenLayout selection for War/Farm/Trophy/Hybrid.
- `POST /api/coc/generate-base-ideas` — AI invents three creative concepts for the selected Town Hall and category.
- `POST /api/coc/generate-base-blueprint` — turns a selected AI concept into a structured visual blueprint.

## AI creative categories

The frontend exposes broad directions such as Fun, Character, Creature, Icon/Symbol, Shape/Pattern, Maze/Puzzle, Meme/Troll, Theme, Fantasy, Letter/Number, Abstract, Experimental, and AI Surprise.

The AI is allowed to invent more specific sub-concepts. The server does not treat those creative blueprints as official Supercell OpenLayout exports.

## Reliability model

1. AI creates the creative concept.
2. The server normalizes and renders a deterministic structured blueprint.
3. The result is explicitly labelled as a creative blueprint when it is not a real OpenLayout.
4. Community bases continue to use real catalog links and server validation.

## Image AI

V12 does not automatically generate paid images. The architecture leaves image generation as an optional next layer. If an image model is configured later, the visual concept can be generated separately from the structured layout blueprint.

## Environment

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (default `openrouter/free`, internally mapped to the configured free model)
- Existing Supabase variables remain unchanged.
