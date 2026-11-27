import * as THREE from "three";
import vertexShader from "./shaders/locationWipe.vert?raw";
import fragmentShader from "./shaders/locationWipe.frag?raw";

/** Per-face materials that wipe a background cube from one location to another. */
export class LocationWipe {
	readonly materials: THREE.ShaderMaterial[];
	private readonly progress = { value: 0 };

	constructor(
		current: THREE.MeshBasicMaterial[],
		incoming: THREE.MeshBasicMaterial[],
		origin: THREE.Vector3,
	) {
		const originUniform = { value: origin.clone().normalize() };
		const borderWidth = { value: THREE.MathUtils.degToRad(1) };
		this.materials = current.map(
			(material, face) =>
				new THREE.ShaderMaterial({
					uniforms: {
						currentMap: { value: material.map },
						incomingMap: { value: incoming[face].map },
						progress: this.progress,
						origin: originUniform,
						borderWidth,
					},
					vertexShader,
					fragmentShader,
					side: THREE.BackSide,
				}),
		);
	}

	setProgress(progress: number) {
		this.progress.value = progress;
	}

	// Textures belong to the cached backgrounds, so only the materials are disposed.
	dispose() {
		this.materials.forEach((material) => material.dispose());
	}
}
