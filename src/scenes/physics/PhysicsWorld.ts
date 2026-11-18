import * as THREE from "three";
import { UP } from "@/constants";
import { Color } from "@/utils/colors";
import { colorCycle } from "@/utils/functions";
import { Collider, Contact, collidePair, createCollider, inverseMass, updateCollider } from "./contacts";
import { arcNormal, convexOrder, isConvexRing } from "./sphericalGeometry";

export interface PhysicsModel {
	vertices: readonly (readonly number[])[];
	/** Convex outlines as vertex indices, in ring order. */
	bodies: readonly (readonly number[])[];
	/** Loose edges: ropes and platforms. */
	edges?: readonly (readonly number[])[];
}

export interface PhysicsSettings {
	/** Acceleration towards the south pole at the equator, in rad/s². */
	gravity: number;
	/** Coulomb friction coefficient of every contact. */
	friction: number;
	/** Floor level from 0.5 (45° south) to 1 (the equator). */
	floor: number;
	/** Fraction of the impact speed a collision gives back, from 0 to 1. */
	bounciness: number;
	/** Exponential velocity damping, in 1/s. */
	airFriction: number;
}

export interface PhysicsNode {
	readonly id: number;
	readonly position: THREE.Vector3;
	readonly previous: THREE.Vector3;
	readonly velocity: THREE.Vector3;
	/** Velocity just before the contacts of the current substep were solved. */
	readonly approach: THREE.Vector3;
	/** Where a holding finger wants the node to be. */
	readonly target: THREE.Vector3;
	/** Index into the rainbow cycle that the three colors below come from. */
	swatch: number;
	/** Tailwind 700, for the dot. */
	readonly color: THREE.Color;
	/** Tailwind 600, for the lines. */
	readonly edgeColor: THREE.Color;
	/** Tailwind 500, for the inside of a shape. */
	readonly fillColor: THREE.Color;
	heldBy?: number;	body?: Body;
	/** Collision radius, assigned with the collider layout. */
	radius: number;
}

/** A rigid convex polygon: its nodes, in ring order, are all joined by edges. */
export interface Body {
	readonly id: number;
	nodes: PhysicsNode[];
}

export interface PhysicsEdge {
	readonly key: string;
	readonly source: PhysicsNode;
	readonly target: PhysicsNode;
	/** Desired angular length in radians. */
	restLength: number;
	/** Set when both ends belong to one body. */
	body?: Body;
	/** A body's diagonal: it keeps the shape rigid and is never drawn. */
	internal: boolean;
}

/** A finger pulling a point of a body or rod, given as weights over its nodes. */
export interface PhysicsPull {
	readonly nodes: readonly number[];
	readonly weights: readonly number[];
	readonly target: THREE.Vector3;
	/** Set when the pull grabs a body rather than a rod. */
	readonly body?: Body;
}

/** Latitude of the floor for a floor setting; 1 is the equator and 0 the south pole. */
export const floorLatitude = (floor: number) => -(Math.PI / 2) * (1 - floor);
/** How far below the floor a released node must be to get deleted, as a height difference. */
const DELETE_DEPTH = 0.04;
// Impacts slower than this (rad/s) do not bounce, so resting contacts stay still.
const BOUNCE_THRESHOLD = 0.2;
export const NODE_RADIUS = 0.02;
export const ROD_RADIUS = 0.008;
const SKIN_RADIUS = 0.004;
const MAX_BODY_NODES = 12;
/** Largest and smallest distance between two nodes of a body, in radians. */
const MAX_BODY_SIZE = 1;
const MIN_BODY_SIZE = 0.08;
const PICK_ROD_RADIUS = 0.045;

const SUBSTEPS = 6;
const ITERATIONS = 3;
const HELD_FOLLOW_TIME = 0.015;
// A pull steers the grabbed point's velocity towards error / PULL_TIME; the velocity itself
// relaxes much faster, which keeps the motion overdamped.
const PULL_TIME = 0.05;
const PULL_VELOCITY_TIME = 0.006;
const SPEED_LIMIT = 24;

