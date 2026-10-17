import * as THREE from "three";
import { ORIGIN } from "@/constants";
import TextLabel from "@/components/TextLabel";
import { TouchInteraction } from "@/network/TouchInteraction";

export interface CircularButtonOptions {
	position: THREE.Vector3;
	onClick: () => void;
	radius?: number;
	texture?: THREE.Texture | string;
	color?: THREE.ColorRepresentation;
	label?: string;
}

export default class CircularButton extends THREE.Mesh<
	THREE.CircleGeometry,
	THREE.MeshBasicMaterial
> {
	private readonly clickCallback: () => void;
	private icon?: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
	private textLabel?: TextLabel;
	public readonly touchInteraction: TouchInteraction;

	constructor({
		position,
		onClick,
		radius = 0.08,
		texture,
		color = 0xffffff,
		label,
	}: CircularButtonOptions) {
		const map =
			typeof texture === "string"
				? new THREE.TextureLoader().load(texture)
				: texture;

		super(
			new THREE.CircleGeometry(radius, 48),
			new THREE.MeshBasicMaterial({
				color,
				side: THREE.FrontSide,
			}),
		);

		this.clickCallback = onClick;
		this.touchInteraction = new TouchInteraction(this);
		this.touchInteraction.on("press", () => this.click());
		this.position.copy(position);
		this.lookAt(ORIGIN);

		const outline = new THREE.Mesh(
			new THREE.RingGeometry(radius, radius * 1.15, 48),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.FrontSide,
			}),
		);
		outline.position.z = 0.001;
		outline.raycast = () => {};
		this.add(outline);

		if (map) {
			this.setTexture(map);
		}

		if (label) {
			this.setLabel(label);
		}
	}

	setLabel(label: string) {
		if (this.textLabel) {
			this.textLabel.setText(label);
			return;
		}

		this.textLabel = new TextLabel(label, 0.1, 0.8);
		this.textLabel.position.set(
			0,
			-this.geometry.parameters.radius - 0.1,
			0.003,
		);
		this.add(this.textLabel);
	}

	setLabelVisible(visible: boolean) {
		if (this.textLabel) this.textLabel.visible = visible;
	}

	setTexture(texture: THREE.Texture) {
		texture.colorSpace = THREE.SRGBColorSpace;
		if (this.icon) {
			this.icon.material.map = texture;
			this.icon.material.needsUpdate = true;
			return;
		}

		this.icon = new THREE.Mesh(
			new THREE.CircleGeometry(this.geometry.parameters.radius, 48),
			new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				side: THREE.FrontSide,
			}),
		);
		this.icon.position.z = 0.002;
		this.icon.raycast = () => {};
		this.add(this.icon);
	}

	click() {
		this.clickCallback();
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
