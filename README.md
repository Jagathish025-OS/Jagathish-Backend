Jagathish Backend V5 — universal CoC AI army generation reliability.

- Uses a known free OpenRouter model when OPENROUTER_MODEL is openrouter/free.
- Uses JSON object response mode instead of a complex JSON schema.
- Retries malformed JSON once.
- Server repairs AI candidates: removes unknown/duplicate heroes, invalid pets/equipment, trims troop/spell/Clan Castle capacity, and validates siege availability.
- If the AI output is unusable, the server creates a verified fallback army.
- Final output is always passed through the existing server validator before being returned.
- Verified Clash Armies game-data source and siege distinction are preserved.
