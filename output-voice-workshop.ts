import {
	DEFAULT_SETTINGS,
	PITCH_CLASS_VOWELS,
	SETTING_RANGES,
	SOURCE_MODELS,
	VOICES,
	VOWEL_MODES,
	VOWEL_SEQUENCE,
	sanitizeSettings,
	vowelPosition,
	type NumericSetting,
	type Settings,
	type VoiceTelemetry,
	type WorkletMessage
} from "./settings.ts"

/** The same event names audiobus uses (audiobus/events/event-constants), without depending on it. */
export const EVENT_CONFIGURATION_CHANGED = "configurationChanged"
export const EVENT_TELEMETRY = "telemetry"

const PROCESSOR_NAME = "voice-workshop"
const workletURL = new URL("./voice-workshop.worklet.js", import.meta.url).href
const loadedContexts = new WeakMap<BaseAudioContext, Promise<void>>()

const midiNoteToFrequency = (note: number): number => 440 * 2 ** ((note - 69) / 12)

type ControlValue = string | number | boolean | number[]

export interface Options extends Partial<Settings> {
	audioContext?: AudioContext
	destination?: AudioNode
	mixer?: AudioNode
}

/**
 * OutputVoiceWorkshop
 *
 * A physically modelled human voice (Voice Workshop by Fabio Angela): lungs,
 * vocal folds and a vocal tract with tongue, lips, velum and nose. Notes set
 * the pitch and the breath, one note at a time; the vowel comes from the pad,
 * a sequence, or the note's pitch class.
 */
export default class OutputVoiceWorkshop extends EventTarget {
	static ID = 0

	readonly uuid = `Output-Voice-Workshop-${OutputVoiceWorkshop.ID++}`
	readonly name = "Voice Workshop"
	readonly description = "Physically modelled singing voice: folds, tract and breath"
	readonly isHidden = false
	readonly requiresConnectionControl = false
	readonly configurationAffectsNoteRouting = false
	readonly output: GainNode

	#context: AudioContext
	#settings: Settings
	#node?: AudioWorkletNode
	#loading?: Promise<AudioWorkletNode>
	#held: number[] = []
	#velocities = new Map<number, number>()
	#cycle = 0
	#generation = 0
	#connected = true
	#destroyed = false
	#watchers = 0
	#gui?: { element: HTMLElement; destroy(): void }

	get isConnected(): boolean {
		return this.#connected
	}

