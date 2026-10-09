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
export function curvePanel(panel: THREE.Group, {
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
		const midpoint = (a: Vertex, b: Vertex): Vertex => Object.fromEntries(names.map((name) =>
			[name, a[name].map((value, index) => (value + b[name][index]) / 2)]));
		const emit = (a: Vertex, b: Vertex, c: Vertex, depth = 0): void => {
			const xs = [a.position[0], b.position[0], c.position[0]];
			if (Math.max(...xs) - Math.min(...xs) > maxSegmentWidth && depth < 12) {
				const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
				emit(a, ab, ca, depth + 1);
				emit(ab, b, bc, depth + 1);
				emit(ca, bc, c, depth + 1);
				emit(ab, bc, ca, depth + 1);
				return;
			}
			for (const vertex of [a, b, c]) {
				for (const name of names) output[name].push(...vertex[name]);
			}
		};
		const geometry = new THREE.BufferGeometry();
		const groups = source.groups.length ? source.groups : [{ start: 0, count: source.getAttribute("position").count, materialIndex: 0 }];
		for (const group of groups) {
			const start = output.position.length / 3;
			for (let i = group.start; i < group.start + group.count; i += 3) {
				emit(read(i), read(i + 1), read(i + 2));
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
