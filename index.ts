/**
 * audiobus-output-voice-workshop
 * Voice Workshop's physically modelled voice as an audiobus output.
 *
 * Importing this entry is side-effect free: the output and its engine (which
 * needs a browser with AudioWorklet) load only when an output is created.
 */
import type { Options } from "./output-voice-workshop.ts"

export type { Options as VoiceWorkshopOptions } from "./output-voice-workshop.ts"
export type { Settings as VoiceWorkshopSettings, VoiceTelemetry } from "./settings.ts"
export type OutputVoiceWorkshop = import("./output-voice-workshop.ts").default

export const VOICE_WORKSHOP_OUTPUT_ID = "voice-workshop"

/** Describes the output for a host's device picker; compatible with audiobus's OutputDefinition. */
export const voiceWorkshopDefinition = {
	id: VOICE_WORKSHOP_OUTPUT_ID,
	type: "engine",
	subtype: "instrument",
	name: "Voice Workshop",
	description: "Physically modelled singing voice: vocal folds, tract and breath",
	icon: new URL("./assets/output-voice-workshop.svg", import.meta.url).href,
	preview: new URL("./assets/output-voice-workshop-preview.jpg", import.meta.url).href,
	category: "Synthesis",
	attribution: {
		author: "Fabio Angela (Voice Workshop); audiobus output by designerzen",
		sourceUrl: "https://github.com/MithrilMan/voice-workshop",
		license: "Apache-2.0",
		licenseUrls: ["https://www.apache.org/licenses/LICENSE-2.0"] as string[]
	}
} as const

/** Load the output class on demand. */
export async function loadOutputVoiceWorkshop() {
	return (await import("./output-voice-workshop.ts")).default
}

export async function createOutputVoiceWorkshop(
	options: Options = {}
): Promise<OutputVoiceWorkshop> {
	const OutputVoiceWorkshop = await loadOutputVoiceWorkshop()
	return new OutputVoiceWorkshop(options)
}

/** Pass to audiobus's registerOutput() to add Voice Workshop to its outputs. */
export const voiceWorkshopOutput = {
	definition: voiceWorkshopDefinition,
	isAvailable: () => typeof window !== "undefined" && typeof AudioWorkletNode !== "undefined",
	create: createOutputVoiceWorkshop
}