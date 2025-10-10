import { EventEmitter } from "events";

/* Protocol types */

export enum Request {
	OmniToken = "token",

	SetInput = "set_input",
}

export enum Response {
	OmniConnect = "server_connect",
	OmniDisconnect = "server_disconnect",
	OmniAuthorized = "server_authorized",
	OmniJoin = "server_join",
	OmniLeave = "server_leave",
	OmniError = "server_error",

	Movement = "movement",
}

/* Omni*/

// Sending token
export interface OmniToken {
	token: string;
}

// Upon connecting successfully
export interface OmniConnect {
	type: Response.OmniConnect;
	message: string;
}

// Upon forced disconnect, such as guests being kicked after host disconnects
export interface OmniDisconnect {
	type: Response.OmniDisconnect;
	message: string;
}

// Upon authorizing successfully
export interface OmniAuthorized {
	type: Response.OmniAuthorized;
	message: string;
}

// Upon new application connecting.
export interface OmniJoin {
	type: Response.OmniJoin;
	role: "host" | "client" | "guest";
	user: string;
}

// Upon application disconnecting.
export interface OmniLeave {
	type: Response.OmniLeave;
	role: "host" | "client" | "guest";
	user: string;
}

// Errors including non-json message sent or invalid token.
export interface OmniError {
	type: Response.OmniError;
	message: string;
}

/* Temporary */

type InputTypes = "code" | "blank" | "poll" | "typing" | "joystick" | "drawing";

export interface SetInput {
	user?: string;
	type: Request.SetInput;
	input: InputTypes;
}

export interface Movement {
	user: string;
	type: Response.Movement;
	x: number;
	y: number;
}

/* All requests*/

export type ValidRequests = OmniToken | SetInput;

const HOST_TOKEN = "5067f1bb-7205-40f8-bee1-1347ffa21a26";
const URL = "wss://omni.itn.liu.se/ws/";

export enum ConnectionStatus {
	Disconnected = "Disconnected",
	Connecting = "Connecting",
	Connected = "Connected",
}

export class OmniSocket extends EventEmitter {
	private socket: WebSocket;
	private handlers: { [type in Response]: (data: any) => void };

	constructor() {
		super();

		this.handlers = {
			[Response.OmniConnect]: this.onOmniConnect,
			[Response.OmniDisconnect]: this.onOmniDisconnect,
			[Response.OmniAuthorized]: this.onOmniAuthorized,
			[Response.OmniJoin]: this.onOmniJoin,
			[Response.OmniLeave]: this.onOmniLeave,
			[Response.OmniError]: this.onOmniError,

			[Response.Movement]: this.onMovement,
		};
	}

	connect(): void {
		this.socket = new WebSocket(URL);

		this.socket.onopen = () => {
			console.log("Socket Omni opened");
		};

		this.socket.onclose = () => {
			console.log("Socket Omni closed");
		};

		this.socket.onerror = (event: Event) => {
			console.log("Socket Omni error" + event);
		};

		this.socket.onmessage = (event: MessageEvent) => {
			this.receive(JSON.parse(event.data));
		};
	}

	send(data: object, isOmni = false) {
		if (this.isConnectedToSocket) {
			this.socket.send(JSON.stringify(data));
		} else {
			console.warn("Cannot send. Socket is closed.");
			console.log(data);
		}
	}

	receive(data: any) {
		if (data.type) {
			const handler = this.handlers[data.type as Response];
			if (handler) {
				handler.call(this, data);
				this.emit(data.type, data);
				return;
			}
		}

		console.warn(data);
	}

	/* Response handlers */

	onOmniConnect(data: OmniConnect) {
		console.log("onOmniConnect", data);
		this.send({ token: HOST_TOKEN }, true);
	}

	onOmniDisconnect(data: OmniDisconnect) {
		console.log("onOmniDisconnect", data);
	}

	onOmniAuthorized(data: OmniAuthorized) {
		console.log("onOmniAuthorized", data);
	}

	onOmniJoin(data: OmniJoin) {
		console.log("onOmniJoin", data);
	}

	onOmniLeave(data: OmniLeave) {
		console.log("onOmniLeave", data);
	}

	onOmniError(data: OmniError) {
		console.log("onOmniError", data.message);
	}

	onMovement(data: Movement) {}

	/* Requests */

	sendRequest(data: ValidRequests) {
		this.send(data);
	}

	sendSetInput(input: InputTypes) {
		let data: SetInput = {
			type: Request.SetInput,
			input,
		};
		this.sendRequest(data);
	}

	/* Misc */

	get isConnectedToSocket() {
		return this.socket && this.socket.readyState == WebSocket.OPEN;
	}
}

/*
this.omni = new OmniSocket();
(window as any).omni = this.omni;

this.omni.on("server_connect", (data: OmniConnect) => {});
this.omni.on("server_disconnect", (data: OmniDisconnect) => {});
this.omni.on("server_authorized", (data: OmniAuthorized) => {});
this.omni.on("server_join", (data: OmniJoin) => {
	if (data.role == "guest") {
		const player = new Player(data.user);
		this.playerGroup.add(player);
		this.players.set(data.user, player);

		this.omni.sendSetInput("joystick");
	}
});
this.omni.on("server_leave", (data: OmniLeave) => {
	const player = this.players.get(data.user);
	if (player) {
		this.players.delete(data.user);
		this.playerGroup.remove(player);
	}
});
this.omni.on("server_error", (data: OmniError) => {});
this.omni.on("movement", (data: Movement) => {
	let player = this.players.get(data.user);
	if (player) {
		player.move(data.x, data.y);
	}
});

this.omni.connect();
*/