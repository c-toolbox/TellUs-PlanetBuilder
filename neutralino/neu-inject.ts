import { readFileSync } from "node:fs";
import type { PluginOption } from "vite";

export default function neuInject(): PluginOption {
	let development = false;
	return {
		name: "neutralino-globals",
		configResolved: (config) => { development = config.command === "serve"; },
		transformIndexHtml() {
			let source = "__neutralino_globals.js";
			if (development && process.env.NEUTRALINO_DEV === "1") {
				try {
					const auth = JSON.parse(readFileSync(".tmp/auth_info.json", "utf8"));
					if (auth.nlPort) source = "http://localhost:" + auth.nlPort + "/" + source;
				} catch {
					// A browser preview has no running Neutralino process.
				}
			}
			return [{ tag: "script", injectTo: "head-prepend", attrs: { src: source } }];
		},
	};
}
