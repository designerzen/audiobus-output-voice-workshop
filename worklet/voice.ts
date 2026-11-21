/**
 * One Voice Workshop voice played like an instrument: the engine's lungs,
 * folds and tract, driven by notes instead of a score. It has no audio
 * thread of its own, so the tests render it directly.
 */
import { VoiceEngine, type Telemetry } from "../.upstream/src/dsp/engine/engine"
import { defaultParams, type EngineParams } from "../.upstream/src/dsp/engine/params"
import { builtinVoice } from "../.upstream/src/dsp/voice/builtin"
import { applyDesign } from "../.upstream/src/dsp/voice/design"
import { phonemeFor } from "../.upstream/src/dsp/speech/derive"
import type { TamChannel } from "../.upstream/src/dsp/speech/tam"
import {
	ARTICULATOR_KEYS,
	DEFAULT_ARTICULATORS,
	type Articulators
} from "../.upstream/src/dsp/tract/types"
import { DEFAULT_SETTINGS, VOWELS, type Settings } from "../settings"

/** gain of the engine's output at 0 dB, matching the level of audiobus's other outputs */
const BASE_VOLUME = 1
/** after this long released and quiet the engine stops computing, s */
const IDLE_AFTER = 1.5
/** the engine's own f0 smoothing (TAM_TAU.f0), s */
const MIN_GLIDE = 0.025
/** whisper: folds this far apart (as the built-in Whisper voice) */
const WHISPER_ABDUCTION = 0.42

interface Posture {
	x: number
	y: number
	art: Articulators
}

export class VoiceWorkshopVoice {
	readonly engine: VoiceEngine
	readonly fs: number
	#settings: Settings = { ...DEFAULT_SETTINGS }
	#params: EngineParams = defaultParams()
	#design: EngineParams = defaultParams()
	#postures: Posture[] = []
	#noteVowel: { x: number; y: number } | null = null
	#gate = false
	#velocity = 1
	#frequency = 220
	#quiet = 0
	#idle = true

	constructor(fs: number) {
		this.fs = fs
		this.engine = new VoiceEngine(fs, this.#params)
		this.configure(this.#settings, true)
	}

	get settings(): Settings {
		return this.#settings
	}

	get sounding(): boolean {
		return !this.#idle
	}

	get #tam(): Record<string, TamChannel> {
		return (this.engine as unknown as { tam: Record<string, TamChannel> }).tam
	}

	/** Apply settings; a new voice or tract rebuilds the vowel postures for that head. */
	configure(settings: Settings, snap = false): void {
		const previous = this.#settings
		this.#settings = settings
		if (
			snap ||
			settings.voice !== previous.voice ||
			settings.size !== previous.size ||
			settings.nasal !== previous.nasal
		) {
			this.#loadVoice()
		}
		this.#update()
		if (snap) {
			this.engine.snapArticulators()
		}
	}

	#loadVoice(): void {
		const voice = builtinVoice(this.#settings.voice) ?? builtinVoice("man")!
		const design = defaultParams()
		applyDesign(design, voice.design)
		design.anatomy.scale *= this.#settings.size
		design.anatomy.nasalLeak = Math.min(1, design.anatomy.nasalLeak + this.#settings.nasal)
		this.#design = design
		// each vowel as this head makes it (the same constriction in the same place)
		this.#postures = VOWELS.flatMap(({ ipa, x, y }) => {
			const phoneme = phonemeFor(ipa, design)
			return phoneme ? [{ x, y, art: { ...DEFAULT_ARTICULATORS, ...phoneme.art } }] : []
		})
	}

	/** The articulators of a point of the pad: the postures of the vowels near it, weighted by closeness. */
	#vowelAt(x: number, y: number): Articulators {
		const weights = this.#postures.map((p) => {
			const d2 = (p.x - x) ** 2 + (p.y - y) ** 2
			return d2 < 1e-6 ? 1e6 : 1 / (d2 * d2)
		})
		const total = weights.reduce((a, b) => a + b, 0)
		const art = { ...DEFAULT_ARTICULATORS }
		for (const key of ARTICULATOR_KEYS) {
			art[key] =
				this.#postures.reduce((sum, p, i) => sum + p.art[key] * weights[i], 0) / total
		}
		return art
	}

	#update(): void {
		const s = this.#settings
		const d = this.#design
		const p = this.#params
		const vowel =
			s.vowelMode === "pad" || !this.#noteVowel
				? { x: s.vowelX, y: s.vowelY }
				: this.#noteVowel
		p.anatomy = d.anatomy
		p.teeth = d.teeth
		p.noise = { ...d.noise, aspiration: d.noise.aspiration + (s.whisper ? 4 : 0) }
		p.source = {
			...d.source,
			model: s.model,
			f0: this.#frequency,
			rd: Math.min(2.7, Math.max(0.3, d.source.rd * s.breathiness)),
			ps: d.source.ps * s.effort * (0.55 + 0.6 * this.#velocity),
			vibratoDepth: s.vibratoDepth,
			vibratoRate: s.vibratoRate
		}
		p.voicing = d.voicing && !s.whisper
		p.abduction = s.whisper ? Math.max(d.abduction, WHISPER_ABDUCTION) : d.abduction
		p.articulators = {
			...this.#vowelAt(vowel.x, vowel.y),
			larynx: d.articulators.larynx + s.larynx,
			epilarynx: d.articulators.epilarynx
		}
		p.phonate = this.#gate
		p.volume = BASE_VOLUME + s.volume
		this.engine.setParams(p)
	}

	/** Breathe a note: from silence the pitch starts on it, held notes glide to it. */
	noteOn(
		frequency: number,
		velocity: number,
		vowel?: { x: number; y: number },
		legato = false
	): void {
		const tam = this.#tam
		this.#frequency = frequency
		this.#velocity = Math.min(1, Math.max(0, velocity))
		if (vowel) {
			this.#noteVowel = vowel
		}
		tam.f0.tau = Math.max(MIN_GLIDE, this.#settings.glide / 1000 / 3)
		if (!legato) {
			tam.f0.set(frequency)
		}
		// three cascaded sections reach the target in about three time constants
		tam.ps.tau = this.#settings.attack / 1000 / 3
		this.#gate = true
		this.#idle = false
		this.#quiet = 0
		this.#update()
	}

	release(): void {
		this.#tam.ps.tau = this.#settings.release / 1000 / 3
		this.#gate = false
		this.#update()
	}

	panic(): void {
		this.#gate = false
		this.#tam.ps.set(0)
		this.#update()
		this.#idle = true
	}

	/** Render one block of mono samples; silence without computing once the breath has gone. */
	process(out: Float32Array): void {
		if (this.#idle) {
			out.fill(0)
			return
		}
		this.engine.process(out, out.length)
		if (!this.#gate) {
			this.#quiet += out.length
			if (this.#quiet > IDLE_AFTER * this.fs + (this.#settings.release * this.fs) / 1000) {
				this.#idle = true
			}
		}
	}

	telemetry(): Telemetry {
		return this.engine.telemetry()
	}
}