// Try to start the Python TUIO proxy when running inside Neutralino
import { isNeutralino } from "@/utils/neu";
import { os, events, filesystem } from "@neutralinojs/lib";
import {} from "@neutralinojs/lib";

declare const NL_PATH: string;
const w = window as any;

async function trySpawn(command: string): Promise<any | null> {
	const proc = await os.spawnProcess(command);

	// If Neutralino returns a process object with an ID, consider it "started"
	if (proc && proc.id !== undefined) {
		// Setup the listener in the background for logging/cleanup,
		// but don't 'await' it for the main flow.
		const handler = (evt: any) => {
			if (evt.detail.id !== proc.id) return;
			const { action, data } = evt.detail;

			if (action === "stdErr") {
				console.warn(`[proxy stderr] ${data}`);
			}

			if (action === "exit") {
				console.log(`Proxy process ${proc.id} exited with code ${data}`);
				events.off("spawnedProcess", handler);
			}
		};

		events.on("spawnedProcess", handler);
		return proc; // Resolve immediately so startProxy() can continue
	}

	return null;
}

async function startProxy() {
	const tryCommands = [
		`py "${NL_PATH}/proxy.py"`,
		`python "${NL_PATH}/proxy.py"`,
		`py proxy.py`,
		`python proxy.py`,
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
			return;
		} else {
			console.warn("Command failed:", command);
		}
	}

	console.error("Could not start proxy");
}

async function isPortBusy(port: number): Promise<boolean> {
	try {
		// We use netstat to check if the port is in the "LISTENING" state
		const { stdOut } = await os.execCommand(
			`netstat -ano | findstr :${port} | findstr LISTENING`,
		);
		return stdOut.trim().length > 0;
	} catch {
		return false; // Command fails if no match is found
	}
}

if (isNeutralino) {
	const busy = await isPortBusy(8765);

	if (busy) {
		console.log("Proxy already running on port 8765. Skipping spawn.");
		w._proxyStarted = true;
	} else {
		console.log("Port 8765 is free. Starting proxy...");
		startProxy();
	}
} else {
	console.warn("Not running inside Neutralino; cannot start python proxy");
}
