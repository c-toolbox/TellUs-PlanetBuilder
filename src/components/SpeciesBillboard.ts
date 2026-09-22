import * as THREE from "three";
import { ORIGIN } from "@/constants";
import TextLabel from "@/components/TextLabel";

interface SpeciesBillboardOptions {
	position: THREE.Vector3;
	texture: THREE.Texture;
	aspectRatio: number;
	label: string;
	onClick: () => void;
	maxSize?: number;
}

const BORDER_THICKNESS = 0.02;

export default class SpeciesBillboard extends THREE.Mesh<
	THREE.PlaneGeometry,
	THREE.MeshBasicMaterial
> {
	private readonly clickCallback: () => void;
	private readonly textLabel: TextLabel;

	constructor({
		position,
		texture,
		aspectRatio,
		label,
		onClick,
		maxSize = 1.43,
	}: SpeciesBillboardOptions) {
		const width = aspectRatio >= 1 ? maxSize : maxSize * aspectRatio;
		const height = aspectRatio >= 1 ? maxSize / aspectRatio : maxSize;

		super(
			new THREE.PlaneGeometry(width, height),
			new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				alphaTest: 0.01,
				side: THREE.DoubleSide,
			}),
		);

		this.clickCallback = onClick;
		this.position.copy(position);
		this.lookAt(ORIGIN);

		const borderMaterial = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			side: THREE.DoubleSide,
		});
		const outerWidth = width + BORDER_THICKNESS * 2;
		const horizontalGeometry = new THREE.PlaneGeometry(
			outerWidth,
			BORDER_THICKNESS,
		);
		const verticalGeometry = new THREE.PlaneGeometry(BORDER_THICKNESS, height);
		const frameParts = [
			new THREE.Mesh(horizontalGeometry, borderMaterial),
			new THREE.Mesh(horizontalGeometry, borderMaterial),
			new THREE.Mesh(verticalGeometry, borderMaterial),
			new THREE.Mesh(verticalGeometry, borderMaterial),
		];

		frameParts[0].position.y = (height + BORDER_THICKNESS) / 2;
		frameParts[1].position.y = -(height + BORDER_THICKNESS) / 2;
		frameParts[2].position.x = (width + BORDER_THICKNESS) / 2;
		frameParts[3].position.x = -(width + BORDER_THICKNESS) / 2;
		frameParts.forEach((part) => {
			part.position.z = -0.001;
			part.raycast = () => {};
			this.add(part);
		});

		this.textLabel = new TextLabel(label, 0.12, Math.max(width, 1.2));
		this.textLabel.position.set(
			0,
			-(height / 2 + BORDER_THICKNESS + 0.12),
			0.002,
		);
		this.add(this.textLabel);
	}

	click() {
		this.clickCallback();
	}

	setLabel(label: string) {
		this.textLabel.setText(label);
	}

	dispose() {
		this.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (object instanceof TextLabel) {
				object.dispose();
				return;
			}

			object.geometry.dispose();
			const materials = Array.isArray(object.material)
				? object.material
				: [object.material];
			materials.forEach((material) => material.dispose());
		});
	}
}