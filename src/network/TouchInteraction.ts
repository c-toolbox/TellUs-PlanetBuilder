import { EventEmitter } from "events";
import * as THREE from "three";
import { TouchId } from "@/network/tuioProtocol";
import { TouchPoint } from "@/network/TouchPoint";

/**
 * - enter: A touch starts hovering over this object, including on initial contact.
 * - press: A touch begins on this object; moving onto it later does not press it.
 * - hold: Each frame while hovered or originally pressed, even after leaving.
 * - drag: The originally pressed touch moves, even outside the object, until cancelDrag().
 * - leave: A touch stops hovering over this object; ending a touch emits release instead.
 * - release: A touch disappears; sent to both the hovered and originally pressed objects.
 * - click: A touch was pressed and released within clickDuration milliseconds.
 */
export type TouchInteractionEventName =
	| "enter"
	| "press"
	| "hold"
	| "drag"
	| "leave"
	| "release"
	| "click";

export interface TouchInteractionEvent {
	touchId: TouchId;
	touchPoint: TouchPoint;
	target: TouchInteraction;
	direction: THREE.Vector3;
	startDirection: THREE.Vector3;
	previousDirection: THREE.Vector3;
	intersection?: THREE.Intersection;
	isHovered: boolean;
	cancelDrag: () => void;
}

type TouchInteractionEvents = Record<
	TouchInteractionEventName,
	[event: TouchInteractionEvent]
>;

export interface TouchInteractionOptions {
	/** Root used for occlusion-aware raycasting. Defaults to object. */
	raycastRoot?: THREE.Object3D;
	enabled?: boolean | (() => boolean);
	clickDuration?: number;
}

export class TouchInteraction extends EventEmitter<TouchInteractionEvents> {
	public readonly activeTouchIds = new Set<TouchId>();
	public readonly raycastRoot: THREE.Object3D;
	public enabled: boolean | (() => boolean);
	public clickDuration: number;

	constructor(
		public readonly object: THREE.Object3D,
		options: TouchInteractionOptions = {},
	) {
		super();
		this.raycastRoot = options.raycastRoot ?? object;
		this.enabled = options.enabled ?? true;
		this.clickDuration = options.clickDuration ?? 250;
	}

	get isEnabled(): boolean {
		return typeof this.enabled === "function"
			? this.enabled()
			: this.enabled;
	}
}