/** Application protocol shared by MeasuringScene and its map client. */
export const MAP_DRAWING_MESSAGE = "map_drawing";
export const MAP_COLOR_MESSAGE = "map_color";
export const MAX_DRAWING_POINTS = 200;
export type LatLng = readonly [latitude: number, longitude: number];
/** Coordinates are degrees. null lifts the pen and counts toward the entry limit. */
export type DrawingPoint = LatLng | null;

export interface MapDrawing {
	type: typeof MAP_DRAWING_MESSAGE;
	points: readonly DrawingPoint[];
}

export interface MapDrawingMessage extends MapDrawing {
	/** Added by Omni when forwarding a client's message. */
	user: string;
}

/** Host-to-client color assignment, targeted through Omni's user field. */
export interface MapColorMessage {
	type: typeof MAP_COLOR_MESSAGE;
	user: string;
	/** CSS sRGB hex string, e.g. #ef4444. */
	color: string;
}

function isDrawingPoint(value: unknown): value is DrawingPoint {
	return value === null || (Array.isArray(value) && value.length === 2 &&
		typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 90 &&
		typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 180);
}

/** Ignore other client protocols and reject invalid drawings without changing scene state. */
export function parseMapDrawing(input: unknown): MapDrawingMessage | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const data = input as Record<string, unknown>;
	if (data.type !== MAP_DRAWING_MESSAGE || typeof data.user !== "string" || !data.user.trim() ||
		!Array.isArray(data.points) || data.points.length > MAX_DRAWING_POINTS) return null;
	const points: DrawingPoint[] = [];
	for (const point of data.points) {
		if (!isDrawingPoint(point)) return null;
		points.push(point === null ? null : Object.freeze([point[0], point[1]] as const));
	}
	return { type: MAP_DRAWING_MESSAGE, user: data.user, points: Object.freeze(points) };
}
