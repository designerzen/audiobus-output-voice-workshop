# audiobus-output-voice-workshop

[Voice Workshop](https://github.com/MithrilMan/voice-workshop), Fabio Angela's physically based simulator of the human voice, played as an [audiobus](https://github.com/designerzen/audiobus) output. Lungs push air through vocal folds (drawn LF pulses or self-oscillating two-mass folds) and a vocal tract with tongue, jaw, lips, velum and nose, all computed live in an AudioWorklet.

Notes set the pitch and the breath, one note at a time: overlapping notes glide, and velocity sets the lung pressure. Each note's vowel comes from the vowel pad, the next vowel of `a e i o u`, or the note's pitch class. The GUI shows the pad as an IPA vowel chart and draws the shape of the tract as it sings.

## Install

```bash
pnpm add github:designerzen/audiobus-output-voice-workshop
```

## With audiobus

```ts
import { registerOutput } from "audiobus/io/output-factory"
import { voiceWorkshopOutput } from "audiobus-output-voice-workshop"

registerOutput(voiceWorkshopOutput)
```

## On its own

```ts
import { createOutputVoiceWorkshop } from "audiobus-output-voice-workshop"

const voice = await createOutputVoiceWorkshop({ audioContext, voice: "man", vowelX: 1, vowelY: 0 })
await voice.connect()
voice.noteOn(48, 100)
voice.noteOff(48)
document.body.append(await voice.createGui())
```

## Options

The musical settings below are controls (`configure()`, or `getUiDescriptor()` and `setControlValue()` for a control surface). Runtime `audioContext`, `destination` and `mixer` options are separate and are not serialized musical settings. The supplied context must be enabled from a user action; `mixer` takes routing precedence over `destination`.

| Option | Default | Meaning |
| --- | --- | --- |
| `voice` | `woman` | One of Voice Workshop's built-in voices: `man`, `woman`, `child`, `deep`, `whisper`, `creak`, `breathy`, `pressed`, `raspy`, `dark`, `bright`, `nasal`, `warm`, `hollow`, `sky`, `sara`, `nicola` |
| `vowelMode` | `pad` | `pad`, `cycle` or `pitch` |
| `vowelX`, `vowelY` | `0.45`, `1` | Pad position: front to back, close to open |
| `model` | `lf` | `lf` pulses or `twomass` folds |
| `breathiness` | `1` | Times the voice's own Rd: below 1 pressed, above 1 breathy |
| `effort` | `1` | Times the voice's own lung pressure |
| `whisper` | `false` | Folds apart, no vibration |
| `nasal` | `0` | Added nasal leak, 0 to 1 |
| `size` | `1` | Times the voice's tract length |
| `larynx` | `0` | Larynx height added, cm |
| `vibratoDepth`, `vibratoRate` | `25`, `5.5` | Cents and Hz |
| `glide`, `attack`, `release` | `60`, `40`, `180` | Milliseconds |
| `transpose` | `0` | Semitones |
| `volume` | `0` | dB |

## Building the worklet

[settings.ts](settings.ts) is the authoritative list of defaults, ranges and choices; [the output](output-voice-workshop.ts) defines runtime options and lifecycle. Release notes and call `destroy()` on removal; the host owns its AudioContext. Harmoneasy already registers the `voice-workshop` output. [package.json](package.json) declares the version, export subpaths and build/type-check commands.

`voice-workshop.worklet.js` is built from `worklet/` and Voice Workshop's source at the commit pinned in `package.json` (`voiceWorkshop.commit`):

```bash
pnpm run build
```

The script fetches that commit into `.upstream/` and bundles it with esbuild into one ES module with no imports, which any bundler can serve as an asset. The bundle also exports `VoiceWorkshopVoice`, so the voice can be rendered outside a worklet. To update Voice Workshop, change the commit and build again.

## Credits

Voice Workshop is Copyright 2026 Fabio Angela and licensed under the Apache License 2.0; see `LICENSE-voice-workshop` and `NOTICE-voice-workshop`. The preview image comes from Voice Workshop.
