import { EventEmitter } from "events";
import {
	UiEvent,
	UiConfigEvent,
	UiUpdateEvent,
	UiRequestEvent,
} from "./uiProtocol";

const UI_URL = `ws://${location.hostname}:7000/ws`;

export class UiSocket extends EventEmitter {
	private socket: WebSocket;
	private reconnectAttempts: number = 0;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		super();
	}

	connect(): void {
		this.socket = new WebSocket(UI_URL);

		this.socket.onopen = () => {
			console.log("Socket UI opened");
			this.reconnectAttempts = 0;
			if (this.reconnectTimeout) {
				clearTimeout(this.reconnectTimeout);
				this.reconnectTimeout = null;
			}
		};
		this.socket.onclose = () => {
			console.log("Socket UI closed");
			this.scheduleReconnect();
		};
		this.socket.onerror = () => {};
		this.socket.onmessage = (event) => {
			this.onMessage(event.data);
		};
	}

	send(data: UiEvent) {
		if (this.isConnectedToSocket) {
			this.socket.send(JSON.stringify(data));
		}
	}

	onMessage(data: string) {
		const event: UiEvent = JSON.parse(data);
		console.log(event);

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
		console.log(
			`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delayMs}ms`,
		);

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
		}

		this.reconnectTimeout = setTimeout(() => {
			console.log(
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
