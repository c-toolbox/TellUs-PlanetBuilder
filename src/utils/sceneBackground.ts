import * as THREE from "three";

export function createInsideFacingSphere(
	assetPath: string,
	radius: number,
	color: THREE.ColorRepresentation = 0xffffff,
) {
	const texture = new THREE.TextureLoader().load(assetPath);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sphere = new THREE.Mesh(
		new THREE.SphereGeometry(radius, 64, 64),
		new THREE.MeshBasicMaterial({ map: texture, color, side: THREE.BackSide }),
	);
	sphere.scale.x = -1;
	return sphere;
}
