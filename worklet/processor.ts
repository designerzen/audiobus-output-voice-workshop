/**
 * AudioWorklet entry, bundled with Voice Workshop's engine into
 * voice-workshop.worklet.js by scripts/build-worklet.mjs. The bundle also
 * exports the voice, so it can be rendered outside a worklet.
 */
import { VoiceWorkshopVoice } from "./voice"
import type { WorkletMessage } from "../settings"

export { VoiceWorkshopVoice }
export const PROCESSOR_NAME = "voice-workshop"

declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
	readonly port: MessagePort
}

/** telemetry every this many 128-sample blocks (about 30 a second at 48 kHz) */
const TELEMETRY_BLOCKS = 12

if (typeof registerProcessor === "function") {
	registerProcessor(
		PROCESSOR_NAME,
		class VoiceWorkshopProcessor extends AudioWorkletProcessor {
			voice = new VoiceWorkshopVoice(sampleRate)
			watching = false
			blocks = 0
			alive = true

			constructor() {
				super()
				this.port.onmessage = ({
					data
				}: MessageEvent<WorkletMessage | { type: "destroy" }>) => {
					switch (data.type) {
						case "settings":
							this.voice.configure(data.settings)
							break
						case "note":
							this.voice.noteOn(
								data.frequency,
								data.velocity,
								data.vowel,
								data.legato
							)
							break
						case "release":
							this.voice.release()
							break
						case "panic":
							this.voice.panic()
							break
						case "watch":
							this.watching = data.on
							break
						case "destroy":
							this.alive = false
							break
					}
				}
			}

			process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
				const out = outputs[0]
				if (!out?.[0]) {
					return this.alive
				}
				this.voice.process(out[0])
				for (let c = 1; c < out.length; c++) {
					out[c].set(out[0])
				}
				if (this.watching && this.voice.sounding && ++this.blocks >= TELEMETRY_BLOCKS) {
					this.blocks = 0
					const t = this.voice.telemetry()
					this.port.postMessage({
						type: "telemetry",
						areas: t.areas,
						lipsIndex: t.lipsIndex,
						nasalPort: t.nasalPort,
						f0: t.f0,
						voicing: t.voicingAmp,
						ps: t.ps
					})
				}
				return this.alive
			}
		}
	)
}