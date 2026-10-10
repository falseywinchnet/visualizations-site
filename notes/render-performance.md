# Rendering work audit — 10 October 2026

Baseline: `8c1cc053bdd3098af0a8300ab993e6b3cfcb1991`.

This change preserves scene geometry, vegetation caps and distances, terrain LOD, shadows, pixel ratios, post-processing filters, blur taps and simulation rates.

## Removed work

- Cache the vegetation worker request queue until its chunk center or quality changes, invalidating it after eviction. Preserve nearest-first order and the 14-job in-flight limit. Previously every display frame scanned and sorted the same missing chunks even with all worker slots occupied.
- Replace the terrain overlap all-pairs search with direct lookup of each tile’s at most nine ancestors. The visible tile set and insertion order stay the same.
- Stop traversing the whole vehicle tree in both model update and camera update ahead of the renderer’s traversal. Refresh just the wheel ancestor chains needed for tire deformation. This also fixes contact-normal transforms that previously used the wheel’s *previous* spin and suspension position. Reuse the temporary matrix and vector.
- Empty particle pools no longer mark vertex attributes for upload or submit zero-length update ranges. Live particles retain their normal uploads; stale ranges are replaced even after skipped renders.
- Remove depth attachments from bloom’s eleven image-filter targets. They never render scene geometry. All color targets, dimensions and passes remain.
- Exclude the four switched-off headlamps from the renderer’s light list. Zero intensity alone left those lights in the lit shaders’ calculations. Turning them on restores the same lights and intensities.

## CPU measurements

Measured on the nearby M4 Mini using vendored Three.js, original modules from the baseline commit and updated modules. Median of seven batches after 100 warmup calls; 1,500 calls per batch, or 300 for the vehicle. These isolated timings are not whole-game frame-rate claims.

| Operation | Before | After | Conditions |
| --- | ---: | ---: | --- |
| Vegetation update | 0.15578 ms | 0.000058 ms | High quality, stationary request area, 14 jobs in flight, no instance rebuild |
| Terrain selection | 0.24547 ms | 0.03082 ms | High quality, forced selection with ready meshes, 181 identical visible tiles |
| Vehicle + camera + scene transforms | 0.03587 ms | 0.01500 ms | Same 304 objects and 223,836 mesh triangles |

To repeat the microbenchmarks with a checkout of the baseline commit, run `node tests/render-costs.mjs /path/to/baseline/docs/spider-drive/drive`. The baseline must have the same vehicle and rendering API.

Vehicle local matrix updates fell from 913 to 355 per measured frame. Stable vegetation frames perform zero ready-map lookups while all worker slots are occupied. Terrain selection is about 8× faster in this workload; its real cadence depends on camera movement and tile arrivals.

## Verification

`node --test tests/spider-tires.test.mjs tests/spider-render.test.mjs` passes all 24 tests on the M4 Mini. Rendering tests check old/new vegetation request transcripts through out-of-order arrivals, movement, quality changes and eviction; terrain coverage against the original containment algorithm; current-frame wheel contact transforms; and empty/live particle upload behavior. CI runs both suites on Node 24.

Serve the repository root and open `tests/spider-render.html` for browser comparisons. The test renders the same vehicle, ground, shadows and post-processing at low/medium/high quality, lights both off and on. Each comparison preserves draw calls and triangle counts. Bloom depth removal alone was byte-for-byte identical in all six cases. Excluding switched-off lamps caused one channel at medium and three at high to differ by one 8-bit step; the other cases were exact. The test allows at most one step in fewer than 0.01% of channels for a light-count shader variant and requires exact equality for depth removal.

At a 480×300 CSS viewport, removing depth attachments saves 258,720 depth pixels at medium (1.4 pixel ratio) and 405,096 at high (1.75 ratio), spread over eleven targets. Low quality does not execute bloom. Actual memory savings depend on viewport size and the driver’s depth format. Browser timing differences were too small/noisy to claim a GPU speedup.

The integrated Earth scene was also driven with camera and headlight toggles; no browser warnings or errors occurred.
