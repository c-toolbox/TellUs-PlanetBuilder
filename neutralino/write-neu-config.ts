import { mkdirSync, writeFileSync } from "node:fs";
import { appMetadata, neutralino } from "./app-config";
import template from "./neu-template.json";

export function createNeuConfig(isProduction = false, metadata = appMetadata) {
	// Clone the template so repeated development/build calls cannot leak settings.
	const config = structuredClone(template);
	config.applicationId = metadata.applicationId;
	config.version = metadata.version;
	config.cli.binaryName = metadata.binaryName;
	config.nativeAllowList = [...new Set([...config.nativeAllowList, ...neutralino.allow])];
	config.modes.window = { ...config.modes.window, ...neutralino.window, title: metadata.title };

	if (isProduction) {
		config.documentRoot = "/web/";
		config.cli.resourcesPath = "/";
		config.modes.window.icon = "/web/icon.png";
	} else {
		config.tokenSecurity = "none";
		config.modes.window.icon = "/icon.png";
		config.extensions[0].commandWindows =
			'"${NL_PATH}\\node_modules\\bun\\bin\\bun.exe" "${NL_PATH}\\extensions\\tuio-extension.ts"';
	}
	return config;
}

export default function writeNeuConfig(isProduction = false) {
	if (isProduction) mkdirSync("dist", { recursive: true });
	writeFileSync(
		isProduction ? "dist/neutralino.config.json" : "neutralino.config.json",
		JSON.stringify(createNeuConfig(isProduction), null, 2) + "\n",
	);
	// Vite serves this placeholder in a browser; Neutralino serves its real globals.
	writeFileSync("src/public/__neutralino_globals.js", "// Browser preview\n");
}
