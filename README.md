Jagathish Backend V4 — CoC AI reliability build.

- Preserves verified Clash Armies game data.
- Keeps own siege machines separate from donated Clan Castle siege machines.
- Uses OpenRouter with reasoning disabled for this short structured generation task.
- Retries once if a routed free model returns empty final content.
- Adds request timeout and useful server logs.
- Server-side validation remains authoritative.
