# Self-hosted fonts

The app bundles two Latin WOFF2 subsets so the first paint never waits for
`fonts.googleapis.com` (which is unreliable from mainland China):

- `dm-sans-latin.woff2` — DM Sans, variable weight 400–700
- `dm-serif-display-latin.woff2` — DM Serif Display, weight 400

Both families are licensed under the SIL Open Font License 1.1. The license
texts are served from `/pep-english-reader/fonts/`:

- `OFL-DM-Sans.txt`
- `OFL-DM-Serif-Display.txt`

Upstream sources:

- https://fonts.google.com/specimen/DM+Sans
- https://fonts.google.com/specimen/DM+Serif+Display
