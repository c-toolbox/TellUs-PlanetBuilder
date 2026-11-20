import * as THREE from "three";
import { UP } from "@/constants";
import type { PhysicsNode } from "./PhysicsWorld";

/**
 * Collision shapes on the unit sphere, resolved by moving nodes (position based dynamics).
 * A segment or polygon edge lies on a great circle, so every test reduces to plane tests.
 */
export interface Collider {
	readonly kind: "point" | "segment" | "polygon";
	readonly nodes: readonly PhysicsNode[];
	/** Skin thickness added to the geometry, in radians. */
	readonly radius: number;
	readonly center: THREE.Vector3;
	/** Angular radius of the bounding cap, skin included. */
	cap: number;
	/** False while the shape is degenerate. */
	valid: boolean;
	/** Segment: plane normal. Polygon: inward normal of every edge i -> i + 1. */
	readonly normals: THREE.Vector3[];
	/** Pieces of one concave body share an owner and never collide with each other. */
	readonly owner?: object;
	/** Polygon edges that are only seams between pieces of the owner: nothing can touch or leave through them. */
	readonly seams: readonly boolean[];
}

/** A touching pair, kept so the solver can bounce it: the relative velocity along `normal` is the sum of weight * velocity. */
export interface Contact {
	readonly nodes: readonly PhysicsNode[];
	readonly weights: readonly number[];
	/** Tangent at the first node pointing away from the other shape. */
	readonly normal: THREE.Vector3;
}

const vector = () => new THREE.Vector3();
// Separate scratch sets so the nested helpers never overwrite each other.
const edge = { plane: vector(), foot: vector(), cross: vector(), tangent: vector(), rel: vector(), da: vector(), db: vector() };
const probe = { foot: vector(), cross: vector(), outward: vector(), plane: vector() };
const point = { u: vector(), v: vector() };
const crossing = { m: vector(), mPrev: vector(), m1: vector(), m2: vector(), choice: vector() };

export const inverseMass = (node: PhysicsNode) => (node.heldBy === undefined && !node.frozen ? 1 : 0);

export function createCollider(
	kind: Collider["kind"], nodes: readonly PhysicsNode[], radius: number, owner?: object, seams: readonly boolean[] = [],
): Collider {
	const normals = kind === "polygon" ? nodes.map(vector) : kind === "segment" ? [vector()] : [];
	return { kind, nodes, radius, center: vector(), cap: 0, valid: true, normals, owner, seams };
}

function planeNormal(a: THREE.Vector3, b: THREE.Vector3, result: THREE.Vector3) {
	result.crossVectors(a, b);
	if (result.lengthSq() < 1e-10) return false;
	result.normalize();
	return true;
}

export function updateCollider(collider: Collider) {
	const { nodes, center, normals } = collider;
	center.set(0, 0, 0);
	for (const node of nodes) center.add(node.position);
	if (center.lengthSq() < 1e-6) center.copy(nodes[0].position);
	else center.normalize();
	let cap = 0;
	for (const node of nodes) cap = Math.max(cap, center.angleTo(node.position));
	collider.cap = cap + collider.radius;
	collider.valid = true;
	if (collider.kind === "segment") {
		collider.valid = planeNormal(nodes[0].position, nodes[1].position, normals[0]);
	} else if (collider.kind === "polygon") {
		for (let i = 0; i < nodes.length; i++) {
			if (!planeNormal(nodes[i].position, nodes[(i + 1) % nodes.length].position, normals[i])) {
				collider.valid = false;
			} else if (normals[i].dot(center) < 0) {
				normals[i].negate();
			}
		}
	}
}

/** Tangent at `from` pointing away from `other`. */
function away(from: THREE.Vector3, other: THREE.Vector3, result: THREE.Vector3) {
	result.copy(other).addScaledVector(from, -from.dot(other)).negate();
	if (result.lengthSq() < 1e-12) {
		result.crossVectors(UP, from);
		if (result.lengthSq() < 1e-12) result.set(0, 0, 1);
	}
	return result.normalize();
}

/** Separates two circles of the given combined radius. */
function pushApart(p: PhysicsNode, other: PhysicsNode, margin: number, contacts?: Contact[]) {
	const distance = p.position.angleTo(other.position);
	if (distance >= margin) return false;
	const wp = inverseMass(p), wo = inverseMass(other);
	if (wp + wo === 0) return true;
	const lambda = (margin - distance) / (wp + wo);
	away(p.position, other.position, point.u);
	away(other.position, p.position, point.v);
	contacts?.push({ nodes: [p, other], weights: [1, -1], normal: point.u.clone() });
	p.position.addScaledVector(point.u, lambda * wp).normalize();
	other.position.addScaledVector(point.v, lambda * wo).normalize();
	return true;
}

