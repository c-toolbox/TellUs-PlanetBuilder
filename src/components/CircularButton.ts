import * as THREE from "three";
import { ORIGIN } from "@/constants";

export interface CircularButtonOptions {
	position: THREE.Vector3;
	onClick: () => void;
	radius?: number;
	texture?: THREE.Texture | string;
	color?: THREE.ColorRepresentation;
}

export default class CircularButton extends THREE.Mesh<
	THREE.CircleGeometry,
	THREE.MeshBasicMaterial
> {
	private readonly clickCallback: () => void;

	constructor({
		position,
		onClick,
		radius = 0.08,
		texture,
		color = 0xffffff,
	}: CircularButtonOptions) {
		const map =
			typeof texture === "string"
				? new THREE.TextureLoader().load(texture)
				: texture;

		if (map) {
			map.colorSpace = THREE.SRGBColorSpace;
		}

		super(
			new THREE.CircleGeometry(radius, 48),
			new THREE.MeshBasicMaterial({
				color,
				side: THREE.DoubleSide,
			}),
		);

		this.clickCallback = onClick;
		this.position.copy(position);
		this.lookAt(ORIGIN);

		const outline = new THREE.Mesh(
			new THREE.RingGeometry(radius, radius * 1.15, 48),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.DoubleSide,
			}),
		);
		outline.position.z = 0.001;
		outline.raycast = () => {};
		this.add(outline);

		if (map) {
			const icon = new THREE.Mesh(
				new THREE.CircleGeometry(radius * 0.7, 48),
				new THREE.MeshBasicMaterial({
					map,
					transparent: true,
					side: THREE.DoubleSide,
				}),
			);
			icon.position.z = 0.002;
			icon.raycast = () => {};
			this.add(icon);
		}
	}

	click() {
		this.clickCallback();
	}

	dispose() {
		this.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;

			object.geometry.dispose();
			const materials = Array.isArray(object.material)
				? object.material
				: [object.material];
			materials.forEach((material) => material.dispose());
		});
	}
}