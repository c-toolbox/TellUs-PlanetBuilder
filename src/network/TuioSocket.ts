import { EventEmitter } from "events";
import {
	TuioEvent,
	TuioAddEvent,
	TuioRemoveEvent,
	TuioUpdateEvent,
} from "./tuioProtocol";

const TUIO_URL = "ws://localhost:8765";

export class TuioSocket extends EventEmitter {
	private socket: WebSocket;

	constructor() {
		super();

		this.socket = new WebSocket(TUIO_URL);

		this.socket.onopen = (event) => {
			console.log("Socket Tuio opened");
		};
		this.socket.onclose = (event) => {
			console.log("Socket Tuio closed");
		};
		this.socket.onerror = (event) => {};
		this.socket.onmessage = (event) => {
			this.onMessage(event.data);
		};
	}

	onMessage(data: string) {
		data = data.replaceAll("Infinity", "0");
		data = data.replaceAll("NaN", "0");
		const touch: TuioEvent = JSON.parse(data);

		if (touch.event == "add") this.onAdd(touch);
		else if (touch.event == "remove") this.onRemove(touch);
		else if (touch.event == "update") this.onUpdate(touch);
	}

	onAdd(touch: TuioAddEvent) {
		this.emit("touchAdd", touch.id);
	}

	onRemove(touch: TuioRemoveEvent) {
		this.emit("touchRemove", touch.id);
	}

	onUpdate(touch: TuioUpdateEvent) {
		// Convert Tellus weird coordinate system
		const pitch = (touch.y - 0.5) * Math.PI;
		const yaw = (1.5 - touch.x) * 2 * Math.PI;

		this.emit("touchUpdate", touch.id, pitch, yaw);
	}
}
