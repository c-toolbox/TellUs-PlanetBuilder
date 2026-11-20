import * as THREE from "three";
import { UP } from "@/constants";

const MIN_CENTER_COSINE = 0.1;
// Smallest sine of the turn at a vertex, and smallest gap between edges that do not touch.
const MIN_TURN = 0.02;
const EDGE_MARGIN = 0.01;

/** Deterministic great-circle plane, including coincident/antipodal endpoints. */
export function arcNormal(a: THREE.Vector3, b: THREE.Vector3, result: THREE.Vector3) {
	result.crossVectors(a, b);
	if (result.lengthSq() < 1e-12) {
		const axis = Math.abs(a.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
		result.crossVectors(a, axis);
	}
	return result.normalize();
}

/** Normalised mean direction; false when the points do not share a hemisphere. */
function meanDirection(points: readonly THREE.Vector3[], result: THREE.Vector3) {
	result.set(0, 0, 0);
	for (const point of points) result.add(point);
	if (result.length() < points.length * 0.3) return false;
	result.normalize();
	return true;
}

/** How a simple polygon is cut up for collision and drawing; all numbers index into the ring. */
export interface RingShape {
	readonly triangles: number[][];
	/** Convex pieces made by merging triangles. */
	readonly pieces: number[][];
	/** Rough size, to compare different rings through the same points. */
	readonly area: number;
}

interface Planar {
	x: number;
	y: number;
}

const cross = (o: Planar, a: Planar, b: Planar) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Gnomonic projection about the mean direction: great circles become straight lines. */
function project(points: readonly THREE.Vector3[]): Planar[] | undefined {
	const center = new THREE.Vector3();
	if (!meanDirection(points, center)) return;
	if (points.some((point) => point.dot(center) < MIN_CENTER_COSINE)) return;
	const east = new THREE.Vector3().crossVectors(UP, center);
	if (east.lengthSq() < 1e-6) east.set(0, 0, 1);
	east.normalize();
	const north = new THREE.Vector3().crossVectors(center, east);
	return points.map((point) => {
		const depth = point.dot(center);
		return { x: point.dot(east) / depth, y: point.dot(north) / depth };
	});
}

function distanceToSegment(p: Planar, a: Planar, b: Planar) {
	const dx = b.x - a.x, dy = b.y - a.y;
	const t = THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
	return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function segmentDistance(a: Planar, b: Planar, c: Planar, d: Planar) {
	if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
	return Math.min(
		distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b),
	);
}

/** A ring that never touches itself and has no straight or folded-back corners. */
function isSimple(p: readonly Planar[]) {
	const n = p.length;
	for (let i = 0; i < n; i++) {
		const prev = p[(i + n - 1) % n], cur = p[i], next = p[(i + 1) % n];
		const lengths = Math.hypot(cur.x - prev.x, cur.y - prev.y) * Math.hypot(next.x - cur.x, next.y - cur.y);
		if (lengths < 1e-9 || Math.abs(cross(prev, cur, next)) / lengths < MIN_TURN) return false;
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue;
			if (segmentDistance(cur, next, p[j], p[(j + 1) % n]) < EDGE_MARGIN) return false;
		}
	}
	return true;
}

/** Ear clipping of a counter-clockwise ring given as indices into `p`. */
function triangulate(p: readonly Planar[], order: readonly number[]) {
	const remaining = [...order];
	const triangles: number[][] = [];
	const inside = (q: Planar, a: Planar, b: Planar, c: Planar) =>
		cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0;
	while (remaining.length > 3) {
		const count = remaining.length;
		let clipped = false;
		for (let k = 0; k < count && !clipped; k++) {
			const a = remaining[(k + count - 1) % count], b = remaining[k], c = remaining[(k + 1) % count];
			if (cross(p[a], p[b], p[c]) <= 0) continue;
			if (remaining.some((i) => i !== a && i !== b && i !== c && inside(p[i], p[a], p[b], p[c]))) continue;
			triangles.push([a, b, c]);
			remaining.splice(k, 1);
			clipped = true;
		}
		if (!clipped) return;
	}
	triangles.push(remaining);
	return triangles;
}

/** The union of two pieces across an edge they share, as a ring. */
function joinPieces(first: readonly number[], second: readonly number[]) {
	for (let i = 0; i < first.length; i++) {
		const u = first[i], v = first[(i + 1) % first.length];
		const j = second.findIndex((index, k) => index === v && second[(k + 1) % second.length] === u);
		if (j < 0) continue;
		const merged: number[] = [];
		for (let k = 1; k <= first.length; k++) merged.push(first[(i + k) % first.length]);
		for (let k = 2; k < second.length; k++) merged.push(second[(j + k) % second.length]);
		return merged;
	}
}

function mergePieces(p: readonly Planar[], triangles: readonly number[][]) {
	const pieces = triangles.map((triangle) => [...triangle]);
	const convex = (ring: readonly number[]) =>
		ring.every((_, k) => cross(p[ring[(k + ring.length - 1) % ring.length]], p[ring[k]], p[ring[(k + 1) % ring.length]]) >= -1e-9);
	let merged = true;
	while (merged) {
		merged = false;
		for (let a = 0; a < pieces.length && !merged; a++) {
			for (let b = a + 1; b < pieces.length && !merged; b++) {
				const union = joinPieces(pieces[a], pieces[b]);
				if (!union || !convex(union)) continue;
				pieces[a] = union;
				pieces.splice(b, 1);
				merged = true;
			}
		}
	}
	return pieces;
}

/** Cuts a ring (convex or concave) into triangles and convex pieces; undefined unless it is a clean simple polygon. */
export function ringShape(points: readonly THREE.Vector3[]): RingShape | undefined {
	if (points.length < 3) return;
	const planar = project(points);
	if (!planar || !isSimple(planar)) return;
	let doubleArea = 0;
	planar.forEach((a, i) => {
		const b = planar[(i + 1) % planar.length];
		doubleArea += a.x * b.y - b.x * a.y;
	});
	const order = planar.map((_, i) => i);
	if (doubleArea < 0) order.reverse();
	const triangles = triangulate(planar, order);
	if (!triangles) return;
	return { triangles, pieces: mergePieces(planar, triangles), area: Math.abs(doubleArea) / 2 };
}
