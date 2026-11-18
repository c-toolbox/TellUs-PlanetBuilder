import * as THREE from "three";
import { Body, edgeKey, PhysicsNode, PhysicsPull, PhysicsWorld } from "./PhysicsWorld";

export const HOLD_TO_ADD_MS = 400;
export const TOUCH_SLOP = 0.025;
export const LINK_DISTANCE = 0.52;
export const BREAK_DISTANCE = LINK_DISTANCE * 2;
// A body's edge only breaks once stretched noticeably beyond the shape it holds.
const BODY_BREAK_SLACK = 0.05;
// Smallest change of a held edge that counts as resizing it.
const RESIZE_THRESHOLD = 0.02;

interface PhysicsTouch {
	direction: THREE.Vector3;
	startDirection: THREE.Vector3;
	started: number;
	node?: PhysicsNode;
	pull?: PhysicsPull;
	moved: boolean;
	cancelled: boolean;
	created: boolean;
}

/** Scene-local capture: one owner per dot; empty touches never acquire existing dots mid-drag. */
export class PhysicsTouches {
	private readonly touches = new Map<number, PhysicsTouch>();
	private readonly ignored = new Set<number>();
	/** Finger distance that the last applied scale of a body corresponds to. */
	private readonly pinches = new Map<Body, { a: number; b: number; distance: number }>();
	private readonly rotation = new THREE.Quaternion();

	constructor(
		private readonly world: PhysicsWorld,
		private readonly pick: (direction: THREE.Vector3) => PhysicsNode | undefined,
		private readonly onCreate: (node: PhysicsNode) => void = () => {},
	) {}

