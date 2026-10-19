Real WebP files for the tests of the sticker library (`StickerImageWebpTests`), made with Pillow 12 (libwebp) on
2026-10-19. The JDK cannot write WebP, so these are kept as files, not generated in the test.

| File | Container | Size | Frames |
|---|---|---|---|
| `static-lossy.webp` | `VP8 ` (lossy) | 300 x 200 | 1 |
| `static-lossless.webp` | `VP8L` (lossless) | 301 x 199 | 1 |
| `static-alpha.webp` | `VP8X` + `ALPH` + `VP8 ` (lossy with alpha) | 50 x 34 | 1 |
| `animated.webp` | `VP8X` (animation flag) + `ANIM` + 3 x `ANMF` | 32 x 24 | 3 |

The sizes are not squares and have a side above 255 on purpose, so that a swapped width and height or a missed second
byte shows.
