import { exec, execFileSync, execSync } from "node:child_process";
import { createServer } from "vite";
import writeNeuConfig from "./write-neu-config";

writeNeuConfig();

if (process.argv.includes("--setup")) {
	execSync("neu update", { stdio: "inherit" });
} else {
	const native = process.argv.includes("--native");
	if (native) process.env.NEUTRALINO_DEV = "1";

	const vite = await createServer();
	await vite.listen();
	vite.printUrls();

	if (native) {
		const neu = exec("neu run --disable-auto-reload -- --window-enable-inspector=true");
		neu.stdout?.pipe(process.stdout);
		neu.stderr?.pipe(process.stderr);

		let stopping = false;
		async function stop(exitCode = 0) {
			if (stopping) return;
			stopping = true;

			if (neu.pid && process.platform === "win32") {
				try {
					execFileSync("taskkill", ["/PID", String(neu.pid), "/T", "/F"], {
						stdio: "ignore",
					});
				} catch {}
			} else {
				neu.kill();
			}

			await vite.close();
			process.exit(exitCode);
		}

		neu.on("close", (code) => void stop(code ?? 0));
		process.on("SIGINT", () => void stop());
		process.on("SIGTERM", () => void stop());
	}
}
