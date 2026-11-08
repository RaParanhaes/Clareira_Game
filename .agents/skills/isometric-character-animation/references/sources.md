# Sources reviewed on 2026-10-10

## Frame-by-frame workflow research

- Raymond Schlitter, SLYNYRD Pixelblog 49, “Realistic Human Anatomy”: https://www.slynyrd.com/blog/2024/3/25/pixelblog-49-realistic-human-anatomy — uses proportion guides, references and a color-blocked mannequin before detail; distinguishes larger realistic models from compact stylized sprites.
- Raymond Schlitter, SLYNYRD Pixelblog 50, “Human Walk Cycle”: https://www.slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle — studies a recorded walk, hand-picks a loop, and uses eight drawings as one balance of economy and fluidity, while noting that size and style change the right frame count.
- Raymond Schlitter, SLYNYRD Pixelblog 22, “Top Down Character Sprites”: https://www.slynyrd.com/blog/2019/10/21/pixelblog-22-top-down-character-sprites — recommends a simple dummy before detail and shows how a base model can support character variations and multiple views.
- Raymond Schlitter, SLYNYRD Pixelblog 25, “Motion Cycles”: https://www.slynyrd.com/blog/2020/1/23/pixelblog-25-motion-cycles — animates legs first, then arms, head and body; keeps flat color blocks while validating motion and adds detail afterward.
- Saultoons, “Easy Pixel Art Walk Cycle Tutorial”: https://www.youtube.com/watch?v=7T6yOk5n-zk — pixel-art demonstration organized around contact, down, passing and up poses.
- Aseprite documentation, “Animation”: https://www.aseprite.org/docs/animation and “Tags”: https://www.aseprite.org/docs/tags — frame workflow, preview, onion skin, duration and labeled ranges including forward, reverse and ping-pong playback.
- Pixelorama user manual, “The Timeline”: https://pixelorama.org/user_manual/user_interface/timeline/ — frames/cels/layers, onion skin, loop modes, playback rate and per-frame duration.
- Spine user guide, “Bones”: https://en.esotericsoftware.com/spine-bones and “Attachments”: https://us.esotericsoftware.com/spine-attachments — primary technical reference for hierarchical joint transforms and attaching art parts to a skeleton; concepts only, no Spine dependency.

These sources support a manual, pose-first workflow. Their examples are references for timing and construction, not permission to copy or redistribute the authors' sprites or palettes.

- Pixel Salvaje: https://pixel-salvaje.itch.io/isometric-character-template-64-pixel-art — reference template advertised as 64×64, eight directions; idle four frames, walk/run eight frames, and sitting/action examples. Paid asset pack; redistribution prohibited. Learn contact poses and direction consistency from its public examples, rather than copying assets into the game.
- Pixelorama: https://github.com/Orama-Interactive/Pixelorama — MIT licensed editor with layers, frames, onion skinning, tags and PNG/spritesheet/GIF export. Preferred visual editing option for this pipeline.
- LibreSprite: https://github.com/LibreSprite/LibreSprite — GPLv2 sprite editor fork; alternative for sprite and animation editing. The editor's license and artwork rights are separate.
- User-provided Slynyrd dummy GIF: six idle key poses shown with 200/200/400/200/200/400 ms holds. Uneven holds make breathing read as rest instead of continuous bobbing. The attached GIF file itself has sixteen 100 ms encoded frames; diagram timing is a design example, not file metadata.

Local skills reviewed: clareira-delivery (runtime/preview verification) and create-game-assets (provenance, stable pivots and native-scale inspection). This skill adds the missing character-specific stance compensation and staged support transitions.

Skill collection source: https://github.com/gamedev-skills/awesome-gamedev-agent-skills — inspected its asset workflow; no engine migration or whole-collection installation was needed. Existing local copy records upstream commit and attribution in `.agents/skills/SOURCE.md`.
