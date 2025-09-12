export type TouchId = number;

export type TuioAddEvent = { event: "add"; id: TouchId };
export type TuioRemoveEvent = { event: "remove"; id: TouchId };
export type TuioUpdateEvent = {
	event: "update";
	id: TouchId;
	x: number;
	y: number;
	vx: number;
	vy: number;
	acc: number;
};

export type TuioEvent = TuioAddEvent | TuioRemoveEvent | TuioUpdateEvent;
