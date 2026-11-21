import {
	PITCH_CLASS_VOWELS,
	SETTING_RANGES,
	SOURCE_MODELS,
	VOICES,
	VOWELS,
	VOWEL_MODES,
	VOWEL_SEQUENCE,
	type NumericSetting,
	type Settings,
	type VoiceTelemetry
} from "./settings.ts"
import { EVENT_CONFIGURATION_CHANGED } from "./output-voice-workshop.ts"

const EVENT_INPUT = "input"
const EVENT_CHANGE = "change"
const EVENT_KEYDOWN = "keydown"
const EVENT_POINTER_DOWN = "pointerdown"
const EVENT_POINTER_MOVE = "pointermove"
const EVENT_POINTER_UP = "pointerup"

interface VoiceWorkshopControls extends EventTarget {
	readonly options: Settings
	configure(patch: Partial<Settings>): void
	watch(listener: (telemetry: VoiceTelemetry) => void): () => void
}

const SECTIONS: { title: string; controls: NumericSetting[] }[] = [
	{ title: "Folds", controls: ["breathiness", "effort"] },
	{ title: "Tract", controls: ["nasal", "size", "larynx"] },
	{
		title: "Performance",
		controls: ["glide", "attack", "release", "vibratoDepth", "vibratoRate", "transpose"]
	},
	{ title: "Output", controls: ["volume"] }
]

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
const noteName = (frequency: number) => {
	const n = Math.round(69 + 12 * Math.log2(frequency / 440))
	return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

const format = (id: NumericSetting, value: number): string => {
	const range = SETTING_RANGES[id]
	const unit = "unit" in range ? range.unit : ""
	if (unit === "×") {
		return `${value.toFixed(2)}×`
	}
	if (id === "nasal") {
		return `${Math.round(value * 100)}%`
	}
	const digits = range.step < 1 ? (range.step < 0.1 ? 2 : 1) : 0
	const sign = (id === "transpose" || id === "larynx" || id === "volume") && value > 0 ? "+" : ""
	return `${sign}${value.toFixed(digits)} ${unit}`.trim()
}

const STYLE = `
	:host { display:block; container-type:inline-size; width:100%; color-scheme:dark;
		--ink:#1d1620; --panel:#2a2030; --raised:#352a3c; --line:#4b3d52; --text:#f4e9e1; --muted:#b9a7b3;
		--flesh:#f08a7e; --flesh-deep:#c7584f; --air:#8fd3c7; font:12px/1.35 system-ui,sans-serif; color:var(--text); }
	* { box-sizing:border-box; }
	.panel { background:linear-gradient(160deg,var(--panel),var(--ink)); border:1px solid var(--line); border-radius:12px;
		padding:14px; display:grid; gap:12px; box-shadow:0 4px 14px #0006; }
	header { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap;
		border-bottom:2px solid var(--flesh-deep); padding-bottom:8px; }
	h2 { margin:0; font-size:20px; letter-spacing:-.02em; font-weight:700; }
	h2 span { color:var(--flesh); font-weight:400; }
	.readout { font:12px ui-monospace,monospace; font-variant-numeric:tabular-nums; color:var(--air); min-width:9ch; text-align:right; }
	.stage { display:grid; grid-template-columns:1fr 1.3fr; gap:10px; }
	figure { margin:0; background:var(--ink); border:1px solid var(--line); border-radius:8px; padding:6px; position:relative; }
	figcaption { position:absolute; top:6px; left:9px; font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); pointer-events:none; }
	canvas { display:block; width:100%; height:150px; }
	.pad { cursor:crosshair; touch-action:none; border-radius:6px; }
	.pad:focus-visible, select:focus-visible, input:focus-visible, button:focus-visible { outline:2px solid var(--flesh); outline-offset:2px; }
	.pad[aria-disabled=true] { cursor:default; }
	.row { display:flex; flex-wrap:wrap; gap:10px 14px; align-items:end; }
	.field { display:grid; gap:4px; }
	.caption { font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
	select { background:var(--raised); color:var(--text); border:1px solid var(--line); border-radius:6px; padding:5px 8px; font:inherit; min-width:9rem; }
	.segmented { display:inline-flex; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
	.segmented button { background:var(--raised); color:var(--muted); border:0; padding:5px 9px; font:inherit; cursor:pointer; }
	.segmented button + button { border-left:1px solid var(--line); }
	.segmented button[aria-pressed=true] { background:var(--flesh-deep); color:var(--text); }
	.toggle { display:inline-flex; align-items:center; gap:6px; cursor:pointer; padding:5px 0; }
	.toggle input { accent-color:var(--flesh); margin:0; }
	details { border-top:1px solid var(--line); padding-top:8px; }
	summary { cursor:pointer; font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
	.sliders { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px 16px; margin-top:10px; }
	.slider { display:grid; grid-template-columns:1fr auto; gap:2px 8px; align-items:center; }
	.slider input { grid-column:1 / -1; width:100%; accent-color:var(--flesh); margin:0; }
	output { font:11px ui-monospace,monospace; font-variant-numeric:tabular-nums; color:var(--text); }
	footer { font-size:10px; color:var(--muted); border-top:1px solid var(--line); padding-top:8px; }
	footer a { color:inherit; text-underline-offset:3px; }
	@container (max-width:460px) { .stage { grid-template-columns:1fr; } }
`

export function createVoiceWorkshopGui(device: VoiceWorkshopControls): {
	element: HTMLElement
	destroy(): void
} {
	const signal = new AbortController()
	const on = (target: EventTarget, type: string, listener: (event: any) => void) =>
		target.addEventListener(type, listener, { signal: signal.signal })

	const host = document.createElement("div")
	host.className = "nodrag nopan nowheel"
	const root = host.attachShadow({ mode: "open" })
	const style = document.createElement("style")
	style.textContent = STYLE
	const panel = document.createElement("div")
	panel.className = "panel"
	panel.setAttribute("role", "group")
	panel.setAttribute("aria-label", "Voice Workshop voice")
	panel.innerHTML = `
		<header><h2>Voice Workshop <span>physical voice</span></h2><output class="readout" aria-live="off">—</output></header>
		<div class="stage">
			<figure><figcaption>Vowel</figcaption><canvas class="pad" tabindex="0" role="slider" aria-label="Vowel: front to back, close to open"></canvas></figure>
			<figure><figcaption>Vocal tract · glottis → lips</figcaption><canvas class="tract" role="img" aria-label="Shape of the vocal tract"></canvas></figure>
		</div>
		<div class="row"></div>
		<footer>One note at a time; overlapping notes glide. Engine: <a href="https://github.com/MithrilMan/voice-workshop" target="_blank" rel="noopener noreferrer">Voice Workshop</a> by Fabio Angela · Apache-2.0</footer>
	`
	root.append(style, panel)
	const readout = panel.querySelector<HTMLOutputElement>(".readout")!
	const pad = panel.querySelector<HTMLCanvasElement>(".pad")!
	const tract = panel.querySelector<HTMLCanvasElement>(".tract")!
	const row = panel.querySelector<HTMLElement>(".row")!
	const footer = panel.querySelector("footer")!
	const updates: Array<() => void> = []

	// voice, vowel source, folds and whisper
	const select = (
		name: keyof Settings,
		label: string,
		items: readonly { id: string; name: string }[]
	) => {
		const field = document.createElement("label")
		field.className = "field"
		field.innerHTML = `<span class="caption">${label}</span>`
		const input = document.createElement("select")
		input.name = name
		for (const { id, name: text } of items) {
			const option = document.createElement("option")
			option.value = id
			option.textContent = text
			input.append(option)
		}
		on(input, EVENT_CHANGE, () => device.configure({ [name]: input.value }))
		updates.push(() => (input.value = String(device.options[name])))
		field.append(input)
		row.append(field)
	}
	const segmented = (
		name: keyof Settings,
		label: string,
		items: readonly { id: string; name: string }[]
	) => {
		const field = document.createElement("div")
		field.className = "field"
		field.innerHTML = `<span class="caption">${label}</span>`
		const group = document.createElement("div")
		group.className = "segmented"
		group.setAttribute("role", "group")
		group.setAttribute("aria-label", label)
		for (const { id, name: text } of items) {
			const button = document.createElement("button")
			button.type = "button"
			button.textContent = text
			button.name = name
			button.value = id
			on(button, "click", () => device.configure({ [name]: id }))
			updates.push(() =>
				button.setAttribute("aria-pressed", String(device.options[name] === id))
			)
			group.append(button)
		}
		field.append(group)
		row.append(field)
	}
	select("voice", "Voice", VOICES)
	segmented("vowelMode", "Vowel from", VOWEL_MODES)
	segmented("model", "Folds", SOURCE_MODELS)
	const whisper = document.createElement("label")
	whisper.className = "toggle"
	whisper.innerHTML = `<input type="checkbox" name="whisper"><span>Whisper</span>`
	const whisperInput = whisper.querySelector("input")!
	on(whisperInput, EVENT_CHANGE, () => device.configure({ whisper: whisperInput.checked }))
	updates.push(() => (whisperInput.checked = device.options.whisper))
	row.append(whisper)

	// sliders, by section
	for (const { title, controls } of SECTIONS) {
		const details = document.createElement("details")
		details.open = title !== "Output"
		details.innerHTML = `<summary>${title}</summary>`
		const grid = document.createElement("div")
		grid.className = "sliders"
		for (const id of controls) {
			const range = SETTING_RANGES[id]
			const label = document.createElement("label")
			label.className = "slider"
			const caption = document.createElement("span")
			caption.className = "caption"
			caption.textContent = range.label
			const value = document.createElement("output")
			const input = document.createElement("input")
			input.type = "range"
			input.name = id
			input.min = String(range.min)
			input.max = String(range.max)
			input.step = String(range.step)
			on(input, EVENT_INPUT, () => device.configure({ [id]: Number(input.value) }))
			updates.push(() => {
				const current = device.options[id] as number
				input.value = String(current)
				value.value = format(id, current)
				input.setAttribute("aria-valuetext", value.value)
			})
			label.append(caption, value, input)
			grid.append(label)
		}
		details.append(grid)
		footer.before(details)
	}

	// the vowel pad, drawn as the IPA vowel chart: its front edge slants
	const PAD_MARGIN = 18
	const geometry = () => {
		const w = pad.clientWidth || 200
		const h = pad.clientHeight || 150
		const top = PAD_MARGIN + 6
		const bottom = h - PAD_MARGIN
		const right = w - PAD_MARGIN
		const left = (y: number) => PAD_MARGIN + y * (w - 2 * PAD_MARGIN) * 0.38
		return { w, h, top, bottom, right, left }
	}
	const toPad = (x: number, y: number) => {
		const g = geometry()
		const l = g.left(y)
		return [l + x * (g.right - l), g.top + y * (g.bottom - g.top)]
	}
	const fromPad = (px: number, py: number) => {
		const g = geometry()
		const y = Math.min(1, Math.max(0, (py - g.top) / (g.bottom - g.top)))
		const l = g.left(y)
		return { vowelX: Math.min(1, Math.max(0, (px - l) / (g.right - l))), vowelY: y }
	}
	const fit = (canvas: HTMLCanvasElement) => {
		const ratio = globalThis.devicePixelRatio || 1
		const w = Math.round((canvas.clientWidth || 200) * ratio)
		const h = Math.round((canvas.clientHeight || 150) * ratio)
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w
			canvas.height = h
		}
		const ctx = canvas.getContext("2d")
		ctx?.setTransform(ratio, 0, 0, ratio, 0, 0)
		return ctx
	}
	const drawPad = () => {
		const ctx = fit(pad)
		if (!ctx) {
			return
		}
		const g = geometry()
		const { vowelMode, vowelX, vowelY } = device.options
		const live = vowelMode === "pad"
		ctx.clearRect(0, 0, g.w, g.h)
		ctx.strokeStyle = "#4b3d52"
		ctx.lineWidth = 1
		ctx.beginPath()
		for (const [x, y] of [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
			[0, 0]
		]) {
			const [px, py] = toPad(x, y)
			ctx.lineTo(px, py)
		}
		ctx.stroke()
		const used = new Set(
			vowelMode === "cycle" ? VOWEL_SEQUENCE : vowelMode === "pitch" ? PITCH_CLASS_VOWELS : []
		)
		ctx.font = "15px system-ui,sans-serif"
		ctx.textAlign = "center"
		ctx.textBaseline = "middle"
		for (const vowel of VOWELS) {
			const [px, py] = toPad(vowel.x, vowel.y)
			ctx.fillStyle = live ? "#b9a7b3" : used.has(vowel.ipa) ? "#8fd3c7" : "#5d4e63"
			ctx.fillText(vowel.ipa, px, py)
		}
		const [px, py] = toPad(vowelX, vowelY)
		ctx.globalAlpha = live ? 1 : 0.35
		ctx.fillStyle = "#f08a7e"
		ctx.beginPath()
		ctx.arc(px, py, 7, 0, Math.PI * 2)
		ctx.fill()
		ctx.strokeStyle = "#f4e9e1"
		ctx.lineWidth = 1.5
		ctx.stroke()
		ctx.globalAlpha = 1
		if (!live) {
			ctx.fillStyle = "#b9a7b3"
			ctx.font = "10px system-ui,sans-serif"
			ctx.fillText(
				vowelMode === "cycle"
					? "each note: next of a e i o u"
					: "each pitch class has its vowel",
				g.w / 2,
				g.h - 7
			)
		}
		pad.setAttribute("aria-disabled", String(!live))
		pad.setAttribute(
			"aria-valuetext",
			`${Math.round(vowelX * 100)}% back, ${Math.round(vowelY * 100)}% open`
		)
	}
	let dragging = false
	const move = (event: PointerEvent) => {
		if (device.options.vowelMode !== "pad") {
			return
		}
		const box = pad.getBoundingClientRect()
		device.configure(fromPad(event.clientX - box.left, event.clientY - box.top))
	}
	on(pad, EVENT_POINTER_DOWN, (event: PointerEvent) => {
		dragging = true
		pad.setPointerCapture?.(event.pointerId)
		move(event)
	})
	on(pad, EVENT_POINTER_MOVE, (event: PointerEvent) => dragging && move(event))
	on(pad, EVENT_POINTER_UP, () => (dragging = false))
	on(pad, EVENT_KEYDOWN, (event: KeyboardEvent) => {
		const step = event.shiftKey ? 0.1 : 0.02
		const delta = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		}[event.key]
		if (!delta || device.options.vowelMode !== "pad") {
			return
		}
		event.preventDefault()
		const { vowelX, vowelY } = device.options
		device.configure({ vowelX: vowelX + delta[0], vowelY: vowelY + delta[1] })
	})

	// the tract: the area of each section as the width of a tube, glottis on the left
	let lastTelemetry: VoiceTelemetry | undefined
	const drawTract = () => {
		const ctx = fit(tract)
		if (!ctx) {
			return
		}
		const w = tract.clientWidth || 260
		const h = tract.clientHeight || 150
		const mid = h / 2 + 6
		ctx.clearRect(0, 0, w, h)
		ctx.strokeStyle = "#4b3d52"
		ctx.setLineDash([3, 4])
		ctx.beginPath()
		ctx.moveTo(10, mid)
		ctx.lineTo(w - 10, mid)
		ctx.stroke()
		ctx.setLineDash([])
		const t = lastTelemetry
		if (!t?.areas.length) {
			ctx.fillStyle = "#5d4e63"
			ctx.textAlign = "center"
			ctx.fillText("play a note to see the tract", w / 2, mid - 14)
			return
		}
		const sections = Math.min(t.areas.length, t.lipsIndex + 1 || t.areas.length)
		const scale = (h / 2 - 14) / Math.sqrt(8)
		const xAt = (i: number) => 10 + (i / Math.max(1, sections - 1)) * (w - 20)
		// radius of a circle of that area, so the drawing reads as a tube
		const half = (i: number) => Math.min(h / 2 - 12, Math.sqrt(Math.max(0, t.areas[i])) * scale)
		const gradient = ctx.createLinearGradient(0, 0, w, 0)
		gradient.addColorStop(0, "#c7584f")
		gradient.addColorStop(1, "#f08a7e")
		ctx.fillStyle = gradient
		ctx.beginPath()
		for (let i = 0; i < sections; i++) {
			ctx.lineTo(xAt(i), mid - half(i))
		}
		for (let i = sections - 1; i >= 0; i--) {
			ctx.lineTo(xAt(i), mid + half(i))
		}
		ctx.closePath()
		ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, t.voicing * 4 + 0.2)
		ctx.fill()
		ctx.globalAlpha = 1
		if (t.nasalPort > 0.01) {
			ctx.strokeStyle = "#8fd3c7"
			ctx.lineWidth = 1 + Math.min(6, t.nasalPort * 3)
			const x = xAt(Math.round(sections * 0.55))
			ctx.beginPath()
			ctx.moveTo(x, mid - half(Math.round(sections * 0.55)))
			ctx.lineTo(x, 16)
			ctx.stroke()
			ctx.lineWidth = 1
		}
	}
	const unwatch = device.watch((telemetry) => {
		lastTelemetry = telemetry
		readout.value =
			telemetry.f0 > 20 ? `${noteName(telemetry.f0)} ${telemetry.f0.toFixed(0)} Hz` : "—"
		drawTract()
	})

	const update = () => {
		for (const apply of updates) {
			apply()
		}
		drawPad()
	}
	on(device, EVENT_CONFIGURATION_CHANGED, update)
	const resize =
		typeof ResizeObserver === "undefined"
			? undefined
			: new ResizeObserver(() => {
					drawPad()
					drawTract()
				})
	resize?.observe(panel)
	update()
	drawTract()

	return {
		element: host,
		destroy() {
			signal.abort()
			unwatch()
			resize?.disconnect()
			host.remove()
		}
	}
}