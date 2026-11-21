/**
 * Bundles worklet/processor.ts with Voice Workshop's engine into
 * voice-workshop.worklet.js, one ES module with no imports, so any bundler
 * can serve it as a plain asset. Voice Workshop is fetched at the pinned
 * commit into .upstream/ (ignored by git).
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const { voiceWorkshop } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const upstream = join(root, ".upstream")
const git = (...args) => execFileSync("git", args, { cwd: upstream, stdio: "inherit" })

if (!existsSync(join(upstream, ".git"))) {
	execFileSync("git", ["init", "--quiet", upstream], { stdio: "inherit" })
	git("remote", "add", "origin", voiceWorkshop.repository)
}
const head = existsSync(join(upstream, "src"))
	? execFileSync("git", ["rev-parse", "HEAD"], { cwd: upstream }).toString().trim()
	: ""
if (head !== voiceWorkshop.commit) {
	git("fetch", "--quiet", "--depth", "1", "origin", voiceWorkshop.commit)
	git("checkout", "--quiet", "--force", voiceWorkshop.commit)
}

await build({
	entryPoints: [join(root, "worklet/processor.ts")],
	outfile: join(root, "voice-workshop.worklet.js"),
	bundle: true,
	format: "esm",
	target: "es2022",
	minify: true,
	legalComments: "none",
	banner: {
		js: `/*! Voice Workshop (${voiceWorkshop.repository}, ${voiceWorkshop.commit.slice(0, 7)}) Copyright 2026 Fabio Angela, Apache-2.0: see LICENSE-voice-workshop and NOTICE-voice-workshop. Built by scripts/build-worklet.mjs; do not edit. */`
	}
})
console.log("Built voice-workshop.worklet.js")