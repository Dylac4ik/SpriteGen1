# Pixel-art conversion pipeline

Image models render at roughly 512–1024px and cannot reliably produce native 8×8 to 64×64 images. SpriteGen therefore treats model output as a *working-resolution* image and converts it deterministically to the selected native size. The implementation is `src/core/pixelize.ts`. The steps applied to each sprite are recorded in its `notes` and shown under **Properties → Pixel conversion applied**.

No step ever uses bilinear/bicubic interpolation or smoothing.

| # | Step | Details | Setting (left panel → Technical constraints & pixel conversion) |
| --- | --- | --- | --- |
| 1 | **Center-crop to square** | Only if the provider returned a non-square image. | — |
| 2 | **Background removal** (optional) | Picks the most common border color (4-bit-per-channel buckets, then averaged). Flood-fills from the image edges, making matching pixels within the tolerance fully transparent. Enclosed regions of the same color are kept. | *Background removal*: Auto (only when transparency is requested and the provider can't make it natively), Always or Never. *Background tolerance* 0–128. |
| 3 | **Palette quantization at working resolution** | Median cut on a 5-bit histogram, then each opaque pixel is mapped to its nearest palette color using a weighted RGB distance. This flattens gradients, JPEG-like noise and anti-aliasing **before** sampling, so the next step picks stable colors. If the image already has ≤ N colors, the exact colors are kept. | *Working palette*: Auto (8, 16, 24, 32, 48, 64, 64 colors for 8, 16, 32, 64, 128, 256, 512px; twice the suggested readable palette, capped at 64), Custom (2–64) or Off. |
| 4 | **Downscale to N×N** | **Nearest-neighbor**: each destination pixel copies the source pixel under its center. **Dominant color** (alternative): each destination pixel takes the most frequent exact color in its source block, and a block becomes transparent if more than half of it is transparent. Neither method creates new colors. If the model output is *smaller* than the target, it is enlarged with nearest-neighbor and the notes say so. | *Downscale sampling*: Nearest-neighbor (default) or Dominant color. |
| 5 | **Alpha binarization** | Alpha ≥ threshold becomes 255; anything below becomes fully transparent (0,0,0,0). Pixel art gets hard edges. | *Alpha threshold* 1–255 (default 128). |
| 6 | **Size assertion** | The result must be exactly N×N, or the generation fails with `invalid_response`. | — |

## Display and export follow the same rule

- **On screen**, native canvases are enlarged with CSS `image-rendering: pixelated` (nearest-neighbor). Thumbnails use the same rule when shrinking.
- **Export at 1×** writes the native pixels untouched. **Enlarged exports** use integer nearest-neighbor replication (`scaleNearestInteger`), are labeled in the dialog, and get an `@Nx` file suffix.

## Choosing settings for tiny sprites

At 8×8 and 16×16 every pixel matters:

- Ask for a bold silhouette, a limited palette and an outline in the prompt. The analyzer suggests size-appropriate wording.
- If nearest-neighbor picks stray pixels, try **Dominant color** downscale or a **Custom** working palette with fewer colors.
- Clean up afterwards with the *Palette reduction*, *Outline* and *Alpha cleanup* filters, or the pencil and eraser.
