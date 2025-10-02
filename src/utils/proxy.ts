// Try to start the Python TUIO proxy when running inside Neutralino
import { isNeutralino } from "@/utils/neu";
import { os } from "@neutralinojs/lib";

if (isNeutralino) {
	const proxyRelative = "proxy/proxy.py";

	async function startProxy() {
		try {
			// Try python executables in common virtualenv locations first (repo .venv and proxy/.venv),
			// then fall back to system-wide python or py launcher.
			const tryCommands = [
				".\\.venv\\Scripts\\python.exe",
				".\\.venv\\bin/python",
				".\\proxy\\.venv\\Scripts\\python.exe",
				".\\proxy\\.venv\\bin/python",
				"python",
				"py",
			];
			for (const cmd of tryCommands) {
				try {
					const result = await os.execCommand(`${cmd} "${proxyRelative}"`);
					// Neutralino's execCommand resolves with an object even when the command returns a non-zero exit code.
					if (result && typeof result.exitCode === "number") {
						if (result.exitCode === 0) {
							console.log("Started python proxy with", cmd, result);
							return;
						} else {
							if (result.stdErr) console.error("stderr:", result.stdErr);
							if (result.stdOut) console.error("stdout:", result.stdOut);
							// try next command
						}
					} else {
						// Unexpected shape; treat as failure and continue
						console.warn("execCommand returned unexpected result:", result);
					}
				} catch (e) {
					// try next command
				}
			}
			console.warn(
				"Could not start python proxy; ensure Python is installed and on PATH, and proxy/proxy.py exists relative to the app working directory."
			);
		} catch (err) {
			console.error("Error attempting to start python proxy:", err);
		}
	}

	startProxy();
} else {
	console.error("Not running inside Neutralino; cannot start python proxy");
}
