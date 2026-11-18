/** Omni's authentication and session protocol. Application payloads belong to each scene. */
export const OMNI_URL = "wss://omni.itn.liu.se/ws/";
export type OmniRole = "host" | "client" | "guest";

export enum Response {
	OmniConnect = "server_connect",
	OmniDisconnect = "server_disconnect",
	OmniAuthorized = "server_authorized",
	OmniCode = "server_code",
	OmniJoin = "server_join",
	OmniLeave = "server_leave",
	OmniError = "server_error",
}

export interface OmniToken { token: string; name?: string; }
export interface OmniConnect { type: Response.OmniConnect; message: string; }
export interface OmniDisconnect { type: Response.OmniDisconnect; message: string; }
export interface OmniAuthorized { type: Response.OmniAuthorized; message: string; }
export interface OmniCode { type: Response.OmniCode; code: string; }
export interface OmniJoin { type: Response.OmniJoin; role: OmniRole; user: string; name?: string; }
export interface OmniLeave { type: Response.OmniLeave; role: OmniRole; user: string; }
export interface OmniError { type: Response.OmniError; message: string; }

export type OmniMessage = OmniConnect | OmniDisconnect | OmniAuthorized | OmniCode |
	OmniJoin | OmniLeave | OmniError;

/** Connection metadata persists across scenes; application state stays in its scene. */
export interface OmniUser {
	readonly id: string;
	readonly role: "client" | "guest";
	readonly name: string;
}

export enum OmniEvent {
	Message = "message",
	UserJoined = "user_joined",
	UserLeft = "user_left",
}

export type OmniSocketEvents = {
	[Message in OmniMessage as Message["type"]]: [data: Message];
} & {
	[OmniEvent.Message]: [data: unknown];
	[OmniEvent.UserJoined]: [user: OmniUser];
	[OmniEvent.UserLeft]: [user: OmniUser];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is OmniRole {
	return value === "host" || value === "client" || value === "guest";
}

function isUser(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

const responseTypes = new Set<string>(Object.values(Response));

/** Distinguish transport messages from application payloads before validating either. */
export function isOmniResponse(data: unknown): boolean {
	return isRecord(data) && typeof data.type === "string" && responseTypes.has(data.type);
}

export function parseOmniMessage(data: unknown): OmniMessage | null {
	if (!isRecord(data)) return null;
	switch (data.type) {
		case Response.OmniConnect:
		case Response.OmniDisconnect:
		case Response.OmniAuthorized:
		case Response.OmniError:
			return typeof data.message === "string" ? { type: data.type, message: data.message } : null;
		case Response.OmniCode:
			return typeof data.code === "string" ? { type: data.type, code: data.code } : null;
		case Response.OmniJoin: {
			if (!isUser(data.user) || !isRole(data.role)) return null;
			const name = typeof data.name === "string" ? data.name.trim() : "";
			return { type: data.type, user: data.user, role: data.role, ...(name ? { name } : {}) };
		}
		case Response.OmniLeave:
			return isUser(data.user) && isRole(data.role)
				? { type: data.type, user: data.user, role: data.role } : null;
		default:
			return null;
	}
}
