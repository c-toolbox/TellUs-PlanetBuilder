import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PluginOption } from "vite";

const extensionDir = "extensions";
const executablePath = join(extensionDir, "tuio-extension.exe");

export async function buildTuioExtension(
	copyToDist = false,
	outputPath = executablePath,
) {
	const bun = join("node_modules", "bun", "bin", "bun.exe");
	mkdirSync(join(outputPath, ".."), { recursive: true });
	execFileSync(bun, ["build", join(extensionDir, "tuio-extension.ts"), "--compile", "--outfile", outputPath], {
		stdio: "inherit",
	});

	if (copyToDist) {
		mkdirSync(join("dist", extensionDir), { recursive: true });
		copyFileSync(outputPath, join("dist", extensionDir, "tuio-extension.exe"));
	}

	return outputPath;
}

export default function tuioExtension(): PluginOption {
	return {
		name: "tuio-extension",
		apply: "build",
		enforce: "pre",
		async closeBundle() {
			await buildTuioExtension(true);
		},
	};
}