import { EventEmitter } from "events";
import * as THREE from "three";
import { TouchId } from "@/network/tuioProtocol";
import { TouchPoint } from "@/network/TouchPoint";

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
}

export class TouchInteraction extends EventEmitter<TouchInteractionEvents> {
	public readonly activeTouchIds = new Set<TouchId>();
	public readonly raycastRoot: THREE.Object3D;
	public enabled: boolean | (() => boolean);

	constructor(
		public readonly object: THREE.Object3D,
		options: TouchInteractionOptions = {},
	) {
		super();
		this.raycastRoot = options.raycastRoot ?? object;
		this.enabled = options.enabled ?? true;
	}

	get isEnabled(): boolean {
		return typeof this.enabled === "function"
			? this.enabled()
			: this.enabled;
	}
}