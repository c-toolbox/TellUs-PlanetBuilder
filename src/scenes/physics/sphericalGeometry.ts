import * as THREE from "three";
import { UP } from "@/constants";

// Smallest sine-distance every vertex must keep from the other edges' great circles.
const CONVEX_MARGIN = 0.01;
const MIN_CENTER_COSINE = 0.1;

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

/** True when the points, in ring order, bound a strictly convex spherical polygon. */
export function isConvexRing(points: readonly THREE.Vector3[]) {
	const count = points.length;
	if (count < 3) return false;
	const center = new THREE.Vector3();
	if (!meanDirection(points, center)) return false;
	if (points.some((point) => point.dot(center) < MIN_CENTER_COSINE)) return false;
	const normal = new THREE.Vector3();
	for (let i = 0; i < count; i++) {
		const next = (i + 1) % count;
		normal.crossVectors(points[i], points[next]);
		if (normal.lengthSq() < 1e-12) return false;
		normal.normalize();
		if (normal.dot(center) < 0) normal.negate();
		for (let j = 0; j < count; j++) {
			if (j === i || j === next) continue;
			if (normal.dot(points[j]) < CONVEX_MARGIN) return false;
		}
	}
	return true;
}

/** Indices that order the points around their centre, or undefined unless they are in convex position. */
export function convexOrder(points: readonly THREE.Vector3[]) {
	const center = new THREE.Vector3();
	if (!meanDirection(points, center)) return;
	const east = new THREE.Vector3().crossVectors(UP, center);
	if (east.lengthSq() < 1e-6) east.set(0, 0, 1);
	east.normalize();
	const north = new THREE.Vector3().crossVectors(center, east);
	const angles = points.map((point) => Math.atan2(point.dot(north), point.dot(east)));
	const order = points.map((_, index) => index).sort((a, b) => angles[a] - angles[b]);
	return isConvexRing(order.map((index) => points[index])) ? order : undefined;
}
