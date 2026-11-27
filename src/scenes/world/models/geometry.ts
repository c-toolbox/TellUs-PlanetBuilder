import { Vector3 } from "three";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";

/** Shared polygon topology used by rendering, tile identity, and border adjacency. */
export interface PolyhedronModel {
	vertices: number[][];
	edges: number[][];
	faces: number[][];
}

export function polygonModel(vertices: number[][], faces: number[][]): PolyhedronModel {
	const edges = new Map<string, number[]>();
	for (const face of faces) {
		for (let i = 0; i < face.length; i++) {
			const a = face[i], b = face[(i + 1) % face.length];
			const low = Math.min(a, b), high = Math.max(a, b);
			edges.set(`${low}_${high}`, [low, high]);
		}
	}
	return { vertices, edges: Array.from(edges.values()), faces };
}

/** For sites on the unit sphere, the hull gives their spherical Delaunay triangles. */
export function convexHullModel(points: Vector3[]): PolyhedronModel {
	const hull = new ConvexHull().setFromPoints(points);
	const pointIndices = new Map(points.map((point, index) => [point, index]));
	const faces = hull.faces.map(face => {
		const polygon = [];
		let edge = face.edge;
		do {
			polygon.push(pointIndices.get(edge.head().point)!);
			edge = edge.next;
		} while (edge !== face.edge);
		return polygon;
	});
	return polygonModel(points.map(point => point.toArray()), faces);
}

/**
 * Dualize a closed, outward-wound triangular hull. Unit-sphere sites become
 * tangent planes; intersecting them produces flat polygon cells. Their radial
 * projection has the same boundaries as the spherical Voronoi diagram, because
 * each dual corner points along its Delaunay triangle's spherical circumcenter.
 */
export function polarDual(primal: PolyhedronModel): PolyhedronModel {
	const points = primal.vertices.map(point => new Vector3(...point));
	const incident = points.map(() => [] as number[]);
	const edgeFaces = new Map<string, number>();
	const corners = primal.faces.map((face, index) => {
		if (face.length !== 3) throw new Error("Polar dual requires a triangular hull.");
		face.forEach((vertex, i) => {
			incident[vertex].push(index);
			edgeFaces.set(`${vertex}_${face[(i + 1) % face.length]}`, index);
		});
		const [a, b, c] = face.map(vertex => points[vertex]);
		const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
		const distance = normal.dot(a);
		if (distance <= 1e-12) throw new Error("Polar hull must strictly enclose the origin.");
		return normal.divideScalar(distance);
	});
	// One common scale preserves planarity and places the outermost corners at radius 1.
	const scale = 1 / corners.reduce((radius, point) => Math.max(radius, point.length()), 0);
	for (const corner of corners) corner.multiplyScalar(scale);
	const faces = incident.map((neighbors, vertex) => {
		const face: number[] = [];
		let current = neighbors[0];
		do {
			face.push(current);
			const triangle = primal.faces[current];
			const i = triangle.indexOf(vertex);
			const previous = triangle[(i + triangle.length - 1) % triangle.length];
			const next = edgeFaces.get(`${vertex}_${previous}`);
			if (next === undefined || face.length > neighbors.length) {
				throw new Error("Cannot order the dual cell of an open or invalid hull.");
			}
			current = next;
		} while (current !== neighbors[0]);
		if (face.length !== neighbors.length) throw new Error("Disconnected dual cell.");
		return face;
	});
	return polygonModel(corners.map(point => point.toArray()), faces);
}
