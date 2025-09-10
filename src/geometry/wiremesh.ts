import * as THREE from "three";

const VERTEX_RADIUS = 0.12;
const EDGE_RADIUS = 0.05;
const VERTEX_COLOR = 0x000000;
const EDGE_COLOR = 0x000000;

export function createEdgeCylinder(a: THREE.Vector3, b: THREE.Vector3) {
	const vector = new THREE.Vector3().subVectors(b, a);
	const length = vector.length();
	const geometry = new THREE.CylinderGeometry(
		EDGE_RADIUS,
		EDGE_RADIUS,
		length,
		8
	);
	const material = new THREE.MeshBasicMaterial({ color: EDGE_COLOR });
	const mesh = new THREE.Mesh(geometry, material);

	// orient cylinder between a and b
	const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
	mesh.position.copy(mid);
	mesh.quaternion.setFromUnitVectors(
		new THREE.Vector3(0, 1, 0),
		vector.clone().normalize()
	);

	return mesh;
}

// Add edges as cylinders between vertices
export function addEdges(
	scene: THREE.Scene,
	vertices: THREE.Vector3[],
	edges: [number, number][]
) {
	const group = new THREE.Group();

	for (const [ia, ib] of edges) {
		const cylinder = createEdgeCylinder(vertices[ia], vertices[ib]);
		group.add(cylinder);
	}
	scene.add(group);
}

// Also keep previously created vertex spheres and edge lines for reference
export function addVertices(scene: THREE.Scene, vertices: THREE.Vector3[]) {
	const group = new THREE.Group();

	const geometry = new THREE.SphereGeometry(VERTEX_RADIUS, 12, 10);
	const material = new THREE.MeshBasicMaterial({ color: VERTEX_COLOR });
	for (const vertex of vertices) {
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.copy(vertex);
		mesh.position.multiplyScalar(0.9);
		group.add(mesh);
	}
	scene.add(group);
}
