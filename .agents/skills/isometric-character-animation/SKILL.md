---
name: isometric-character-animation
description: Create and refine modular pixel-art character bodies, articulated frame-by-frame cycles, and distance-driven animation in eight isometric directions, with GIF inspection and gameplay verification.
---

# Modular isometric characters

Use the current game's renderer and projection as the source of truth. Reference sheets describe proportions, contact poses and timing; do not assume their assets are available for redistribution. Keep the user's selected art style and engine.

## Body bases, variants and joints

Define a neutral body base and mark shoulders, pelvis, hips, knees, elbows, wrists, ankles and soles before clothing. Body variants can change silhouette and proportions while keeping action names, ground anchor and gait structure consistent. Keep build separate from height: wider bodies must not enlarge world-space foot paths. Keep hair, face, clothing and held items independently drawable where the renderer supports it; costume motion must follow the same joints as the body.

Inspect front, back, profiles and diagonals at native game size. Narrow lateral torsos, preserve depth between near/far limbs, keep the neck connected and position eyes/mouth consistently with facing. Compare body height to a real doorway and tree in the scene, rather than enlarging the portrait preview to choose world scale.

## Manual frame-by-frame authoring

When creating a bespoke pixel animation, read [references/manual-frame-by-frame.md](references/manual-frame-by-frame.md). It covers body-base construction, variants, joint maps, a walk-cycle pose order, in-betweens, timing and GIF review. Draw and review the animation before binding gameplay commands to it; after the GIF and contact sheet read clearly and loop cleanly, map movement states to the approved clips and verify them in the game.

## Movement

Advance gait phase by actual distance, including terrain/collision results. During stance, the rendered foot's local travel must cancel the projected body displacement. Account for camera, body and appearance scales separately; shrinking the entire foot path creates skating. Verify this numerically across eight directions and height/build combinations.

Design contact, loading, passing and lift poses. Lift the returning foot, flex its knee, counterbalance pelvis/shoulders and swing the opposite arm. Preserve continuity across the loop seam. Do not accelerate the cycle by wall time when blocked.

For sitting, stage lowering → hand contact → pelvic settling. Standing reverses support before hands release. Keep one-shot clips clamped at their endpoints and loops periodic. Put timing/pose data in a registry separate from anatomy and clothing so families can override actions without duplicating the renderer.

## Review and export

Export the actual renderer into transparent sheets with cell size, common pivot, direction order, frame order and timing/progress metadata. Export individual layers with the same layout. Pixelorama or LibreSprite can inspect these sheets; these authoring tools do not need to become runtime dependencies.

For Clareira, use `node scripts/render-character-study.mjs <output>` in `/opt/game-agent`. It exports eight-direction male/female action sheets, individual part sheets, a contact sheet and animation frame sequences. Review sheets and intermediate frames, then desktop/mobile gameplay. The portrait preview should use the same transition logic as the world. Test planted feet, seated hand contacts, direction changes, stop/start, movement-reduced mode and layer composition. Passing tests do not certify artistic quality.

Read [references/sources.md](references/sources.md) for source links and tool-selection rationale when changing this workflow.
