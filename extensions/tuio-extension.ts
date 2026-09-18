import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import osc from "osc";

const TUIO_PORT = 3333;
const TUIO_EVENT = "tuioMessage";
const SHUTDOWN_EVENT = "tuioShutdown";
const BIND_RETRY_DELAY_MS = 250;

type NeutralinoConnection = {
	nlPort: string;
	nlToken: string;
	nlConnectToken: string;
	nlExtensionId: string;
};

const connection = JSON.parse(
	readFileSync(process.stdin.fd, "utf8"),
) as NeutralinoConnection;

const client = new WebSocket(
	`ws://localhost:${connection.nlPort}?extensionId=${connection.nlExtensionId}&connectToken=${connection.nlConnectToken}`,
);

let shuttingDown = false;
let bindRetry: ReturnType<typeof setTimeout> | null = null;

function broadcast(event: string, data: unknown) {
	if (client.readyState !== WebSocket.OPEN) return;

	client.send(
		JSON.stringify({
			id: randomUUID(),
			method: "app.broadcast",
			accessToken: connection.nlToken,
			data: { event, data },
		}),
	);
}

function shutdown(exitCode = 0) {
	if (shuttingDown) return;
	shuttingDown = true;
	if (bindRetry !== null) clearTimeout(bindRetry);
	process.exit(exitCode);
}

function openUdpPort() {
	if (shuttingDown) return;

	const udpPort = new osc.UDPPort({
		localAddress: "0.0.0.0",
		localPort: TUIO_PORT,
		metadata: false,
	});

	udpPort.on("message", (message) => {
		if (message.address !== "/tuio/2Dcur") return;
		broadcast(TUIO_EVENT, message);
	});

	udpPort.on("ready", () => {
		console.log(`Listening for TUIO on UDP port ${TUIO_PORT}`);
	});

	udpPort.on("error", (error) => {
		if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
			console.error(`TUIO UDP error: ${error.message}`);
			shutdown(1);
			return;
		}

		console.warn(`UDP port ${TUIO_PORT} is busy; retrying`);
		bindRetry = setTimeout(() => {
			bindRetry = null;
			openUdpPort();
		}, BIND_RETRY_DELAY_MS);
	});

	udpPort.open();
}

client.on("open", openUdpPort);
client.on("message", (data) => {
	const message = JSON.parse(data.toString()) as { event?: string };
	if (message.event === SHUTDOWN_EVENT) shutdown();
});
client.on("close", shutdown);
client.on("error", (error) => {
	console.error(`Neutralino extension connection error: ${error.message}`);
	shutdown();
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
