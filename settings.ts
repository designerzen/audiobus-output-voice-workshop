/**
 * Settings shared by the output (main thread) and its worklet (audio thread).
 * Nothing here imports Voice Workshop itself, so the main thread stays light.
 */

export type VowelMode = "pad" | "cycle" | "pitch"
export type SourceModel = "lf" | "twomass"

export interface Settings {
	/** id of one of Voice Workshop's built-in voices */
	voice: string
	/** where each note's vowel comes from: the pad, the next vowel of the sequence, or the note's pitch class */
	vowelMode: VowelMode
	/** vowel pad, 0 front .. 1 back */
	vowelX: number
	/** vowel pad, 0 close .. 1 open */
	vowelY: number
	/** glottal source: drawn LF pulses or self-oscillating two-mass folds */
	model: SourceModel
	/** times the voice's own Rd: below 1 pressed, above 1 breathy */
	breathiness: number
	/** times the voice's own lung pressure */
	effort: number
	/** folds held apart, no vibration */
	whisper: boolean
	/** added to the voice's nasal leak, 0..1 */
	nasal: number
	/** times the voice's own tract length */
	size: number
	/** larynx height added to the voice's, cm (+ brighter, - darker) */
	larynx: number
	/** cents */
	vibratoDepth: number
	/** Hz */
	vibratoRate: number
	/** pitch glide between held notes, ms */
	glide: number
	/** breath onset, ms */
	attack: number
	/** breath release, ms */
	release: number
	/** semitones */
	transpose: number
	/** dB */
	volume: number
}

export interface SettingRange {
	label: string
	min: number
	max: number
	step: number
	unit?: string
	group: string
}

export const DEFAULT_SETTINGS: Settings = {
	voice: "woman",
	vowelMode: "pad",
	vowelX: 0.45,
	vowelY: 1,
	model: "lf",
	breathiness: 1,
	effort: 1,
	whisper: false,
	nasal: 0,
	size: 1,
	larynx: 0,
	vibratoDepth: 25,
	vibratoRate: 5.5,
	glide: 60,
	attack: 40,
	release: 180,
	transpose: 0,
	volume: 0
}

export const SETTING_RANGES = {
	vowelX: { label: "Front / back", min: 0, max: 1, step: 0.001, group: "Vowel" },
	vowelY: { label: "Close / open", min: 0, max: 1, step: 0.001, group: "Vowel" },
	breathiness: { label: "Breath", min: 0.4, max: 2.5, step: 0.01, unit: "×", group: "Folds" },
	effort: { label: "Effort", min: 0.4, max: 1.8, step: 0.01, unit: "×", group: "Folds" },
	nasal: { label: "Nasal", min: 0, max: 1, step: 0.01, group: "Tract" },
	size: { label: "Tract size", min: 0.7, max: 1.25, step: 0.01, unit: "×", group: "Tract" },
	larynx: { label: "Larynx", min: -1, max: 1, step: 0.01, unit: "cm", group: "Tract" },
	vibratoDepth: { label: "Vibrato", min: 0, max: 120, step: 1, unit: "ct", group: "Performance" },
	vibratoRate: {
		label: "Vibrato rate",
		min: 3,
		max: 8,
		step: 0.1,
		unit: "Hz",
		group: "Performance"
	},
	glide: { label: "Glide", min: 0, max: 600, step: 1, unit: "ms", group: "Performance" },
	attack: { label: "Attack", min: 5, max: 600, step: 1, unit: "ms", group: "Performance" },
	release: { label: "Release", min: 10, max: 1500, step: 1, unit: "ms", group: "Performance" },
	transpose: { label: "Transpose", min: -24, max: 24, step: 1, unit: "st", group: "Performance" },
	volume: { label: "Volume", min: -30, max: 12, step: 0.5, unit: "dB", group: "Output" }
} as const satisfies Partial<Record<keyof Settings, SettingRange>>

export type NumericSetting = keyof typeof SETTING_RANGES

