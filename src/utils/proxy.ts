// Try to start the Python TUIO proxy when running inside Neutralino
import { isNeutralino } from "@/utils/neu";
import { os, events, filesystem } from "@neutralinojs/lib";
import {} from "@neutralinojs/lib";

const w = window as any;

// Remember across hot reloads
if (!w._proxyStarted) {
	w._proxyStarted = false;
	w._proxyProcess = null;
}

async function trySpawn(command: string): Promise<any | null> {
	const proc = await os.spawnProcess(command);

	return new Promise((resolve) => {
		const handler = (evt: any) => {
			if (evt.detail.id !== proc.id) return;

			const { action, data } = evt.detail;

			if (action === "stdErr") {
				console.warn(`[proxy stderr] ${data}`);
			}

			if (action === "exit") {
				events.off("spawnedProcess", handler);

				// exit code 0 means success
				if (data === 0) resolve(proc);
				else resolve(null);
			}
		};

		events.on("spawnedProcess", handler);
	});
}

async function startProxy() {
	if (w._proxyStarted) {
		console.log("Python proxy already started; skipping.");
		return;
	}

	const tryCommands = [
		"py proxy.py",
		"python proxy.py",
		"py proxy/proxy.py",
		"python proxy/proxy.py",
		// ".\\.venv\\Scripts\\python.exe proxy/proxy.py",
		// ".\\.venv\\bin/python proxy/proxy.py",
		// ".\\proxy\\.venv\\Scripts\\python.exe proxy/proxy.py",
		// ".\\proxy\\.venv\\bin/python proxy/proxy.py",
	];

	for (const command of tryCommands) {
		console.log("Trying:", command);

		const proc = await trySpawn(command);

		if (proc) {
			console.log("Proxy started using", command);
			w._proxyStarted = true;
			w._proxyProcess = proc;
			return;
		}

		console.warn("Command failed:", command);
	}

	console.error("Could not start proxy");
}

async function freePort(port: number) {
	try {
		await os.execCommand(
			`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F`,
		);
		console.log(`Freed port ${port}`);
	} catch {
		// ignore if nothing found
	}
}

if (isNeutralino) {
	await freePort(8765);
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
	console.warn("Not running inside Neutralino; cannot start python proxy");
}
