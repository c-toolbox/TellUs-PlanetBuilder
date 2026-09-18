import { EventEmitter } from "events";
import {
	TuioEvent,
	TuioAddEvent,
	TuioRemoveEvent,
	TuioUpdateEvent,
} from "./tuioProtocol";
import { events } from "@neutralinojs/lib";
import { isNeutralino } from "@/utils/neu";

const TUIO_EVENT = "tuioMessage";

type OscMessage = {
	address: string;
	args: [string, ...unknown[]];
};

export class TuioSocket extends EventEmitter {
	private activeIds = new Set<number>();

	constructor() {
		super();

		if (isNeutralino) {
			events.on(TUIO_EVENT, (event) => this.onOscMessage(event.detail));
		}
	}

	private onOscMessage(message: OscMessage) {
		if (message.address !== "/tuio/2Dcur") return;

		const [type, ...args] = message.args;
		if (type === "alive") {
			const currentIds = new Set(args as number[]);
			for (const id of currentIds) {
				if (!this.activeIds.has(id)) this.onAdd({ event: "add", id });
			}
			for (const id of this.activeIds) {
				if (!currentIds.has(id)) this.onRemove({ event: "remove", id });
			}
			this.activeIds = currentIds;
		} else if (type === "set") {
			const [id, x, y, vx, vy, acc] = args as number[];
			this.onUpdate({ event: "update", id, x, y, vx, vy, acc });
		}
	}

	onAdd(touch: TuioAddEvent) {
		this.emit("touchAdd", touch.id);
	}

	onRemove(touch: TuioRemoveEvent) {
		this.emit("touchRemove", touch.id);
	}

	onUpdate(touch: TuioUpdateEvent) {
		// Convert Tellus weird coordinate system
		const pitch = touch.y * Math.PI;
		const yaw = (1.5 - touch.x) * 2 * Math.PI;

		this.emit("touchUpdate", touch.id, pitch, yaw);
	}
}
