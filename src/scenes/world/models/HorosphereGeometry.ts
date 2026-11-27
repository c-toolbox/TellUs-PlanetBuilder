import { polygonModel, type PolyhedronModel } from "./geometry";

export const HOROSPHERE_HEX_SIZE = 0.08950019371023245;
export const HOROSPHERE_FOV = 300;
const CORNERS = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]];

/** Count complete lattice cells without building coordinates, before budget fitting. */
export function horosphereFaceCount(size: number, fov = HOROSPHERE_FOV): number {
	if (!Number.isFinite(size) || size <= 0 || size >= 1
		|| !Number.isFinite(fov) || fov <= 0 || fov >= 360) {
		throw new Error("Invalid horosphere size or FOV.");
	}
	const radius = Math.tan(fov * Math.PI / 720) / size + 1;
	const rows = Math.floor(radius / 1.5);
	let count = 0;
	for (let row = -rows; row <= rows; row++) {
		const halfWidth = Math.sqrt(Math.max(0, radius * radius / 3 - 0.75 * row * row));
		count += Math.floor(-row / 2 + halfWidth) - Math.ceil(-row / 2 - halfWidth) + 1;
	}
	return count;
}

/** Full aperture inside the jagged rim, including the interiors of straight edges. */
export function polarCoverage(model: PolyhedronModel): number {
	const incidence = new Map<string, { a: number; b: number; count: number }>();
	for (const face of model.faces) {
		face.forEach((a, i) => {
			const b = face[(i + 1) % face.length];
			const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
			const edge = incidence.get(key);
			if (edge) edge.count++;
			else incidence.set(key, { a, b, count: 1 });
		});
	}
	let maximumY = -1;
	for (const edge of incidence.values()) {
		if (edge.count !== 1) continue;
		const a = model.vertices[edge.a], b = model.vertices[edge.b];
		const d = b.map((component, i) => component - a[i]);
		const aa = a.reduce((sum, component) => sum + component * component, 0);
		const ad = a.reduce((sum, component, i) => sum + component * d[i], 0);
		const dd = d.reduce((sum, component) => sum + component * component, 0);
		const denominator = d[1] * ad - a[1] * dd;
		const t = denominator === 0 ? -1 : (a[1] * ad - d[1] * aa) / denominator;
		for (const p of t > 0 && t < 1 ? [0, 1, t] : [0, 1]) {
			maximumY = Math.max(maximumY, (a[1] + p * d[1]) / Math.sqrt(aa + 2 * p * ad + p * p * dd));
		}
	}
	return 2 * Math.acos(Math.max(-1, Math.min(1, maximumY))) * 180 / Math.PI;
}

/** Same integer lattice and budget fitting as the offline Python exporter. */
export function generateHorosphere(
	hexSize = HOROSPHERE_HEX_SIZE,
	fov = HOROSPHERE_FOV,
	maxFaces = 5000,
): PolyhedronModel {
	if (!Number.isFinite(hexSize) || hexSize <= 0 || hexSize >= 1
		|| !Number.isFinite(fov) || fov <= 0 || fov >= 360
		|| !Number.isInteger(maxFaces) || maxFaces < 1 || maxFaces > 5000) {
		throw new Error("Invalid horosphere size, FOV, or face budget (maximum 5000).");
	}
	const radius = Math.tan(fov * Math.PI / 720);
	const extent = Math.ceil(Math.sqrt(maxFaces));
	const centers: [norm: number, row: number, column: number][] = [];
	for (let row = -extent; row <= extent; row++) {
		for (let column = -extent; column <= extent; column++) {
			centers.push([column * column + column * row + row * row, row, column]);
		}
	}
	centers.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
	const count = (size: number) => {
		const limit = (radius / size + 1) ** 2 / 3;
		let lower = 0, upper = centers.length;
		while (lower < upper) {
			const middle = (lower + upper) >>> 1;
			if (centers[middle][0] <= limit) lower = middle + 1;
			else upper = middle;
		}
		return lower;
	};
	let size = hexSize;
	if (count(size) > maxFaces) {
		let lower = size, upper = 1 - Number.EPSILON;
		if (count(upper) > maxFaces) throw new Error("Horosphere FOV cannot fit the face budget.");
		for (let i = 0; i < 60; i++) {
			const middle = (lower + upper) / 2;
			if (count(middle) > maxFaces) lower = middle;
			else upper = middle;
		}
		size = upper;
	}
	const vertices: number[][] = [];
	const indices = new Map<string, number>();
	const faces = centers.slice(0, count(size)).map(([, row, column]) =>
		CORNERS.map(([dx, dz]) => {
			const x = 2 * column + row + dx, z = 3 * row + dz;
			const key = `${x}_${z}`;
			if (!indices.has(key)) {
				const u = Math.sqrt(3) * size * x / 2, v = size * z / 2;
				const r2 = u * u + v * v;
				indices.set(key, vertices.length);
				vertices.push([2 * u, 1 - r2, 2 * v].map(value => Math.round(value / (1 + r2) * 1e12) / 1e12));
			}
			return indices.get(key)!;
		}),
	);
	const model = polygonModel(vertices, faces);
	if (polarCoverage(model) + 1e-7 < fov) throw new Error("Horosphere rim does not enclose the requested FOV.");
	return model;
}