	get options(): Settings {
		return { ...this.#settings }
	}

	/** Notes held, oldest first; the last one sounds. */
	get heldNotes(): readonly number[] {
		return this.#held
	}

	hasAudioOutput(): boolean {
		return true
	}

	hasMidiOutput(): boolean {
		return false
	}

	constructor(options: Options = {}) {
		super()
		if (!options.audioContext) {
			throw new Error("Voice Workshop requires an audio context")
		}
		this.#context = options.audioContext
		this.#settings = sanitizeSettings(options, DEFAULT_SETTINGS)
		this.output = this.#context.createGain()
		this.output.connect(options.mixer ?? options.destination ?? this.#context.destination)
	}

	#initialise(): Promise<AudioWorkletNode> {
		if (this.#destroyed) {
			return Promise.reject(new Error("Voice Workshop has been destroyed"))
		}
		if (this.#node) {
			return Promise.resolve(this.#node)
		}
		return (this.#loading ??= (async () => {
			const context = this.#context
			let loaded = loadedContexts.get(context)
			if (!loaded) {
				loaded = context.audioWorklet.addModule(workletURL)
				loadedContexts.set(context, loaded)
				loaded.catch(() => loadedContexts.delete(context))
			}
			await loaded
			if (this.#destroyed) {
				throw new Error("Voice Workshop has been destroyed")
			}
			const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [2]
			})
			node.port.onmessage = ({ data }: MessageEvent<VoiceTelemetry>) => {
				if (data.type === "telemetry") {
					this.dispatchEvent(new CustomEvent(EVENT_TELEMETRY, { detail: data }))
				}
			}
			node.connect(this.output)
			this.#node = node
			this.#post({ type: "settings", settings: this.#settings })
			if (this.#watchers) {
				this.#post({ type: "watch", on: true })
			}
			return node
		})().finally(() => {
			this.#loading = undefined
		}))
	}

	#post(message: WorkletMessage): void {
		this.#node?.port.postMessage(message)
	}

	/** Send to the worklet once it is running, unless notes were stopped meanwhile. */
	async #send(message: WorkletMessage): Promise<void> {
		if (this.#node) {
			this.#post(message)
			return
		}
		const generation = this.#generation
		await this.#initialise()
		if (generation === this.#generation) {
			this.#post(message)
		}
	}

	configure(patch: Partial<Settings>): void {
		const previous = this.#settings
		this.#settings = sanitizeSettings(patch, previous)
		if (this.#settings.vowelMode !== previous.vowelMode) {
			this.#cycle = 0
		}
		this.#post({ type: "settings", settings: this.#settings })
		this.dispatchEvent(new Event(EVENT_CONFIGURATION_CHANGED))
	}

	#vowelFor(note: number): { x: number; y: number } | undefined {
		switch (this.#settings.vowelMode) {
			case "cycle":
				return vowelPosition(VOWEL_SEQUENCE[this.#cycle++ % VOWEL_SEQUENCE.length])
			case "pitch":
				return vowelPosition(PITCH_CLASS_VOWELS[((note % 12) + 12) % 12])
			default:
				return undefined
		}
	}

	#sing(
		note: number,
		velocity: number,
		legato: boolean,
		vowel = this.#vowelFor(note)
	): Promise<void> {
		return this.#send({
			type: "note",
			frequency: midiNoteToFrequency(note + this.#settings.transpose),
			velocity: velocity / 127,
			vowel: vowel && { x: vowel.x, y: vowel.y },
			legato
		})
	}

	noteOn(note: number, velocity = 100): Promise<void> {
		if (!this.#connected || this.#destroyed) {
			return Promise.resolve()
		}
		const legato = this.#held.length > 0
		this.#held = this.#held.filter((n) => n !== note)
		this.#held.push(note)
		this.#velocities.set(note, velocity)
		return this.#sing(note, velocity, legato)
	}

	noteOff(note: number): void {
		const index = this.#held.indexOf(note)
		if (index < 0) {
			return
		}
		this.#held.splice(index, 1)
		this.#velocities.delete(note)
		if (!this.#held.length) {
			void this.#send({ type: "release" })
		} else if (index === this.#held.length) {
			// the sounding note let go: glide back to the last one still held
			const previous = this.#held[this.#held.length - 1]
			const vowel =
				this.#settings.vowelMode === "pitch" ? this.#vowelFor(previous) : undefined
			void this.#sing(previous, this.#velocities.get(previous) ?? 100, true, vowel)
		}
	}

	allNotesOff(): void {
		this.#generation++
		this.#held = []
		this.#velocities.clear()
		this.#post({ type: "panic" })
	}

	async connect(): Promise<void> {
		if (this.#destroyed) {
			return
		}
		if (this.#context.state === "suspended") {
			await this.#context.resume()
		}
		await this.#initialise()
		this.#connected = !this.#destroyed
	}

	async disconnect(): Promise<void> {
		this.#connected = false
		this.allNotesOff()
	}

	/** Receive the tract's shape and the voice's pitch while the listener is subscribed. */
	watch(listener: (telemetry: VoiceTelemetry) => void): () => void {
		const handler = (event: Event) => listener((event as CustomEvent<VoiceTelemetry>).detail)
		this.addEventListener(EVENT_TELEMETRY, handler)
		if (this.#watchers++ === 0) {
			this.#post({ type: "watch", on: true })
		}
		return () => {
			this.removeEventListener(EVENT_TELEMETRY, handler)
			if (--this.#watchers === 0) {
				this.#post({ type: "watch", on: false })
			}
		}
	}

	// Declarative controls, so hosts can map and draw them on a control surface

	getUiDescriptor() {
		const choice = (items: readonly { id: string; name: string }[]) =>
			items.map(({ id, name }) => ({ label: name, value: id }))
		const sliders = (
			Object.entries(SETTING_RANGES) as [
				NumericSetting,
				(typeof SETTING_RANGES)[NumericSetting]
			][]
		)
			.filter(([id]) => id !== "vowelX" && id !== "vowelY")
			.map(([id, range]) => ({
				id,
				label: range.label,
				widget: "slider" as const,
				group: range.group,
				min: range.min,
				max: range.max,
				step: range.step,
				unit: "unit" in range ? range.unit : undefined,
				defaultValue: DEFAULT_SETTINGS[id]
			}))
		return {
			title: this.name,
			controls: [
				{
					id: "voice",
					label: "Voice",
					widget: "select" as const,
					group: "Voice",
					priority: 0.9,
					choices: choice(VOICES),
					defaultValue: DEFAULT_SETTINGS.voice
				},
				{
					id: "vowel",
					label: "Vowel",
					widget: "xy" as const,
					group: "Vowel",
					priority: 1,
					min: 0,
					max: 1,
					defaultValue: [DEFAULT_SETTINGS.vowelX, DEFAULT_SETTINGS.vowelY]
				},
				{
					id: "vowelMode",
					label: "Vowel from",
					widget: "select" as const,
					group: "Vowel",
					choices: choice(VOWEL_MODES),
					defaultValue: DEFAULT_SETTINGS.vowelMode
				},
				{
					id: "model",
					label: "Folds",
					widget: "select" as const,
					group: "Folds",
					choices: choice(SOURCE_MODELS),
					defaultValue: DEFAULT_SETTINGS.model
				},
				{
					id: "whisper",
					label: "Whisper",
					widget: "toggle" as const,
					group: "Folds",
					defaultValue: DEFAULT_SETTINGS.whisper
				},
				...sliders
			]
		}
	}

	getControlValue(id: string): ControlValue | undefined {
		if (id === "vowel") {
			return [this.#settings.vowelX, this.#settings.vowelY]
		}
		return this.#settings[id as keyof Settings]
	}

	setControlValue(id: string, value: ControlValue): void {
		if (id === "vowel" && Array.isArray(value)) {
			this.configure({ vowelX: value[0], vowelY: value[1] })
		} else {
			this.configure({ [id]: value })
		}
	}

	subscribeControls(listener: () => void): () => void {
		this.addEventListener(EVENT_CONFIGURATION_CHANGED, listener)
		return () => this.removeEventListener(EVENT_CONFIGURATION_CHANGED, listener)
	}

	async createGui(): Promise<HTMLElement> {
		if (!this.#gui) {
			const { createVoiceWorkshopGui } = await import("./gui.ts")
			this.#gui = createVoiceWorkshopGui(this)
		}
		return this.#gui.element
	}

	async destroyGui(): Promise<void> {
		this.#gui?.destroy()
		this.#gui = undefined
	}

	destroy(): void {
		if (this.#destroyed) {
			return
		}
		this.#destroyed = true
		this.#connected = false
		this.allNotesOff()
		this.#node?.port.postMessage({ type: "destroy" })
		this.#node?.disconnect()
		this.#node?.port.close()
		this.#node = undefined
		this.output.disconnect()
		void this.destroyGui()
	}
}