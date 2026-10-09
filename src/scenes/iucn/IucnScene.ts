import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";

import { UiConfigEvent } from "@/network/uiProtocol";
import { Color } from "@/utils/colors";

import backgroundAsset from "@/assets/backgrounds/globe/black_and_white.jpeg";
import canis_aureus_118264161 from "@/assets/backgrounds/iucn/canis_aureus_118264161.png";
import canis_latrans_3745 from "@/assets/backgrounds/iucn/canis_latrans_3745.png";
import canis_lupaster_118264888 from "@/assets/backgrounds/iucn/canis_lupaster_118264888.png";
import canis_lupus_3746 from "@/assets/backgrounds/iucn/canis_lupus_3746.png";

const species = [
	canis_aureus_118264161,
	canis_latrans_3745,
	canis_lupaster_118264888,
	canis_lupus_3746,
];

const speciesColors = [
	Color.Red500,
	Color.Green500,
	Color.Yellow500,
	Color.Orange500,
];

export default class IucnScene extends BaseScene {
	constructor() {
		super();

		this.addBackground(backgroundAsset);

		species.forEach((assetPath, index) => {
			this.drawSpecies(
				assetPath,
				0.98 - 0.002 * index,
				speciesColors[index % speciesColors.length],
			);
		});
	}

	private drawSpecies(
		assetPath: string,
		radius: number,
		tintColor: THREE.ColorRepresentation,
	) {
		const loader = new THREE.TextureLoader();
		loader.load(assetPath, (texture) => {
			texture.colorSpace = THREE.SRGBColorSpace;

			const geometry = new THREE.SphereGeometry(radius, 64, 64);
			const material = new THREE.MeshBasicMaterial({
				map: texture,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.5,
				color: tintColor,
			});
			const sphere = new THREE.Mesh(geometry, material);
			sphere.scale.x *= -1;
			this.add(sphere);
		});
	}

	protected get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "IUCN",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Iucn,
					options: Object.values(SceneKey),
				},
			],
		};
	}
}