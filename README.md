# Jagathish Backend — CoC AI V9.1

V9 keeps the V8 verified Army Generator and adds an AI Base Generator.

## Army generator

- `GET /api/coc/game-data?townHall=5`
- `POST /api/coc/generate-army`
- AI chooses a strategy only.
- The server builds the exact roster from verified ClashArmies data and validates capacities/unlocks.
- AI provider failure falls back to a deterministic verified strategy.
- Returns a real `CopyArmy` deep link when the generated roster can be encoded.

## Base generator

- `GET /api/coc/base-catalog-status?townHall=5`
- `POST /api/coc/generate-base`
- User supplies only Town Hall.
- AI chooses a base purpose (`War`, `Farm`, `Trophy`, `Hybrid`, `Home Village`, etc.) from the available catalog for that Town Hall.
- The server selects a matching community layout instead of inventing layout bytes.
- The returned `OpenLayout` link is structurally validated before it reaches the frontend.
- AI provider failure falls back to a deterministic base-purpose selection.

### Community base catalog

V9 reads the public community catalog maintained at:

`https://github.com/nschmeller/clash-bases`

The catalog itself credits upstream base sources/builders. V9 does not rewrite layout payloads. It filters by Town Hall/type and returns the catalogued deep link.

Base links are community content and are not official Supercell API data. Clash of Clans and Supercell are trademarks of Supercell Oy; this project is an independent fan tool.

## Environment

- `SUPABASE_KEY`
- `SUPABASE_URL`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (defaults to `openrouter/free` and resolves to the configured free model mapping)

## Build marker

`V9 · 2026-09-20`


V9.1 fix: the upstream nschmeller/clash-bases `bases.json` export is currently wrapped as `{ "bases": [...] }`; the loader now accepts that shape as well as an older top-level array.

### V11.5 object catalog and scoring
`base-object-catalog.json` is the single data-driven source for Home Village object type, footprint, unlock Town Hall, and conservative engine count limits. `base-scoring-engine.js` scores compiled layouts by purpose. These are engine-layer facts, not an official Supercell export schema.

Current TH18 sources used during implementation: Supercell's TH18 launch notes and August 2026 update notes; independent current references confirm Super Wizard Tower is 3x3 and up to two at TH18, and Firespitter is 3x3 with two copies from TH17 onward.