	update(id: number, vector: THREE.Vector3, now = performance.now()) {
		if (this.ignored.has(id) || !Number.isFinite(vector.lengthSq()) || vector.lengthSq() < 1e-12) return;
		const direction = vector.clone().normalize();
		let touch = this.touches.get(id);
		if (!touch) {
			const hit = this.pick(direction);
			const node = hit?.heldBy === undefined ? hit : undefined;
			touch = {
				direction, startDirection: direction.clone(),
				started: now, node, moved: false, cancelled: !!hit, created: false,
			};
			if (node) {
				node.heldBy = id;
				node.target.copy(node.position);
			} else if (!hit) {
				// Dots take priority; empty space on a shape or rod drags the whole thing.
				touch.pull = this.world.pickBody(direction) ?? this.world.pickRod(direction);
				if (touch.pull) {
					touch.cancelled = true;
					this.world.pulls.set(id, touch.pull);
				}
			}
			this.touches.set(id, touch);
			return;
		}

		if (touch.startDirection.angleTo(direction) > TOUCH_SLOP) {
			touch.moved = true;
			touch.cancelled = true;
		}
		if (touch.node) {
			// Carry the node's target with the finger, preserving the grab offset.
			this.rotation.setFromUnitVectors(touch.direction, direction);
			touch.node.target.applyQuaternion(this.rotation).normalize();
		} else if (touch.pull) {
			touch.pull.target.copy(direction);
		}
		touch.direction.copy(direction);
		this.linkHeldNodes();
		this.pinchBodies();
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
				const node = this.world.addNode(touch.direction);
				if (!node) continue;
				node.heldBy = id;
				touch.node = node;
				touch.created = true;
				touch.cancelled = true;
				this.onCreate(node);
			}
		}
		this.linkHeldNodes();
	}

	private linkHeldNodes() {
		this.world.refresh();
		const held = Array.from(this.touches.values()).filter((touch) => touch.node);
		for (let i = 0; i < held.length; i++) {
			for (let j = i + 1; j < held.length; j++) {
				const a = held[i], b = held[j];
				const angle = a.node!.position.angleTo(b.node!.position);
				const key = edgeKey(a.node!.id, b.node!.id);
				const edge = this.world.edges.get(key);
				if (edge) {
					const stretched = !edge.body || angle > edge.restLength + BODY_BREAK_SLACK;
					if (angle > BREAK_DISTANCE && stretched) {
						this.world.breakEdge(key);
					} else if (!edge.body) {
						// While both ends are held, the user sets a loose edge's length.
						edge.restLength = this.world.clampRestLength(angle);
					}
					continue;
				}
				if (!(a.moved || b.moved) || angle > LINK_DISTANCE) continue;
				const [from, to] = this.world.hasEdges(b.node!) && !this.world.hasEdges(a.node!)
					? [b.node!, a.node!] : [a.node!, b.node!];
				const toIsFree = !this.world.hasEdges(to);
				// A dot without lines takes the color of the one it joins; two connected dots keep theirs.
				if (this.world.addEdge(a.node!.id, b.node!.id) && toIsFree) this.world.paint(to, from.swatch);
			}
		}
	}

	/** Two fingers inside one shape scale it with the distance between them. */
	private pinchBodies() {
		const fingers = new Map<Body, number[]>();
		for (const [id, touch] of this.touches) {
			const body = touch.pull?.body;
			if (!body || this.world.bodies.get(body.id) !== body) continue;
			fingers.set(body, [...(fingers.get(body) ?? []), id]);
		}
		for (const body of this.pinches.keys()) {
			if ((fingers.get(body)?.length ?? 0) < 2) this.pinches.delete(body);
		}
		for (const [body, [a, b]] of fingers) {
			if (b === undefined) continue;
			const distance = this.touches.get(a)!.direction.angleTo(this.touches.get(b)!.direction);
			const pinch = this.pinches.get(body);
			if (!pinch || pinch.a !== a || pinch.b !== b) {
				this.pinches.set(body, { a, b, distance });
			} else if (distance > 1e-3 && pinch.distance > 1e-3) {
				// Following the applied factor lets a body stuck at its size limit shrink as soon as the fingers return.
				pinch.distance *= this.world.scaleBody(body, distance / pinch.distance);
			}
		}
	}

	release(id: number) {
		this.ignored.delete(id);
		this.world.pulls.delete(id);
		const touch = this.touches.get(id);
		if (!touch) return;
		this.touches.delete(id);
		this.pinchBodies();
		const node = touch.node;
		if (!node) return;
		// The node keeps its velocity, so letting go while moving throws it.
		node.heldBy = undefined;
		if (this.world.isBelowFloor(node)) this.world.removeNode(node.id);
		else if (!this.formShape(node)) this.applyResize(node);
	}

	/** Letting go of one of two held dots of a shape keeps the edge length between them. */
	private applyResize(released: PhysicsNode) {
		const { body } = released;
		const partner = Array.from(this.touches.values()).find((touch) => touch.node?.body === body && body)?.node;
		const edge = partner && this.world.edges.get(edgeKey(released.id, partner.id));
		if (!body || !partner || !edge) return;
		if (Math.abs(released.position.angleTo(partner.position) - edge.restLength) > RESIZE_THRESHOLD) {
			this.world.reshapeBody(body);
		}
	}

	/** Dots that were joined into a ring while held become a body, or join the body they were added to. */
	private formShape(released: PhysicsNode) {
		const joined = (a: PhysicsNode, b: PhysicsNode) => this.world.edges.has(edgeKey(a.id, b.id));
		const group = [released];
		for (const { node } of this.touches.values()) {
			if (node && joined(released, node)) group.push(node);
		}
		if (group.length < 3) return false;
		for (let i = 1; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) if (!joined(group[i], group[j])) return false;
		}
		const bodies = new Set(group.map((node) => node.body).filter((body) => body));
		if (bodies.size === 0) return !!this.world.createBody(group);
		if (bodies.size > 1) return false;
		const [body] = bodies;
		const members = group.filter((node) => node.body === body);
		const free = group.filter((node) => !node.body);
		return members.length === 2 && free.length === 1 && this.world.attachNode(body!, free[0], members[0], members[1]);
	}

	clear(ignoreUntilRelease = true) {
		if (!ignoreUntilRelease) this.ignored.clear();
		for (const [id, touch] of this.touches) {
			this.world.pulls.delete(id);
			if (touch.node) touch.node.heldBy = undefined;
			if (ignoreUntilRelease) this.ignored.add(id);
		}
		this.touches.clear();
		this.pinches.clear();
	}
}