/** Voice Workshop's built-in voices (src/dsp/voice/builtin.ts). */
export const VOICES: readonly { id: string; name: string }[] = [
	{ id: "man", name: "Man" },
	{ id: "woman", name: "Woman" },
	{ id: "child", name: "Child" },
	{ id: "deep", name: "Deep" },
	{ id: "whisper", name: "Whisper" },
	{ id: "creak", name: "Vocal fry" },
	{ id: "breathy", name: "Breathy" },
	{ id: "pressed", name: "Pressed" },
	{ id: "raspy", name: "Raspy" },
	{ id: "dark", name: "Dark" },
	{ id: "bright", name: "Bright" },
	{ id: "nasal", name: "Nasal" },
	{ id: "warm", name: "Warm" },
	{ id: "hollow", name: "Hollow" },
	{ id: "sky", name: "Sky-like" },
	{ id: "sara", name: "Sara-like" },
	{ id: "nicola", name: "Nicola-like" }
]

export const VOWEL_MODES: readonly { id: VowelMode; name: string }[] = [
	{ id: "pad", name: "Pad" },
	{ id: "cycle", name: "Cycle" },
	{ id: "pitch", name: "Pitch class" }
]

export const SOURCE_MODELS: readonly { id: SourceModel; name: string }[] = [
	{ id: "lf", name: "LF pulses" },
	{ id: "twomass", name: "Two-mass folds" }
]

/**
 * The vowels on the pad, placed as on the IPA vowel chart: x front (0) to
 * back (1), y close (0) to open (1). The worklet blends the postures of the
 * nearest ones, so any point of the pad is a vowel.
 */
export const VOWELS: readonly { ipa: string; x: number; y: number }[] = [
	{ ipa: "i", x: 0, y: 0 },
	{ ipa: "e", x: 0.12, y: 0.33 },
	{ ipa: "ɛ", x: 0.24, y: 0.66 },
	{ ipa: "a", x: 0.36, y: 1 },
	{ ipa: "ɑ", x: 1, y: 1 },
	{ ipa: "ɔ", x: 1, y: 0.66 },
	{ ipa: "o", x: 1, y: 0.33 },
	{ ipa: "u", x: 1, y: 0 },
	{ ipa: "ə", x: 0.6, y: 0.5 }
]

/** The order vowels take in cycle mode, and the vowel of each pitch class (C to B). */
export const VOWEL_SEQUENCE = ["a", "e", "i", "o", "u"]
export const PITCH_CLASS_VOWELS = ["a", "ɑ", "e", "ɛ", "i", "ə", "o", "ɔ", "u", "o", "e", "a"]

export const vowelPosition = (ipa: string) => VOWELS.find((v) => v.ipa === ipa) ?? VOWELS[3]

/** Keep a patch inside the ranges and the known choices. */
export function sanitizeSettings(patch: Partial<Settings>, current: Settings): Settings {
	const next = { ...current }
	for (const [key, range] of Object.entries(SETTING_RANGES) as [NumericSetting, SettingRange][]) {
		const value = Number(patch[key])
		if (patch[key] !== undefined && Number.isFinite(value)) {
			next[key] = Math.min(range.max, Math.max(range.min, value))
		}
	}
	if (VOICES.some((v) => v.id === patch.voice)) {
		next.voice = patch.voice!
	}
	if (VOWEL_MODES.some((m) => m.id === patch.vowelMode)) {
		next.vowelMode = patch.vowelMode!
	}
	if (SOURCE_MODELS.some((m) => m.id === patch.model)) {
		next.model = patch.model!
	}
	if (patch.whisper !== undefined) {
		next.whisper = Boolean(patch.whisper)
	}
	return next
}

/** Messages to the worklet. */
export type WorkletMessage =
	| { type: "settings"; settings: Settings }
	| {
			type: "note"
			frequency: number
			velocity: number
			vowel?: { x: number; y: number }
			legato: boolean
	  }
	| { type: "release" }
	| { type: "panic" }
	| { type: "watch"; on: boolean }

/** What the worklet reports while watched, about 30 times a second. */
export interface VoiceTelemetry {
	type: "telemetry"
	/** area of each section of the tract, glottis to lips, cm² */
	areas: Float64Array
	lipsIndex: number
	nasalPort: number
	f0: number
	voicing: number
	/** lung pressure, cm H₂O */
	ps: number
}