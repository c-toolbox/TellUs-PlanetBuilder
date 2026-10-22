import * as THREE from "three";
import { ForceGraph, GraphNode } from "./ForceGraph";
import { arcsCross } from "./sphericalGraph";

export const HOLD_TO_ADD_MS = 750;
export const TAP_MS = 250;
export const TOUCH_SLOP = 0.025;
export const LINK_DISTANCE = 0.13;

interface GraphTouch {
	direction: THREE.Vector3;
	startDirection: THREE.Vector3;
	cutStart: THREE.Vector3;
	started: number;
	node?: GraphNode;
	moved: boolean;
	cancelled: boolean;
	created: boolean;
	linked: boolean;
}

/** Scene-local capture: one owner per dot; empty touches never acquire existing dots mid-drag. */
export class GraphTouches {
	private readonly touches = new Map<number, GraphTouch>();
	private readonly ignored = new Set<number>();
	private readonly rotation = new THREE.Quaternion();

	constructor(
		private readonly graph: ForceGraph,
		private readonly pick: (direction: THREE.Vector3) => GraphNode | undefined,
		private readonly onCreate: (node: GraphNode) => void = () => {},
	) {}

	update(id: number, vector: THREE.Vector3, now = performance.now()) {
		if (this.ignored.has(id) || !Number.isFinite(vector.lengthSq()) || vector.lengthSq() < 1e-12) return;
		const direction = vector.clone().normalize();
		let touch = this.touches.get(id);
		if (!touch) {
			const hit = this.pick(direction);
			const node = hit?.heldBy === undefined ? hit : undefined;
			touch = {
				direction, startDirection: direction.clone(), cutStart: direction.clone(),
				started: now, node, moved: false, cancelled: !!hit, created: false, linked: false,
			};
			if (node) {
				node.heldBy = id;
				node.velocity.set(0, 0, 0);
			}
			this.touches.set(id, touch);
			return;
		}

		if (touch.startDirection.angleTo(direction) > TOUCH_SLOP) {
			touch.moved = true;
			touch.cancelled = true;
		}
		if (touch.node) {
			// Rotate the captured dot with the finger, preserving its initial offset.
			this.rotation.setFromUnitVectors(touch.direction, direction);
			touch.node.position.applyQuaternion(this.rotation).normalize();
			touch.node.velocity.set(0, 0, 0);
		} else if (!touch.created) {
			const hit = this.pick(direction);
			if (hit) touch.cancelled = true;
			const distance = touch.cutStart.angleTo(direction);
			if (hit || distance > 0.5) {
				touch.cutStart.copy(direction);
			} else if (distance > 0.004) {
				// Accumulate small samples so slow swipes can cross an edge too.
				for (const [key, edge] of this.graph.edges) {
					if (arcsCross(touch.cutStart, direction, edge.source.position, edge.target.position)) {
						this.graph.edges.delete(key);
						touch.cancelled = true;
					}
				}
				touch.cutStart.copy(direction);
			}
		}
		touch.direction.copy(direction);
		this.linkHeldNodes();
	}

	/** Called each frame so stationary hardware contacts also complete holds. */
	tick(now = performance.now()) {
		for (const [id, touch] of this.touches) {
			if (touch.node || touch.created || touch.cancelled) continue;
			// A moving dot entering the hold area also cancels creation permanently.
			if (this.pick(touch.direction)) {
				touch.cancelled = true;
				continue;
			}
			if (now - touch.started >= HOLD_TO_ADD_MS) {
				const node = this.graph.addNode(touch.direction);
				if (!node) continue;
				node.heldBy = id;
				node.velocity.set(0, 0, 0);
				touch.node = node;
				touch.created = true;
				touch.cancelled = true;
				this.onCreate(node);
			}
		}
		this.linkHeldNodes();
	}

	private linkHeldNodes() {
		const held = Array.from(this.touches.values()).filter((touch) => touch.node);
		for (let i = 0; i < held.length; i++) {
			for (let j = i + 1; j < held.length; j++) {
				const a = held[i], b = held[j];
				if (!(a.moved || b.moved) || a.node!.position.angleTo(b.node!.position) > LINK_DISTANCE) continue;
				if (this.graph.addEdge(a.node!.id, b.node!.id)) a.linked = b.linked = true;
			}
		}
	}

	release(id: number, now = performance.now()) {
		this.ignored.delete(id);
		const touch = this.touches.get(id);
		if (!touch) return;
		if (touch.node) {
			touch.node.heldBy = undefined;
			touch.node.velocity.set(0, 0, 0);
			if (!touch.created && !touch.moved && !touch.linked && now - touch.started <= TAP_MS) {
				this.graph.removeNode(touch.node.id);
			}
		}
		this.touches.delete(id);
	}

	clear(ignoreUntilRelease = true) {
		if (!ignoreUntilRelease) this.ignored.clear();
		for (const [id, touch] of this.touches) {
			if (touch.node) {
				touch.node.heldBy = undefined;
				touch.node.velocity.set(0, 0, 0);
			}
			if (ignoreUntilRelease) this.ignored.add(id);
		}
		this.touches.clear();
	}
}
