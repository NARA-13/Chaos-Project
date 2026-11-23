# CHAOS PROJECT

A browser-playable **DELTARUNE** fan recreation focused exclusively on the original **Chapter 1 Jevil boss fight**, built with vanilla HTML5 Canvas, ES Modules, and Web Audio API using official pixel-art sprite rips, authentic sound effects, and voice clips.

> *"UEE HEE HEE! I CAN DO ANYTHING!"*

---

## Features

- **Faithful Chapter 1 Jevil Recreation**
  - Complete turn-based Deltarune battle engine with **Kris** (`90 HP`), **Susie** (`110 HP`), and **Ralsei** (`70 HP`).
  - Authentic HUD featuring the slanted **TP Gauge**, active popped-up character action cards, negative downed HP + passive turn recovery, Chapter 1 healing inventory, speech bubbles, and the 3D-perspective revolving carousel arena.
  - Full combat suite:
    - **FIGHT**: Multi-lane timing bar minigame with bullseye critical hits and slash VFX.
    - **ACT (Kris)**: `Check`, `Pirouette` (`20% TP`, full **9-turn rotating effect table** including DF drop, reduced i-frames, the flying useless bird, Turn 7 HP bar shuffle, and Turn 9 full-party heal), and `Hypnosis` (`50% TP`, consumes all 3 party turns, +1 Tiredness, and weakens Jevil's next attack by 30%).
    - **MAGIC**: Susie's `Rude Buster` (`50% TP`, press Confirm on impact for boosted damage), Ralsei's `Heal Prayer` (`32% TP`), and `Pacify` (`16% TP`).
    - **ITEM**: `TopCake`, `Clubssandwich`, `ReviveMint ×2`, `Darkburger ×4`, `ChocoDiamond ×2` (Kris bonus), and `HeartsDonut ×2` (Susie bonus).
    - **SPARE / DEFEND**: Defending grants `+16% TP` and halves incoming damage; grazing bullets flashes the SOUL outline and builds TP.
  - **Both Original Endings**: Win via **FIGHT** (`DEVILSKNIFE`) or **PACIFY** (`JEVILSTAIL`), complete with pre-battle intro, phase dialogue, post-battle ending cutscenes, Chaos Rank summary (`S+` to `C`), persisted personal best records, and the Red SOUL shatter Game Over screen.
- **Two Game Modes**: **Normal Mode** and **Chaos Mode** (see breakdown below).
- **Polished Main Menu & Live Settings**:
  - **Audio**: Master, Music, and SFX sliders + Jevil Voice Clips toggle.
  - **Controls**: Full interactive keybind remapping + Gamepad support.
  - **Display**: Pixel-sharp scale (`FIT`, `1×`, `2×`), optional CRT scanlines, screen shake comfort (`Full`, `Reduced`, `Off`), carousel spin comfort (`Normal`, `Reduced`, `Static`), FPS counter, and SOUL/bullet hitbox overlay.
  - **Gameplay**: Skip pre-battle intro, hold-to-slow focus movement, optional Boss exact HP/Tired bar, and floating damage numbers toggle.
- **Zero External Runtime Dependencies**: Pure ES Modules + lightweight Node.js static server with HTTP Range streaming for seamless audio looping.

---

## Game Modes

| Feature | Normal Mode | Chaos Mode |
| :--- | :--- | :--- |
| **Jevil HP** | `3,500` | `5,250` |
| **Jevil AT / DF** | `10 AT` / `5 DF` | `13 AT` / `6 DF` |
| **Pacify Threshold** | `9` Tiredness (or Phase 5 turn scaling) | `12` Tiredness (or Phase 5 turn scaling) |
| **Bullet Speed / Density** | `1.0×` (Original Chapter 1 pacing) | `1.24×` speed / `1.26×` spawn / `1.28×` damage |
| **Carousel Arena** | Classic midnight blue revolving carousel | Crimson-violet Chaos carousel palette |
| **Attack Patterns** | All **16 original Jevil attacks** across Phases 1–5 (including *Final Chaos* & Phase 5 motion blur) | Original patterns **+ 5 Chaos-exclusive attacks** (*Double Counter-Rotating Rings*, *Cross-Arena Scythes*, *Dual-Direction Carousel Stampede*, *4-Suit Chaos Storm*, *True & Neo Final Chaos*) |
| **Battle Music** | `THE WORLD REVOLVING.mp3` | `DELTARUNE - THE WORLD REVOLVING Remix (Jevil's Theme).mp3` |

*Main Menu Theme:* `The Circus.mp3`

---

## Controls

All keyboard controls can be customized in **Settings → Controls** (Gamepad is also supported).

| Action | Default Keys |
| :--- | :--- |
| **Move SOUL / Navigate Menus** | `Arrow Keys` or `W A S D` |
| **Confirm / Attack / Rude Buster Boost** | `Z`, `Enter`, or `Space` |
| **Cancel / Hold for Slow Precision SOUL** | `X` or `Shift` |
| **Pause / Close Modal** | `Esc` or `C` |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (no `npm install` required).

### Run Locally

```bash
git clone <your-repository-url>
cd chaos-project
node server.js
```

Then open **`http://localhost:3000`** in your browser.

*(You can override the default port with `PORT=8080 node server.js`.)*

---

## Project Structure

```text
chaos-project/
├── index.html              # Game shell, canvas stage, and modal overlays
├── styles.css              # Retro Deltarune pixel UI & optional CRT styling
├── server.js               # Zero-dependency Node.js static server (with Range support)
├── src/
│   ├── main.js             # Preloader, Main Menu, Mode Select, Settings, Credits, Pause, game loop
│   ├── battle.js           # Turn-based battle state machine, HUD, FIGHT timing, ACT/MAGIC/ITEM, endings
│   ├── attacks.js          # Bullet-hell engine, SOUL movement/grazing, 16 Normal + 5 Chaos patterns
│   ├── background.js       # 3D perspective rotating carousel backdrop renderer
│   ├── config.js           # Mode definitions, party/inventory data, persisted settings/records, credits
│   ├── dialogue.js         # Pre-battle intro, flavor text, phase quotes, Pirouette lines, endings
│   ├── assets.js           # Sprite manifest loader, tint cache, and pixel-perfect draw helper
│   ├── audio.js            # Looping MP3 music player + Web Audio API SFX/voice mixer
│   └── input.js            # Keyboard + Gamepad input handler and interactive keybind remapper
└── assets/
    ├── audio/              # BGM tracks (The Circus, THE WORLD REVOLVING, Remix)
    ├── sfx/                # 56 official Deltarune battle SFX + 6 Jevil voice clips
    ├── sprites/            # 82 sliced transparent PNG sprite strips + manifest.json
    └── fonts/              # PressStart2P, Silkscreen, VT323 (SIL OFL 1.1)
```

---

## Credits & Attributions

### Original Game & Intellectual Property
- **DELTARUNE** created by **Toby Fox**, **Temmie Chang**, and team.
- Original Jevil boss concept, writing, characters, battle mechanics, and music (*"The Circus"* & *"THE WORLD REVOLVING"*) by **Toby Fox**.
- Jevil character design by **kanotynes** & **Toby Fox**.

### Sprite Resources ([The Spriters Resource](https://www.spriters-resource.com/pc_computer/deltarune/))
- **Jevil Sheet (`#110456`)**: Modern (Ralsei Gang).
- **Kris Ch.1+2 (`#110448`)**: Kendotlibero, asym, Eli101gamer, KoolTimYT, MrDoubleA, Sissel, Yuti, Bubbled.
- **Ralsei Ch.1+2 (`#110469`)**: Kendotlibero, asym, Luxandre, Sissel, TattleameliaMLG.
- **Susie Ch.1+2 (`#110471`)**: Kendotlibero, asym, Sissel, TattleameliaMLG.
- **Battle Menu (`#110733`)**: KaiyoLazr, MINOXX_, Sticks, NoobCat, Pvzdabest, TattleameliaMLG, asym.
- **Effects (`#113349`) & Speech Bubbles (`#113195`)**: UndertaleFan25, Charles29, Sugar2000galaxy, MrDoubleA.

### Sound Effects, Voices & Music
- **Common Sound Effects**: Ripped by **Chopp** ([The Sounds Resource `#17330`](https://www.sounds-resource.com/)).
- **Jevil Voice Clips**: Sourced from the **Deltarune Wiki** (original voice acting by Toby Fox).
- **Main Menu Theme**: *"The Circus"* — Toby Fox.
- **Normal Mode Battle Theme**: *"THE WORLD REVOLVING"* — Toby Fox.
- **Chaos Mode Battle Theme**: *"DELTARUNE - THE WORLD REVOLVING Remix (Jevil's Theme)"* — user-provided remix track.

### Fonts
- **Press Start 2P**, **Silkscreen**, and **VT323** — licensed under the [SIL Open Font License 1.1](https://scripts.sil.org/OFL).

---

## Disclaimer

**CHAOS PROJECT** is a non-commercial fan recreation created purely for tribute and entertainment. All **DELTARUNE** characters, sprites, sound effects, dialogue, and original music remain the property of **Toby Fox**. Please support the official game at [deltarune.com](https://deltarune.com/).
