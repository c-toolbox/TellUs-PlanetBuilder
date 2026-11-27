import * as THREE from "three";

// Inward facing sphere
export default class BackgroundSphere extends THREE.Mesh<
	THREE.SphereGeometry,
	THREE.MeshBasicMaterial
> {
	constructor(
		asset: string | THREE.Texture,
		radius: number,
		color: THREE.ColorRepresentation = 0xffffff,
	) {
		const texture = typeof asset === "string" ? new THREE.TextureLoader().load(asset) : asset;
		texture.colorSpace = THREE.SRGBColorSpace;
		super(
			new THREE.SphereGeometry(radius, 64, 64),
			new THREE.MeshBasicMaterial({ map: texture, color, side: THREE.BackSide }),
		);
		this.scale.x = -1;
	}

	dispose() {
		this.geometry.dispose();
		this.material.map?.dispose();
		this.material.dispose();
	}
}
