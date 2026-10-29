import { EventEmitter } from "events";
import { UiEvent } from "./protocol";

export class SocketUi extends EventEmitter {
	private socket: WebSocket | null = null;
	private reconnectAttempts: number = 0;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		super();
	}

	connect(): void {
		this.socket = new WebSocket(`ws://${location.hostname}:7000/ws`);

		this.socket.onopen = (event) => {
			console.debug("Socket UI opened");
			this.reconnectAttempts = 0;
			if (this.reconnectTimeout) {
				clearTimeout(this.reconnectTimeout);
				this.reconnectTimeout = null;
			}
			this.emit("request", event);
		};
		this.socket.onclose = () => {
			console.debug("Socket UI closed");
			this.scheduleReconnect();
		};
		this.socket.onerror = () => {};
		this.socket.onmessage = (event) => {
			this.onMessage(event.data);
		};
	}

	send(data: UiEvent) {
		if (this.isConnectedToSocket) {
			this.socket?.send(JSON.stringify(data));
		}
	}

	onMessage(data: string) {
		const event: UiEvent = JSON.parse(data);
		console.debug(event);

		switch (event.type) {
			// Config event
			case "config":
				return this.emit("config", event);

			// Request event
			case "request":
				return this.emit("request", event);

			// Update events
			case "button":
				return this.emit(event.id);
			case "color":
			case "dropdown":
			case "slider":
			case "switch":
				return this.emit(event.id, event.value);
			case "ratio_slider":
				return this.emit(event.id, event.values);
		}
	}

	private scheduleReconnect(): void {
		this.reconnectAttempts++;
		const delayMs = this.reconnectAttempts * 5000; // 5 seconds per attempt
		console.debug(
			`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delayMs}ms`,
		);

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
		}

		this.reconnectTimeout = setTimeout(() => {
			console.debug(
				`Attempting to reconnect (attempt ${this.reconnectAttempts})...`,
			);
			this.connect();
		}, delayMs);
	}

	/* Misc */

	get isConnectedToSocket() {
		return this.socket && this.socket.readyState == WebSocket.OPEN;
	}
}
