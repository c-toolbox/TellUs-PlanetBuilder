import { Vector3 } from "three";
import { convexHullModel, polarDual, type PolyhedronModel } from "./geometry";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_POINTS = 40_962;

/**
 * Midpoint Fibonacci spiral: equal height steps and a golden-angle turn, +Y up.
 * The half-step offset avoids placing sites directly on the poles. The count
 * can be any integer in range; it need not belong to the Fibonacci sequence.
 * Reference: Marques et al., Spherical Fibonacci Point Sets, section 3:
 * https://ribardiere.pages.xlim.fr/articles/2013/CGF_SF.pdf
 */
export function fibonacciPoints(count: number): Vector3[] {
	if (!Number.isInteger(count) || count < 4 || count > MAX_POINTS) {
		throw new Error(`Fibonacci point count must be an integer between 4 and ${MAX_POINTS}.`);
	}
	return Array.from({ length: count }, (_, i) => {
		const y = 1 - (2 * i + 1) / count;
		const radius = Math.sqrt(1 - y * y);
		const angle = i * GOLDEN_ANGLE;
		return new Vector3(radius * Math.cos(angle), y, radius * Math.sin(angle));
	});
}

/**
 * One Voronoi cell per site. Hull triangles supply circumcenter directions,
 * and hull adjacency orders each cell without angle sorting. A planar polar
 * realization preserves these spherical boundaries in the origin-based renderer.
 * https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.SphericalVoronoi.html
 */
export function generateFibonacci(count: number): PolyhedronModel {
	return polarDual(convexHullModel(fibonacciPoints(count)));
}
