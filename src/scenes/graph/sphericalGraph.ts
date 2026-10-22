import * as THREE from "three";

/** Deterministic great-circle plane, including coincident/antipodal endpoints. */
export function arcNormal(a: THREE.Vector3, b: THREE.Vector3, result: THREE.Vector3) {
	result.crossVectors(a, b);
	if (result.lengthSq() < 1e-12) {
		const axis = Math.abs(a.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
		result.crossVectors(a, axis);
	}
	return result.normalize();
}

function onArc(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
	return a.angleTo(point) + point.angleTo(b) <= a.angleTo(b) + 1e-6;
}

/** Proper crossing of the same minor arcs used to draw the edges. */
export function arcsCross(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
	if (a.angleTo(b) < 1e-6 || c.angleTo(d) < 1e-6) return false;
	const edgeNormal = arcNormal(c, d, new THREE.Vector3());
	if (a.dot(edgeNormal) * b.dot(edgeNormal) >= -1e-12) return false;
	const touchNormal = arcNormal(a, b, new THREE.Vector3());
	const intersection = new THREE.Vector3().crossVectors(touchNormal, edgeNormal);
	if (intersection.lengthSq() < 1e-12) return false;
	intersection.normalize();
	if (onArc(intersection, a, b) && onArc(intersection, c, d)) return true;
	intersection.negate();
	return onArc(intersection, a, b) && onArc(intersection, c, d);
}