export function edgeKey(a: number, b: number) {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Rigid body physics on the unit sphere (position based dynamics). Distances are angular.
 * Gravity pulls towards the south, an adjustable floor sits at a latitude and bodies are convex polygons.
 */
export class PhysicsWorld {
	readonly nodes = new Map<number, PhysicsNode>();
	readonly edges = new Map<string, PhysicsEdge>();
	readonly bodies = new Map<number, Body>();
	readonly settings: PhysicsSettings = { gravity: 4, friction: 0.4, floor: 1, bounciness: 0.1, airFriction: 0.3 };
	/** Active finger pulls, keyed by touch id. */
	readonly pulls = new Map<number, PhysicsPull>();
	private nodeList: PhysicsNode[] = [];
	private edgeList: PhysicsEdge[] = [];
	private colliders: Collider[] = [];
	/** Contacts of the first solver iteration of the current substep. */
	private contacts: Contact[] = [];
	/** Nodes that lost their last edge; they go away as soon as nobody holds them. */
	private readonly orphans = new Set<number>();
	private topologyVersion = 0;
	private builtVersion = -1;
	private nextId = 0;
	private nextBodyId = 0;
	private colorIndex = 0;
	private readonly tangent = new THREE.Vector3();
	private readonly toward = new THREE.Vector3();
	private readonly normal = new THREE.Vector3();
	private readonly grab = new THREE.Vector3();
	private readonly south = new THREE.Vector3();
	private readonly corrected = new THREE.Vector3();
	private readonly east = new THREE.Vector3();
	private readonly slide = new THREE.Vector3();
	private readonly wanted = new THREE.Vector3();
	private readonly change = new THREE.Vector3();
	private readonly basis = new THREE.Matrix3();
	private readonly weights = new THREE.Vector3();

	/** Height (y) of the floor circle. */
	get floorHeight() {
		return Math.sin(floorLatitude(this.settings.floor));
	}

	/** True for a held node dragged far enough into the floor to be deleted on release. */
	isBelowFloor(node: PhysicsNode) {
		return node.position.y < this.floorHeight - DELETE_DEPTH;
	}

	load(model: PhysicsModel) {
		this.nodes.clear();
		this.edges.clear();
		this.bodies.clear();
		this.pulls.clear();
		this.contacts.length = 0;
		this.orphans.clear();
		this.topologyVersion++;
		this.nextId = 0;
		this.nextBodyId = 0;
		model.vertices.forEach((vertex) => this.addNode(new THREE.Vector3(...vertex)));
		model.edges?.forEach(([a, b]) => this.addEdge(a, b));
		model.bodies.forEach((ids) => this.addBody(ids.map((id) => this.nodes.get(id)!)));
	}

	addNode(direction: THREE.Vector3) {
		if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 1e-12) return;
		const position = direction.clone().normalize();
		const node: PhysicsNode = {
			id: this.nextId++, position,
			previous: position.clone(), velocity: new THREE.Vector3(), approach: new THREE.Vector3(),
			target: position.clone(),
			swatch: 0, color: new THREE.Color(), edgeColor: new THREE.Color(), fillColor: new THREE.Color(),
			radius: NODE_RADIUS,
		};
		this.paint(node, this.colorIndex++);
		this.nodes.set(node.id, node);
		this.topologyVersion++;
		return node;
	}

	/** Gives a node the shades of one entry of the rainbow cycle. */
	paint(node: PhysicsNode, swatch: number) {
		const family = Color[colorCycle[swatch % colorCycle.length]].replace(/\d+$/, "");
		const shade = (level: number) => Color[`${family}${level}` as keyof typeof Color];
		node.swatch = swatch;
		node.color.setHex(shade(500), THREE.SRGBColorSpace);
		node.edgeColor.setHex(shade(500), THREE.SRGBColorSpace);
		node.fillColor.setHex(shade(400), THREE.SRGBColorSpace);
	}

	addEdge(a: number, b: number) {
		const source = this.nodes.get(a), target = this.nodes.get(b);
		const key = edgeKey(a, b);
		if (!source || !target || a === b || this.edges.has(key)) return false;
		this.edges.set(key, {
			key, source, target, internal: false,
			restLength: this.clampRestLength(source.position.angleTo(target.position)),
		});
		this.orphans.delete(a);
		this.orphans.delete(b);
		this.topologyVersion++;
		return true;
	}

	/** Deletes an edge. Breaking one of a body's edges dissolves the body into loose edges. */
	breakEdge(key: string) {
		const edge = this.edges.get(key);
		if (!edge) return;
		const body = edge.source.body;
		if (body && body === edge.target.body) this.dissolveBody(body);
		this.removeEdge(key);
	}

	/** Deletes a node and its edges; its body keeps going with the remaining nodes. */
	removeNode(id: number) {
		const node = this.nodes.get(id);
		if (!node) return;
		const body = node.body;
		if (body) {
			body.nodes.splice(body.nodes.indexOf(node), 1);
			node.body = undefined;
			if (body.nodes.length < 3) this.dissolveBody(body);
		}
		for (const [key, edge] of this.edges) {
			if (edge.source === node || edge.target === node) this.removeEdge(key);
		}
		this.nodes.delete(id);
		this.orphans.delete(id);
		this.topologyVersion++;
	}

	/** Joins free nodes into one convex body; undefined unless they are in convex position. */
	createBody(nodes: readonly PhysicsNode[]) {
		if (nodes.length < 3 || nodes.length > MAX_BODY_NODES || nodes.some((node) => node.body)) return;
		const order = convexOrder(nodes.map((node) => node.position));
		return order && this.addBody(order.map((index) => nodes[index]));
	}

	/** Inserts a free node into a body between two neighbouring nodes, if the result stays convex. */
	attachNode(body: Body, node: PhysicsNode, a: PhysicsNode, b: PhysicsNode) {
		const count = body.nodes.length;
		const i = body.nodes.indexOf(a), j = body.nodes.indexOf(b);
		if (node.body || count >= MAX_BODY_NODES || i < 0 || j < 0) return false;
		const at = (i + 1) % count === j ? i + 1 : (j + 1) % count === i ? j + 1 : -1;
		if (at < 0) return false;
		const nodes = body.nodes.slice();
		nodes.splice(at, 0, node);
		if (!isConvexRing(nodes.map((member) => member.position))) return false;
		body.nodes = nodes;
		node.body = body;
		this.paint(node, a.swatch);
		for (const other of nodes) if (other !== node) this.joinRigidly(node, other);
		this.topologyVersion++;
		return true;
	}

	clampRestLength(length: number) {
		return THREE.MathUtils.clamp(length, 0.02, Math.PI - 0.01);
	}

	/** Scales a body about its centre, within its size limits; returns the factor actually applied. */
	scaleBody(body: Body, ratio: number) {
		const { nodes } = body;
		if (nodes.some((node) => node.heldBy !== undefined)) return 1;
		let largest = 0, smallest = Infinity;
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const distance = nodes[i].position.angleTo(nodes[j].position);
				largest = Math.max(largest, distance);
				smallest = Math.min(smallest, distance);
			}
		}
		const factor = ratio > 1
			? Math.max(1, Math.min(ratio, MAX_BODY_SIZE / largest))
			: Math.min(1, Math.max(ratio, MIN_BODY_SIZE / smallest));
		if (!Number.isFinite(factor) || factor === 1) return 1;
		this.grab.set(0, 0, 0);
		for (const node of nodes) this.grab.add(node.position);
		this.grab.normalize();
		for (const { position } of nodes) {
			this.tangent.copy(position).addScaledVector(this.grab, -this.grab.dot(position));
			const distance = position.angleTo(this.grab);
			if (this.tangent.lengthSq() < 1e-12) continue;
			position.copy(this.grab).multiplyScalar(Math.cos(distance * factor))
				.addScaledVector(this.tangent.normalize(), Math.sin(distance * factor));
		}
		this.adoptShape(body);
		return factor;
	}

	/** Makes the current spacing of a body's nodes its shape, unless that is no longer a convex polygon. */
	reshapeBody(body: Body) {
		const { nodes } = body;
		if (!isConvexRing(nodes.map((node) => node.position))) return false;
		if (nodes.some((a) => nodes.some((b) => a.position.angleTo(b.position) > MAX_BODY_SIZE))) return false;
		this.adoptShape(body);
		return true;
	}

	private adoptShape({ nodes }: Body) {
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const edge = this.edges.get(edgeKey(nodes[i].id, nodes[j].id));
				if (edge) edge.restLength = this.clampRestLength(nodes[i].position.angleTo(nodes[j].position));
			}
		}
	}

	/** Derived data: edge roles, colliders and node lists. Cheap while the topology is unchanged. */
	refresh() {
		if (this.builtVersion === this.topologyVersion) return;
		this.builtVersion = this.topologyVersion;
		this.nodeList = Array.from(this.nodes.values());
		this.edgeList = Array.from(this.edges.values());
		const attached = new Set<number>();
		this.colliders = [];
		for (const body of this.bodies.values()) {
			this.colliders.push(createCollider("polygon", body.nodes, SKIN_RADIUS));
		}
		for (const edge of this.edgeList) {
			const { source, target } = edge;
			attached.add(source.id).add(target.id);
			edge.body = source.body && source.body === target.body ? source.body : undefined;
			edge.internal = false;
			if (edge.body) {
				const { nodes } = edge.body;
				const gap = Math.abs(nodes.indexOf(source) - nodes.indexOf(target));
				edge.internal = gap !== 1 && gap !== nodes.length - 1;
			} else {
				this.colliders.push(createCollider("segment", [source, target], ROD_RADIUS));
			}
		}
		for (const node of this.nodeList) {
			node.radius = node.body ? SKIN_RADIUS : attached.has(node.id) ? ROD_RADIUS : NODE_RADIUS;
			if (!node.body && !attached.has(node.id)) this.colliders.push(createCollider("point", [node], NODE_RADIUS));
		}
	}

	/** The body under a direction, with the weights of that point over one triangle of its fan. */
	pickBody(direction: THREE.Vector3): PhysicsPull | undefined {
		for (const body of this.bodies.values()) {
			const { nodes } = body;
			const a = nodes[0];
			for (let i = 1; i < nodes.length - 1; i++) {
				const b = nodes[i], c = nodes[i + 1];
				this.basis.set(
					a.position.x, b.position.x, c.position.x,
					a.position.y, b.position.y, c.position.y,
					a.position.z, b.position.z, c.position.z,
				);
				if (Math.abs(this.basis.determinant()) < 1e-9) continue;
				this.weights.copy(direction).applyMatrix3(this.basis.invert());
				const { x, y, z } = this.weights;
				if (x < 0 || y < 0 || z < 0) continue;
				const sum = x + y + z;
				return {
					nodes: [a.id, b.id, c.id],
					weights: [x / sum, y / sum, z / sum],
					target: direction.clone(),
					body,
				};
			}
		}
	}

	/** The nearest loose edge within reach of a direction, with the weights of the closest point. */
	pickRod(direction: THREE.Vector3): PhysicsPull | undefined {
		let best: PhysicsPull | undefined;
		let bestDistance = PICK_ROD_RADIUS;
		for (const edge of this.edges.values()) {
			if (edge.body) continue;
			const a = edge.source.position, b = edge.target.position;
			const length = a.angleTo(b);
			if (length < 1e-6 || length > Math.PI - 1e-3) continue;
			this.normal.crossVectors(a, b).normalize();
			this.tangent.copy(direction).addScaledVector(this.normal, -this.normal.dot(direction));
			const along = THREE.MathUtils.clamp(
				Math.atan2(this.toward.crossVectors(a, this.tangent).dot(this.normal), a.dot(this.tangent)),
				0, length,
			);
			this.grab.copy(a).multiplyScalar(Math.sin(length - along)).addScaledVector(b, Math.sin(along))
				.divideScalar(Math.sin(length));
			const distance = this.grab.angleTo(direction);
			if (distance >= bestDistance) continue;
			bestDistance = distance;
			const t = along / length;
			best = { nodes: [edge.source.id, edge.target.id], weights: [1 - t, t], target: direction.clone() };
		}
		return best;
	}

	step(dt: number) {
		if (!Number.isFinite(dt) || dt <= 0) return;
		// Bound individual steps even when called outside the scene's accumulator.
		dt = Math.min(dt, 1 / 60);
		this.pruneOrphans();
		this.refresh();
		for (let i = 0; i < SUBSTEPS; i++) this.substep(dt / SUBSTEPS);
	}

	private substep(h: number) {
		const followHeld = 1 - Math.exp(-h / HELD_FOLLOW_TIME);
		const damping = Math.exp(-this.settings.airFriction * h);
		this.applyPulls(h);
		this.contacts.length = 0;
		for (const node of this.nodeList) {
			const { position, velocity } = node;
			node.previous.copy(position);
			if (node.heldBy !== undefined) {
				node.approach.copy(velocity);
				this.moveToward(node.position, node.target, followHeld, h);
				continue;
			}
			// Tangential component of gravity: zero at the poles, strongest at the equator.
			this.south.copy(position).multiplyScalar(position.y).sub(UP);
			velocity.addScaledVector(this.south, this.settings.gravity * h).multiplyScalar(damping);
			node.approach.copy(velocity);
			position.addScaledVector(velocity, h).normalize();
		}
		for (let i = 0; i < ITERATIONS; i++) {
			// Bounces use the contacts of the first pass, before corrections pile up.
			const contacts = i === 0 ? this.contacts : undefined;
			this.solveEdges();
			for (const collider of this.colliders) updateCollider(collider);
			for (let a = 0; a < this.colliders.length; a++) {
				for (let b = a + 1; b < this.colliders.length; b++) {
					collidePair(this.colliders[a], this.colliders[b], this.settings.friction, contacts);
				}
			}
			this.solveFloor(contacts);
		}
		for (const node of this.nodeList) {
			this.slide.subVectors(node.position, node.previous);
			this.slide.addScaledVector(node.position, -this.slide.dot(node.position));
			node.velocity.copy(this.slide).divideScalar(h).clampLength(0, SPEED_LIMIT);
		}
		this.bounce();
	}

	/** Gives each contact back part of its impact speed along the contact normal. */
	private bounce() {
		const restitution = this.settings.bounciness;
		if (restitution <= 0) return;
		for (const { nodes, weights, normal } of this.contacts) {
			let before = 0, after = 0;
			nodes.forEach((node, i) => {
				before += weights[i] * node.approach.dot(normal);
				after += weights[i] * node.velocity.dot(normal);
			});
			if (before > -BOUNCE_THRESHOLD) continue;
			const gain = -restitution * before - after;
			if (gain <= 0) continue;
			// A body bounces as one lump, so a corner hitting something turns the whole shape around.
			const lumps = new Map<Body | PhysicsNode, { members: readonly PhysicsNode[]; weight: number; inverse: number }>();
			nodes.forEach((node, i) => {
				const key = node.body ?? node;
				const lump = lumps.get(key);
				if (lump) {
					lump.weight += weights[i];
					return;
				}
				const members = node.body?.nodes ?? [node];
				const held = members.some((member) => member.heldBy !== undefined);
				lumps.set(key, { members, weight: weights[i], inverse: held ? 0 : 1 / members.length });
			});
			let total = 0;
			for (const { weight, inverse } of lumps.values()) total += weight * weight * inverse;
			if (total < 1e-9) continue;
			for (const { members, weight, inverse } of lumps.values()) {
				const change = (weight * inverse * gain) / total;
				if (change === 0) continue;
				for (const { velocity, position } of members) {
					velocity.addScaledVector(normal, change);
					velocity.addScaledVector(position, -velocity.dot(position)).clampLength(0, SPEED_LIMIT);
				}
			}
		}
	}

	/** Moves a position a fraction of the way to a target, at a limited speed. */
	private moveToward(position: THREE.Vector3, target: THREE.Vector3, fraction: number, h: number) {
		this.toward.copy(target).addScaledVector(position, -position.dot(target));
		if (this.toward.lengthSq() < 1e-12) return;
		const angle = position.angleTo(target);
		position.addScaledVector(this.toward.normalize(), Math.min(angle * fraction, SPEED_LIMIT * h)).normalize();
	}

	/** Steers the grabbed point's velocity towards the finger and shares the change across the nodes. */
	private applyPulls(h: number) {
		const blend = 1 - Math.exp(-h / PULL_VELOCITY_TIME);
		for (const { nodes: ids, weights, target } of this.pulls.values()) {
			const nodes = ids.map((id) => this.nodes.get(id));
			if (nodes.some((node) => !node)) continue;
			this.grab.set(0, 0, 0);
			this.change.set(0, 0, 0);
			nodes.forEach((node, i) => {
				this.grab.addScaledVector(node!.position, weights[i]);
				this.change.addScaledVector(node!.velocity, weights[i]);
			});
			this.grab.normalize();
			this.tangent.copy(target).addScaledVector(this.grab, -this.grab.dot(target));
			this.wanted.set(0, 0, 0);
			if (this.tangent.lengthSq() > 1e-12) {
				const speed = Math.min(this.grab.angleTo(target) / PULL_TIME, SPEED_LIMIT);
				this.wanted.copy(this.tangent).normalize().multiplyScalar(speed);
			}
			this.change.subVectors(this.wanted, this.change).multiplyScalar(blend);
			let total = 0;
			nodes.forEach((node, i) => (total += weights[i] * weights[i] * inverseMass(node!)));
			if (total < 1e-9) continue;
			nodes.forEach((node, i) => {
				node!.velocity.addScaledVector(this.change, (weights[i] * inverseMass(node!)) / total);
			});
		}
	}

	private solveEdges() {
		for (const { source: a, target: b, restLength } of this.edgeList) {
			const wa = inverseMass(a), wb = inverseMass(b);
			if (wa + wb === 0) continue;
			const cosine = THREE.MathUtils.clamp(a.position.dot(b.position), -1, 1);
			const error = Math.acos(cosine) - restLength;
			if (Math.abs(error) < 1e-7) continue;
			const toB = this.direction(a.position, b.position, cosine, this.tangent);
			const toA = this.direction(b.position, a.position, cosine, this.toward);
			a.position.addScaledVector(toB, (error * wa) / (wa + wb)).normalize();
			b.position.addScaledVector(toA, (error * wb) / (wa + wb)).normalize();
		}
	}

	/** Unit tangent at `from` pointing along the arc to `to`. */
	private direction(from: THREE.Vector3, to: THREE.Vector3, cosine: number, result: THREE.Vector3) {
		result.copy(to).addScaledVector(from, -cosine);
		if (result.lengthSq() < 1e-12) {
			arcNormal(from, to, this.normal);
			result.crossVectors(this.normal, from);
		}
		return result.normalize();
	}

	/** Keeps free nodes above the floor circle, with friction against sliding along it. */
	private solveFloor(contacts?: Contact[]) {
		const latitude = floorLatitude(this.settings.floor);
		for (const node of this.nodeList) {
			const { position } = node;
			const limit = Math.sin(latitude + node.radius);
			if (node.heldBy !== undefined || position.y >= limit) continue;
			const ring = Math.hypot(position.x, position.z);
			const radius = Math.sqrt(1 - limit * limit);
			if (ring > 1e-6) this.corrected.set((position.x / ring) * radius, limit, (position.z / ring) * radius);
			else this.corrected.set(radius, limit, 0);
			if (contacts) {
				// Northward tangent on the floor circle.
				const up = this.tangent.copy(UP).addScaledVector(this.corrected, -this.corrected.y);
				if (up.lengthSq() > 1e-12) contacts.push({ nodes: [node], weights: [1], normal: up.normalize().clone() });
			}
			const depth = position.angleTo(this.corrected);
			this.east.set(this.corrected.z, 0, -this.corrected.x).normalize();
			const sliding = this.slide.subVectors(position, node.previous).dot(this.east);
			const grip = Math.min(Math.abs(sliding), this.settings.friction * depth);
			position.copy(this.corrected).addScaledVector(this.east, -Math.sign(sliding) * grip).normalize();
		}
	}

	/** Deletes edgeless nodes that were left alone and are no longer held. */
	private pruneOrphans() {
		for (const id of Array.from(this.orphans)) {
			const node = this.nodes.get(id);
			if (!node) {
				this.orphans.delete(id);
			} else if (node.heldBy === undefined) {
				this.removeNode(id);
			}
		}
	}

	private removeEdge(key: string) {
		const edge = this.edges.get(key);
		if (!edge || !this.edges.delete(key)) return;
		for (const node of [edge.source, edge.target]) {
			if (!this.hasEdges(node)) this.orphans.add(node.id);
		}
		this.topologyVersion++;
	}

	hasEdges(node: PhysicsNode) {
		for (const edge of this.edges.values()) if (edge.source === node || edge.target === node) return true;
		return false;
	}

	/** Makes a body from nodes already in ring order and joins every pair of them. */
	private addBody(nodes: PhysicsNode[]) {
		const body: Body = { id: this.nextBodyId++, nodes: [...nodes] };
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) this.joinRigidly(nodes[i], nodes[j]);
		}
		const swatch = this.colorIndex++;
		for (const node of nodes) {
			node.body = body;
			this.paint(node, swatch);
		}
		this.bodies.set(body.id, body);
		this.topologyVersion++;
		return body;
	}

	/** An edge that holds the pair's current distance. */
	private joinRigidly(a: PhysicsNode, b: PhysicsNode) {
		this.addEdge(a.id, b.id);
		const edge = this.edges.get(edgeKey(a.id, b.id));
		if (edge) edge.restLength = this.clampRestLength(a.position.angleTo(b.position));
	}

	/** Frees a body's nodes: its diagonals go and the outline stays as loose edges. */
	private dissolveBody(body: Body) {
		const { nodes } = body;
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 2; j < nodes.length; j++) {
				if (i === 0 && j === nodes.length - 1) continue;
				this.edges.delete(edgeKey(nodes[i].id, nodes[j].id));
			}
		}
		for (const node of nodes) node.body = undefined;
		this.bodies.delete(body.id);
		this.topologyVersion++;
	}
}
