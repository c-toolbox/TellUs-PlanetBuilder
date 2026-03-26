// Try to start the Python TUIO proxy when running inside Neutralino
import { isNeutralino } from "@/utils/neu";
import { app, os, events } from "@neutralinojs/lib";

declare const NL_PATH: string;
const w = window as any;

let proxyProcessId: number | null = null;

async function trySpawn(command: string): Promise<any | null> {
	const proc = await os.spawnProcess(command);

	// If Neutralino returns a process object with an ID, consider it "started"
	if (proc && proc.id !== undefined) {
		proxyProcessId = proc.id;
		// Setup the listener in the background for logging/cleanup,
		// but don't 'await' it for the main flow.
		const handler = (evt: any) => {
			if (evt.detail.id !== proc.id) return;
			const { action, data } = evt.detail;

			if (action === "stdErr") {
				console.warn(`[proxy stderr] ${data}`);
			}

			if (action === "exit") {
				console.debug(`Proxy process ${proc.id} exited with code ${data}`);
				events.off("spawnedProcess", handler);
			}
		};

		events.on("spawnedProcess", handler);
		return proc;
	}

	return null;
}

async function isProxyRunning(): Promise<boolean> {
	try {
		const ws = new WebSocket("ws://localhost:8765");
		return await new Promise((resolve) => {
			ws.onopen = () => {
				ws.close();
				resolve(true);
			};
			ws.onerror = () => resolve(false);
		});
	} catch {
		return false;
	}
}

async function startProxy() {
	if (await isProxyRunning()) {
		console.debug("Proxy already running, skipping spawn");
		return;
	}

	const tryCommands = [
		`py "${NL_PATH}/proxy.py"`,
		`python "${NL_PATH}/proxy.py"`,
		`py proxy.py"`,
		`python proxy.py"`,
	];

	for (const command of tryCommands) {
		console.debug("Trying:", command);

		const proc = await trySpawn(command);

		if (proc) {
			console.debug("Proxy started using", command);
			return;
		} else {
			console.warn("Command failed:", command);
		}
	}

	console.error("Could not start proxy");
}

events.on("windowClose", async () => {
	console.debug("App closing...");

	if (proxyProcessId !== null) {
		try {
			await os.updateSpawnedProcess(proxyProcessId, "exit");
			console.debug("Proxy process terminated");
		} catch (err) {
			console.warn("Failed to terminate proxy:", err);
		}
	}

	app.exit();
});

if (isNeutralino) {
	startProxy();
} else {
	console.warn("Not running inside Neutralino; cannot start python proxy");
}
