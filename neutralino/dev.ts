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
		const nativeEnv = { ...process.env };
		if (process.platform === "linux" && nativeEnv.WEBKIT_GST_DISABLE_GL_SINK === undefined) {
			// WebKitGTK's GL video sink can turn decoded frames into noise.
			// Use its software video sink; scene rendering still uses accelerated WebGL.
			// Set this variable to 0 explicitly to opt back into the GL video sink.
			nativeEnv.WEBKIT_GST_DISABLE_GL_SINK = "1";
		}
		const neu = exec("neu run", { env: nativeEnv });
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
