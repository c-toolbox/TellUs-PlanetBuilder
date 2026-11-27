import { IcosahedronGeometry, Vector3 } from "three";
import { convexHullModel, polygonModel, type PolyhedronModel } from "./geometry";

/** T = h² + hk + k² is the icosahedral lattice subdivision number. */
export function triangulationNumber(h: number, k: number): number {
	if (!Number.isInteger(h) || !Number.isInteger(k) || h < 1 || k < 0) {
		throw new Error("Geodesic parameters must be integers with h >= 1 and k >= 0.");
	}
	const t = h * h + h * k + k * k;
	if (t > 4096) throw new Error("Triangulation number must not exceed 4096.");
	return t;
}

export function geodesicFaceCount(h: number, k = 0): number {
	return 20 * triangulationNumber(h, k);
}

function icosahedron(): PolyhedronModel {
	const geometry = new IcosahedronGeometry(1, 0);
	const positions = geometry.getAttribute("position");
	const vertices: number[][] = [];
	const faces: number[][] = [];
	const indices = new Map<string, number>();
	for (let i = 0; i < positions.count; i += 3) {
		const face = [];
		for (let j = 0; j < 3; j++) {
			const point = new Vector3().fromBufferAttribute(positions, i + j).normalize().toArray();
			const key = point.join(",");
			if (!indices.has(key)) {
				indices.set(key, vertices.length);
				vertices.push(point);
			}
			face.push(indices.get(key)!);
		}
		faces.push(face);
	}
	geometry.dispose();
	return polygonModel(vertices, faces);
}

const ICOSAHEDRON = icosahedron();

/**
 * Place an integer triangular lattice inside each icosahedral face, then compute
 * the spherical Delaunay triangulation as a 3D convex hull. Oblique (h,k) patches
 * share exact barycentric keys across seams, including class II and III models.
 */
export function generateGeodesic(h: number, k = 0): PolyhedronModel {
	const t = triangulationNumber(h, k);
	const corners = ICOSAHEDRON.vertices.map(point => new Vector3(...point));
	const points: Vector3[] = [];
	const indices = new Map<string, number>();
	for (const face of ICOSAHEDRON.faces) {
		// Lattice triangle: (0,0), (h,k), (-k,h+k). Its determinant is T.
		for (let u = -k; u <= h; u++) {
			for (let v = 0; v <= h + k; v++) {
				const b = (h + k) * u + k * v;
				const c = -k * u + h * v;
				const a = t - b - c;
				if (a < 0 || b < 0 || c < 0) continue;
				const weights = [a, b, c];
				const key = face.map((corner, i) => [corner, weights[i]])
					.filter(([, weight]) => weight > 0)
					.sort(([left], [right]) => left - right)
					.map(pair => pair.join(":"))
					.join(",");
				if (indices.has(key)) continue;
				const point = new Vector3();
				face.forEach((corner, i) => point.addScaledVector(corners[corner], weights[i] / t));
				indices.set(key, points.length);
				points.push(point.normalize());
			}
		}
	}

	const model = convexHullModel(points);
	if (points.length !== 10 * t + 2 || model.faces.length !== 20 * t) {
		throw new Error("Geodesic construction produced inconsistent topology.");
	}
	return model;
}
