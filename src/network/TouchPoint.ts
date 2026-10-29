import * as THREE from "three";

export class TouchPoint extends THREE.Group {
	private innerMesh: THREE.Mesh;
	private innerMaterial: THREE.MeshBasicMaterial;
	private outerMaterial: THREE.MeshBasicMaterial;

	constructor(
		private geometry: THREE.BufferGeometry,
		outerMaterial: THREE.MeshBasicMaterial,
		innerMaterial: THREE.MeshBasicMaterial,
	) {
		super();
		this.outerMaterial = outerMaterial.clone();
		this.innerMaterial = innerMaterial.clone();
		const outerMesh = new THREE.Mesh(geometry, this.outerMaterial);
		this.innerMesh = new THREE.Mesh(geometry, this.innerMaterial);
		outerMesh.position.z = -0.1;
		this.innerMesh.scale.setScalar(0.4);
		outerMesh.scale.setScalar(0.48);
		this.add(this.innerMesh, outerMesh);
	}

	setColor(color: number) {
		this.innerMaterial.color.setHex(color);
	}

	dispose() {
		this.geometry.dispose();
		this.innerMaterial.dispose();
		this.outerMaterial.dispose();
	}
}