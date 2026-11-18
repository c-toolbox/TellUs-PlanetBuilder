import * as THREE from "three";
import { UP } from "@/constants";
import type { PhysicsModel } from "./PhysicsWorld";

const RADIUS = 0.26;
const LATITUDE = THREE.MathUtils.degToRad(25);
const SIDES = [3, 4, 5, 6];

/** Regular polygons (triangle to hexagon) spaced evenly around the sphere, dropped from above the floor. */
export function buildShapes(): PhysicsModel {
	const vertices: number[][] = [];
	const bodies: number[][] = [];
	SIDES.forEach((sides, index) => {
		const longitude = (index / SIDES.length) * Math.PI * 2;
		const center = new THREE.Vector3(
			Math.cos(LATITUDE) * Math.cos(longitude), Math.sin(LATITUDE), Math.cos(LATITUDE) * Math.sin(longitude),
		);
		const east = new THREE.Vector3().crossVectors(UP, center).normalize();
		const north = new THREE.Vector3().crossVectors(center, east);
		const body: number[] = [];
		for (let i = 0; i < sides; i++) {
			// Starting below the horizontal centre line leaves every polygon with a flat bottom.
			const angle = -Math.PI / 2 + Math.PI / sides + (i * 2 * Math.PI) / sides;
			const point = center.clone()
				.addScaledVector(east, Math.cos(angle) * RADIUS)
				.addScaledVector(north, Math.sin(angle) * RADIUS)
				.normalize();
			body.push(vertices.length);
			vertices.push(point.toArray());
		}
		bodies.push(body);
	});
	return { vertices, bodies };
}