/**
 * Moves `p` along `direction` (the plane normal pointing from the edge towards `p`) and the edge
 * the opposite way, then removes sliding between them up to the friction limit.
 */
function pushEdge(
	p: PhysicsNode, a: PhysicsNode, b: PhysicsNode, direction: THREE.Vector3, depth: number, friction: number,
	contacts?: Contact[],
) {
	const wp = inverseMass(p), wa = inverseMass(a), wb = inverseMass(b);
	const { plane, foot, cross, tangent, rel, da, db } = edge;
	let t = 0.5;
	plane.crossVectors(a.position, b.position);
	if (plane.lengthSq() > 1e-12) {
		plane.normalize();
		foot.copy(p.position).addScaledVector(plane, -plane.dot(p.position));
		const along = Math.atan2(cross.crossVectors(a.position, foot).dot(plane), a.position.dot(foot));
		t = THREE.MathUtils.clamp(along / a.position.angleTo(b.position), 0, 1);
	}
	const total = wp + (1 - t) * (1 - t) * wa + t * t * wb;
	if (total < 1e-9) return;
	const lambda = depth / total;
	tangent.copy(direction).addScaledVector(p.position, -direction.dot(p.position));
	if (tangent.lengthSq() < 1e-12) tangent.copy(direction);
	else tangent.normalize();
	contacts?.push({ nodes: [p, a, b], weights: [1, -(1 - t), -t], normal: tangent.clone() });
	p.position.addScaledVector(tangent, lambda * wp).normalize();
	a.position.addScaledVector(direction, -lambda * wa * (1 - t)).normalize();
	b.position.addScaledVector(direction, -lambda * wb * t).normalize();
	if (friction <= 0) return;

	rel.copy(p.position).sub(p.previous)
		.addScaledVector(da.copy(a.position).sub(a.previous), -(1 - t))
		.addScaledVector(db.copy(b.position).sub(b.previous), -t);
	rel.addScaledVector(direction, -rel.dot(direction)).addScaledVector(p.position, -rel.dot(p.position));
	const slide = rel.length();
	if (slide < 1e-12) return;
	rel.multiplyScalar(Math.min(1, (friction * depth) / slide));
	p.position.addScaledVector(rel, -wp / total).normalize();
	a.position.addScaledVector(rel, ((1 - t) * wa) / total).normalize();
	b.position.addScaledVector(rel, (t * wb) / total).normalize();
}

/** Angular distance from a point to the arc a-b, whose great circle has the given normal. */
function distanceToArc(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, plane: THREE.Vector3) {
	const side = plane.dot(p);
	const { foot, cross } = probe;
	foot.copy(p).addScaledVector(plane, -side);
	const along = Math.atan2(cross.crossVectors(a, foot).dot(plane), a.dot(foot));
	if (along >= 0 && along <= a.angleTo(b)) return Math.asin(Math.min(1, Math.abs(side)));
	return Math.min(p.angleTo(a), p.angleTo(b));
}

/** Resolves a node (a circle of the given margin around it) against the arc a-b with great circle normal `normal`. */
function pointVsArc(
	p: PhysicsNode, a: PhysicsNode, b: PhysicsNode, normal: THREE.Vector3, margin: number, friction: number,
	contacts?: Contact[],
) {
	const side = normal.dot(p.position);
	if (Math.abs(side) >= margin) return false;
	const { foot, cross } = probe;
	foot.copy(p.position).addScaledVector(normal, -side);
	const along = Math.atan2(cross.crossVectors(a.position, foot).dot(normal), a.position.dot(foot));
	if (along < 0 || along > a.position.angleTo(b.position)) {
		return pushApart(p, along < 0 ? a : b, margin, contacts);
	}
	const depth = margin - Math.asin(Math.abs(side));
	if (depth <= 0) return false;
	pushEdge(p, a, b, probe.outward.copy(normal).multiplyScalar(side < 0 ? -1 : 1), depth, friction, contacts);
	return true;
}

