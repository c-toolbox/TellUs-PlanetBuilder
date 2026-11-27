import { generateGeodesic, triangulationNumber } from "./GeodesicGeometry";
import { polarDual, type PolyhedronModel } from "./geometry";

export function goldbergFaceCount(h: number, k = 0): number {
	return 10 * triangulationNumber(h, k) + 2;
}

/** Polar dual of a geodesic: twelve pentagons, with hexagons everywhere else. */
export function generateGoldberg(h: number, k = 0): PolyhedronModel {
	const model = polarDual(generateGeodesic(h, k));
	if (model.faces.some(face => face.length !== 5 && face.length !== 6)) {
		throw new Error("Goldberg construction requires pentagons and hexagons only.");
	}
	return model;
}
