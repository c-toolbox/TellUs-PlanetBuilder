import * as THREE from "three";

interface CurvePanelOptions {
	/** Maximum horizontal triangle span before bending, in panel units. */
	maxSegmentWidth?: number;
}

export interface PanelCurve {
	/** Bend around a cylinder with axis Y, centered at (0, 0, radius) in panel space. */
	setRadius(radius: number): void;
}

/** Capture a static model's flat shape so it can be bent around Y at any radius,
 * preserving mesh identities for raycasting.
 * Call after positioning/scaling the model inside its panel group; the meshes'
 * transforms relative to the panel must stay fixed afterwards.
 * Panel +Z faces the viewer; the plane z=0 becomes a cylinder of radius R.
 * Only meshes under `root` are bent; it defaults to the whole panel.
 * Nothing is bent until setRadius is called.
 */
export function createPanelCurve(panel: THREE.Object3D, {
	maxSegmentWidth = 0.04,
}: CurvePanelOptions = {}, root: THREE.Object3D = panel): PanelCurve {
	if (maxSegmentWidth <= 0) {
		throw new Error("Panel segment width must be positive");
	}
	const bends: ((radius: number) => void)[] = [];
	panel.updateWorldMatrix(true, true);
	const panelInverse = panel.matrixWorld.clone().invert();
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		const original = object.geometry;
		const source = original.index ? original.toNonIndexed() : original.clone();
		const toPanel = new THREE.Matrix4().multiplyMatrices(panelInverse, object.matrixWorld);
		const fromPanel = toPanel.clone().invert();
		source.applyMatrix4(toPanel);
		const names = Object.keys(source.attributes);
		const output: Record<string, number[]> = {};
		for (const name of names) output[name] = [];
		type Vertex = Record<string, number[]>;
		const read = (index: number): Vertex => Object.fromEntries(names.map((name) => {
			const attribute = source.getAttribute(name);
			return [name, Array.from({ length: attribute.itemSize }, (_, component) =>
				attribute.getComponent(index, component))];
		}));
		const emit = (a: Vertex, b: Vertex, c: Vertex): void => {
			for (const vertex of [a, b, c]) {
				for (const name of names) output[name].push(...vertex[name]);
			}
		};
		const clip = (vertices: Vertex[], x: number, keepRight: boolean): Vertex[] => {
			if (vertices.length === 0) return [];
			const result: Vertex[] = [];
			let previous = vertices[vertices.length - 1];
			let previousInside = keepRight ? previous.position[0] >= x : previous.position[0] <= x;
			for (const current of vertices) {
				const inside = keepRight ? current.position[0] >= x : current.position[0] <= x;
				if (inside !== previousInside) {
					const t = (x - previous.position[0]) / (current.position[0] - previous.position[0]);
					if (t > 0 && t < 1) {
						const intersection: Vertex = Object.fromEntries(names.map((name) => [
							name, previous[name].map((value, index) => value + (current[name][index] - value) * t),
						]));
						intersection.position[0] = x;
						result.push(intersection);
					}
				}
				if (inside) result.push(current);
				previous = current;
				previousInside = inside;
			}
			return result;
		};
		const subdivide = (a: Vertex, b: Vertex, c: Vertex): void => {
			const minX = Math.min(a.position[0], b.position[0], c.position[0]);
			const maxX = Math.max(a.position[0], b.position[0], c.position[0]);
			const firstStrip = Math.floor(minX / maxSegmentWidth);
			const lastStrip = Math.ceil(maxX / maxSegmentWidth) - 1;
			if (firstStrip === lastStrip || maxX - minX < 1e-9) {
				emit(a, b, c);
				return;
			}
			// Slice only across X, where the model bends. Shared strip boundaries
			// keep adjoining triangles aligned without subdividing flat directions.
			for (let strip = firstStrip; strip <= lastStrip; strip++) {
				const polygon = clip(clip([a, b, c], strip * maxSegmentWidth, true),
					(strip + 1) * maxSegmentWidth, false);
				for (let i = 1; i + 1 < polygon.length; i++) {
					emit(polygon[0], polygon[i], polygon[i + 1]);
				}
			}
		};
		const geometry = new THREE.BufferGeometry();
		const groups = source.groups.length ? source.groups : [{ start: 0, count: source.getAttribute("position").count, materialIndex: 0 }];
		for (const group of groups) {
			const start = output.position.length / 3;
			for (let i = group.start; i < group.start + group.count; i += 3) {
				subdivide(read(i), read(i + 1), read(i + 2));
			}
			geometry.addGroup(start, output.position.length / 3 - start, group.materialIndex);
		}
		for (const name of names) {
			geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[name], source.getAttribute(name).itemSize));
		}
		const positions = geometry.getAttribute("position");
		const normals = geometry.getAttribute("normal");
		const flatPositions = Float32Array.from(positions.array);
		const flatNormals = normals && Float32Array.from(normals.array);
		const normal = new THREE.Vector3();
		bends.push((radius) => {
			for (let i = 0; i < positions.count; i++) {
				const x = flatPositions[i * 3], y = flatPositions[i * 3 + 1], z = flatPositions[i * 3 + 2];
				const angle = x / radius;
				const radialDistance = radius - z;
				const sin = Math.sin(angle), cos = Math.cos(angle);
				positions.setXYZ(i, radialDistance * sin, y, radius - radialDistance * cos);
				if (normals && flatNormals) {
					// Inverse transpose of the warp Jacobian keeps authored hard edges
					// while producing smooth lighting across subdivided curved faces.
					const nx = flatNormals[i * 3] * radius / radialDistance;
					const ny = flatNormals[i * 3 + 1], nz = flatNormals[i * 3 + 2];
					normal.set(cos * nx - sin * nz, ny, sin * nx + cos * nz).normalize();
					normals.setXYZ(i, normal.x, normal.y, normal.z);
				}
			}
			geometry.applyMatrix4(fromPanel);
			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
		});
		object.geometry = geometry;
		source.dispose();
		// The source asset may share geometries between meshes; leave originals alone.
	});
	return {
		setRadius(radius) {
			if (radius <= 0) throw new Error("Panel radius must be positive");
			for (const bend of bends) bend(radius);
		},
	};
}
