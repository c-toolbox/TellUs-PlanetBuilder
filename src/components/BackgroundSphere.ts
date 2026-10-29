import * as THREE from "three";

// Inward facing sphere
export default class BackgroundSphere extends THREE.Mesh<
	THREE.SphereGeometry,
	THREE.MeshBasicMaterial
> {
	constructor(
		assetPath: string,
		radius: number,
		color: THREE.ColorRepresentation = 0xffffff,
	) {
		const texture = new THREE.TextureLoader().load(assetPath);
		texture.colorSpace = THREE.SRGBColorSpace;
		super(
			new THREE.SphereGeometry(radius, 64, 64),
			new THREE.MeshBasicMaterial({ map: texture, color, side: THREE.BackSide }),
		);
		this.scale.x = -1;
	}
}
