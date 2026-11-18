import { EventEmitter } from "events";
import {
	OMNI_URL, OmniEvent, Response, isOmniResponse, parseOmniMessage,
	type OmniSocketEvents, type OmniToken, type OmniUser,
} from "./omniProtocol";

export * from "./omniProtocol";

/** Shared Omni connection. Scenes interpret and own all application messages and state. */
export class OmniSocket extends EventEmitter<OmniSocketEvents> {
	private socket: WebSocket | null = null;
	private readonly registeredUsers = new Map<string, OmniUser>();
	private authorized = false;

	constructor(
		private readonly hostToken = import.meta.env?.VITE_OMNI_TOKEN?.trim() ?? "",
		private readonly url = OMNI_URL,
	) {
		super();
	}

	get users(): ReadonlyMap<string, OmniUser> { return this.registeredUsers; }
	get isAuthorized(): boolean { return this.authorized; }
	get isConnectedToSocket(): boolean { return this.socket?.readyState === WebSocket.OPEN; }

	connect(): void {
		if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return;
		if (!this.hostToken) {
			console.warn("OmniSocket disabled: set VITE_OMNI_TOKEN in .env.local and restart the app.");
			return;
		}

		console.debug("Omni connecting:", this.url);
		const socket = new WebSocket(this.url);
		this.socket = socket;
		socket.onopen = () => console.debug("Omni socket opened.");
		socket.onclose = () => {
			console.debug("Omni socket closed.");
			if (this.socket !== socket) return;
			this.socket = null;
			this.clearSession();
		};
		socket.onerror = () => console.warn("Omni WebSocket connection failed.");
		socket.onmessage = (event: MessageEvent) => {
			if (this.socket !== socket || typeof event.data !== "string") return;
			let data: unknown;
			try { data = JSON.parse(event.data); }
			catch { console.warn("Ignoring invalid Omni JSON."); return; }
			this.receive(data);
		};
	}

	disconnect(): void {
		const socket = this.socket;
		this.socket = null;
		if (socket) console.debug("Omni disconnecting.");
		socket?.close();
		this.clearSession();
	}

	/** Scenes may send any JSON object, including Omni's optional target user ID. */
	send(data: object): void {
		if (this.isConnectedToSocket) this.socket!.send(JSON.stringify(data));
		else console.warn("Cannot send. Omni socket is closed.");
	}

	/** Non-Omni payloads are forwarded unchanged for the active scene to validate. */
	receive(input: unknown): boolean {
		if (!isOmniResponse(input)) {
			this.emit(OmniEvent.Message, input);
			return true;
		}
		const data = parseOmniMessage(input);
		if (!data) return false;

		switch (data.type) {
			case Response.OmniConnect: {
				console.debug("Omni server connected:", data.message);
				const credentials: OmniToken = { token: this.hostToken };
				this.send(credentials);
				this.emit(data.type, data);
				break;
			}
			case Response.OmniAuthorized:
				console.debug("Omni authorized:", data.message);
				this.authorized = true;
				this.emit(data.type, data);
				break;
			case Response.OmniDisconnect:
				console.debug("Omni server disconnected:", data.message);
				this.disconnect();
				this.emit(data.type, data);
				break;
			case Response.OmniCode:
				console.debug("Omni session code:", data.code);
				this.emit(data.type, data);
				break;
			case Response.OmniJoin: {
				console.debug("Omni user joined:", { user: data.user, role: data.role, name: data.name });
				if (data.role !== "host" && !this.registeredUsers.has(data.user)) {
					const user: OmniUser = Object.freeze({
						id: data.user, role: data.role, name: data.name ?? "Unnamed participant",
					});
					this.registeredUsers.set(user.id, user);
					this.emit(OmniEvent.UserJoined, user);
				}
				this.emit(data.type, data);
				break;
			}
			case Response.OmniLeave: {
				const user = this.registeredUsers.get(data.user);
				console.debug("Omni user left:", { user: data.user, role: data.role, name: user?.name });
				if (user) {
					this.registeredUsers.delete(user.id);
					this.emit(OmniEvent.UserLeft, user);
				}
				this.emit(data.type, data);
				break;
			}
			case Response.OmniError:
				console.warn("Omni:", data.message);
				this.emit(data.type, data);
				break;
		}
		return true;
	}

	private clearSession(): void {
		this.authorized = false;
		const users = [...this.registeredUsers.values()];
		this.registeredUsers.clear();
		if (users.length) console.debug("Omni session cleared:", { users: users.length });
		for (const user of users) this.emit(OmniEvent.UserLeft, user);
	}
}
