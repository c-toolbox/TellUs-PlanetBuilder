import * as THREE from "three";

interface CurvePanelOptions {
	/** Cylinder axis is Y; its center is at (0, 0, radius) in panel space. */
	radius: number;
	/** Maximum horizontal triangle span before bending, in panel units. */
	maxSegmentWidth?: number;
}

/** Bend a static model around Y, preserving mesh identities for raycasting.
 * Call once after positioning/scaling the model inside its panel group.
 * Panel +Z faces the viewer; the plane z=0 becomes a cylinder of radius R.
 */
export function curvePanel(panel: THREE.Object3D, {
	radius,
	maxSegmentWidth = 0.04,
}: CurvePanelOptions): void {
	if (radius <= 0 || maxSegmentWidth <= 0) {
		throw new Error("Panel radius and segment width must be positive");
	}
	panel.updateWorldMatrix(true, true);
	const panelInverse = panel.matrixWorld.clone().invert();
	panel.traverse((object) => {
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
		const normal = new THREE.Vector3();
		for (let i = 0; i < positions.count; i++) {
			const angle = positions.getX(i) / radius;
			const radialDistance = radius - positions.getZ(i);
			const sin = Math.sin(angle), cos = Math.cos(angle);
			positions.setXYZ(i, radialDistance * sin, positions.getY(i), radius - radialDistance * cos);
			if (normals) {
				// Inverse transpose of the warp Jacobian keeps authored hard edges
				// while producing smooth lighting across subdivided curved faces.
				normal.fromBufferAttribute(normals, i);
				const nx = normal.x * radius / radialDistance;
				normal.set(cos * nx - sin * normal.z, normal.y, sin * nx + cos * normal.z).normalize();
				normals.setXYZ(i, normal.x, normal.y, normal.z);
			}
		}
		geometry.applyMatrix4(fromPanel);
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		object.geometry = geometry;
		source.dispose();
		// The source asset may share geometries between meshes; leave originals alone.
	});
}
