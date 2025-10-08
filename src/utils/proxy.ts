// Try to start the Python TUIO proxy when running inside Neutralino
import { isNeutralino } from "@/utils/neu";
import { os, events } from "@neutralinojs/lib";

const proxyRelative = "proxy/proxy.py";

const w = window as any;

// Remember across hot reloads
if (!w._proxyStarted) {
	w._proxyStarted = false;
	w._proxyProcess = null;
}

async function startProxy() {
	if (w._proxyStarted) {
		console.log("Python proxy already started; skipping.");
		return;
	}

	try {
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
				// Spawn process (non-blocking)
				const proc = await os.spawnProcess(`${cmd} "${proxyRelative}"`);
				if (proc && proc.id) {
					console.log(`Proxy running`);
					w._proxyStarted = true;
					w._proxyProcess = proc;
					break;
				}
			} catch (e: unknown) {
				const err = e as Error;
				console.warn(`Failed to start with ${cmd}:`, err.message);
			}
		}

		if (!w._proxyStarted) {
			console.warn(
				"Could not start python proxy; ensure Python is installed and proxy/proxy.py exists."
			);
		}
	} catch (err) {
		console.error("Error attempting to start python proxy:", err);
	}
}

if (isNeutralino) {
	startProxy();

	// Optional: handle cleanup on reload (during dev)
	if (import.meta.hot) {
		import.meta.hot.on("vite:beforeUpdate", async () => {
			if (w._proxyProcess) {
				try {
					console.log("Stopping Python proxy before hot reload...");
					await os.execCommand(`taskkill /PID ${w._proxyProcess.id} /F`);
				} catch {
					/* ignore */
				}
				w._proxyProcess = null;
				w._proxyStarted = false;
			}
		});
	}
} else {
	console.error("Not running inside Neutralino; cannot start python proxy");
}
