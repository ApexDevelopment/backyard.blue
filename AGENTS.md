# Agents

## The AT Protocol

Agents must ensure they are familiar with the AT Protocol and its specification before writing any code that utilizes it, whether by reading https://atproto.com/ or the source code of Bluesky PBC's implementations directly at https://github.com/bluesky-social. For example, OAuth scope information can be gleaned from https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-scopes/src/scopes.

## Taking Notes

When important or relevant information is found in the AT Protocol documentation, agents should summarize it for future programmers in the `notes/` directory. If a file already exists in `notes/` for the relevant topic, agents should append their findings to that file rather than creating a new one.

Upon first reading this document, agents must read `notes/architecture.md` and `notes/requirements.md`.

## Vibecode Smell

LLMs tend to converge on a specific style of web development that is not necessarily the best fit for every project. **Agents should be wary of and avoid these common pitfalls:**
- Overuse of pill-shaped UI elements
- Overuse of the "card" UI component metaphor
- Duplicating the same logic in multiple places
	- Often caused by not first checking whether a utility function already exists before writing new code, for example.
- Recreating the same UI elements with slightly different styles
	- A common example is writing multiple `btn` classes that use the same color but have different padding/margin/font-sizes.
- Excessive use of comments to explain code, even when the code is already self-explanatory

Backyard has its own established style and patterns. **Agents should strive to match the existing style and patterns by reading existing code** rather than writing best-guess CSS that "feels right" but does not look like the rest of the application.

After making any changes, agents must run `npx svelte-check`. Warnings are not acceptable and should be resolved before considering the task complete.