/** Resolves a node (a circle of `radius`) against a collider; true when they touched. */
function pointVsCollider(p: PhysicsNode, radius: number, other: Collider, friction: number, contacts?: Contact[]) {
	const margin = radius + other.radius;
	const { nodes, normals } = other;
	if (other.kind === "point") return pushApart(p, nodes[0], margin, contacts);
	if (other.kind === "segment") return pointVsArc(p, nodes[0], nodes[1], normals[0], margin, friction, contacts);

	if (normals.some((normal) => normal.dot(p.position) < 0)) {
		// Outside the polygon: only its outline, with a rounded skin, can be touched. Widening the half planes
		// instead would reach far past sharp corners.
		let nearest = -1, nearestDistance = margin;
		for (let i = 0; i < nodes.length; i++) {
			if (other.seams[i] || !planeNormal(nodes[i].position, nodes[(i + 1) % nodes.length].position, probe.plane)) continue;
			const distance = distanceToArc(p.position, nodes[i].position, nodes[(i + 1) % nodes.length].position, probe.plane);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearest = i;
			}
		}
		if (nearest < 0) return false;
		const a = nodes[nearest], b = nodes[(nearest + 1) % nodes.length];
		planeNormal(a.position, b.position, probe.plane);
		return pointVsArc(p, a, b, probe.plane, margin, friction, contacts);
	}

	let best = Infinity, index = -1;
	for (let i = 0; i < nodes.length; i++) {
		if (other.seams[i]) continue;
		const penetration = Math.asin(THREE.MathUtils.clamp(normals[i].dot(p.position), -1, 1)) + margin;
		if (penetration < best) {
			best = penetration;
			index = i;
		}
	}
	if (index < 0) return false;
	// Leave through the nearest edge.
	pushEdge(
		p, nodes[index], nodes[(index + 1) % nodes.length], probe.outward.copy(normals[index]).negate(), best, friction,
		contacts,
	);
	return true;
}

/** Edges that cross without any node touching: separate along the plane an endpoint just crossed. */
function resolveCrossing(
	a1: PhysicsNode, b1: PhysicsNode, a2: PhysicsNode, b2: PhysicsNode, margin: number, friction: number,
	contacts?: Contact[],
) {
	const { m, mPrev, choice } = crossing;
	const best: { score: number; depth: number; node?: PhysicsNode; from?: PhysicsNode; to?: PhysicsNode } = {
		score: Infinity, depth: 0,
	};
	const test = (u: PhysicsNode, c: PhysicsNode, d: PhysicsNode) => {
		m.crossVectors(c.position, d.position).normalize();
		const now = m.dot(u.position);
		mPrev.crossVectors(c.previous, d.previous);
		const before = mPrev.lengthSq() > 1e-12 ? mPrev.normalize().dot(u.previous) : now;
		const flipped = now * before < 0;
		const reach = Math.abs(now) + margin;
		// Endpoints that really crossed go first; the rest is a fallback for overlaps that began inside.
		const score = flipped ? reach : reach + 10;
		if (score >= best.score) return;
		best.score = score;
		best.depth = reach;
		best.node = u;
		best.from = c;
		best.to = d;
		choice.copy(m).multiplyScalar((flipped ? before : now) < 0 ? -1 : 1);
	};
	test(a1, a2, b2);
	test(b1, a2, b2);
	test(a2, a1, b1);
	test(b2, a1, b1);
	if (best.node && best.from && best.to) pushEdge(best.node, best.from, best.to, choice, best.depth, friction, contacts);
}

const edgeCount = (collider: Collider) =>
	collider.kind === "polygon" ? collider.nodes.length : collider.kind === "segment" ? 1 : 0;

/** True when each arc's endpoints lie on opposite sides of the other arc's great circle. */
function straddles(a1: PhysicsNode, b1: PhysicsNode, a2: PhysicsNode, b2: PhysicsNode) {
	const { m1, m2 } = crossing;
	if (!planeNormal(a1.position, b1.position, m1) || !planeNormal(a2.position, b2.position, m2)) return false;
	return m1.dot(a2.position) * m1.dot(b2.position) < 0 && m2.dot(a1.position) * m2.dot(b1.position) < 0;
}

export function collidePair(a: Collider, b: Collider, friction: number, contacts?: Contact[]) {
	if (!a.valid || !b.valid) return;
	if (a.owner && a.owner === b.owner) return;
	if (a.center.angleTo(b.center) > a.cap + b.cap) return;
	// Shapes that share a node are joined together and never collide.
	if (a.nodes.some((node) => b.nodes.includes(node))) return;
	let touched = false;
	for (const node of a.nodes) touched = pointVsCollider(node, a.radius, b, friction, contacts) || touched;
	for (const node of b.nodes) touched = pointVsCollider(node, b.radius, a, friction, contacts) || touched;
	if (touched) return;
	for (let i = 0; i < edgeCount(a); i++) {
		for (let j = 0; j < edgeCount(b); j++) {
			if (a.seams[i] || b.seams[j]) continue;
			const a1 = a.nodes[i], b1 = a.nodes[(i + 1) % a.nodes.length];
			const a2 = b.nodes[j], b2 = b.nodes[(j + 1) % b.nodes.length];
			if (!straddles(a1, b1, a2, b2)) continue;
			resolveCrossing(a1, b1, a2, b2, a.radius + b.radius, friction, contacts);
			return;
		}
	}
}
