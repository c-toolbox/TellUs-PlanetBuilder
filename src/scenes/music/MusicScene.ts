import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";
import { ORIGIN } from "@/constants";
import { TouchId } from "@/network/tuioProtocol";
import { UiConfigEvent } from "@/network/uiProtocol";
import pianoUrl from "@/assets/models/piano.fbx?url";
import { curvePanel } from "@/utils/curvePanel";
import { Renderer } from "@/rendering/Renderer";
import { TouchInteraction } from "@/network/TouchInteraction";

const PIANO_WIDTH = 2.4;
const PIANO_DISTANCE = 2;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export default class MusicScene extends BaseScene {
	private piano?: THREE.Group;
	private keyNotes = new Map<THREE.Object3D, string>();

	constructor() {
		super();
		this.background = new THREE.Color(0x18202d);
		this.add(new THREE.HemisphereLight(0xffffff, 0x465065, 2));
		const light = new THREE.DirectionalLight(0xffffff, 2);
		light.position.set(-1, 2, 0);
		this.add(light);

		new FBXLoader().load(
			pianoUrl,
			(model) => this.addPiano(model),
			undefined,
			(error) => console.error("Failed to load piano model", error),
		);
	}

	private addPiano(model: THREE.Group) {
		// The FBX includes Blender's camera and lights; use the scene's lighting.
		const helpers: THREE.Object3D[] = [];
		const keys: { mesh: THREE.Mesh; x: number }[] = [];
		model.updateMatrixWorld(true);
		model.traverse((object) => {
			if (object instanceof THREE.Mesh && object.name === "Plane") {
				// The exported casing has inward-facing triangles. BackSide also
				// flips its shading normals and raycasts against the outward side.
				const fixCasingMaterial = (material: THREE.Material) => {
					const corrected = material.clone();
					corrected.side = THREE.BackSide;
					return corrected;
				};
				object.material = Array.isArray(object.material)
					? object.material.map(fixCasingMaterial)
					: fixCasingMaterial(object.material);
			}
			if (object instanceof THREE.Camera || object instanceof THREE.Light) {
				helpers.push(object);
			}
			// In this asset, Cube001–Cube025 are keys and Plane is the casing.
			if (object instanceof THREE.Mesh && /^Cube\d{3}$/.test(object.name)) {
				const center = new THREE.Box3()
					.setFromObject(object)
					.getCenter(new THREE.Vector3());
				keys.push({ mesh: object, x: center.x });
			}
		});
		helpers.forEach((object) => object.removeFromParent());
		keys.sort((a, b) => a.x - b.x);
		keys.forEach(({ mesh }, index) => {
			this.keyNotes.set(
				mesh,
				`${NOTE_NAMES[index % 12]}${3 + Math.floor(index / 12)}`,
			);
		});
		if (keys.length !== 25) {
			console.warn(`Expected 25 piano keys (C3-C5), found ${keys.length}`);
		}

		// Center and normalize before bending in the piano group's coordinates.
		const bounds = new THREE.Box3().setFromObject(model);
		const size = bounds.getSize(new THREE.Vector3());
		const centered = new THREE.Group();
		centered.add(model);
		model.position.sub(bounds.getCenter(new THREE.Vector3()));
		centered.scale.setScalar(PIANO_WIDTH / size.x);

		const piano = new THREE.Group();
		piano.add(centered);
		// Exported keys face +Y, with their front edges toward +Z.
		// Rotate the playing surface toward local +Z and the front edges downward.
		centered.rotation.x = Math.PI / 2;
		curvePanel(piano, { radius: PIANO_DISTANCE });
		piano.position.set(0, 0, -PIANO_DISTANCE);
		piano.lookAt(ORIGIN);
		this.add(piano);
		piano.updateMatrixWorld(true);
		this.piano = piano;

		keys.forEach(({ mesh }) => {
			const interaction = this.registerTouchInteraction(
				new TouchInteraction(mesh, { raycastRoot: piano }),
			);
			const onEnter = ({ touchId }: { touchId: TouchId }) => {
				console.log(
					"Pressed piano key:",
					this.keyNotes.get(mesh),
					mesh.name,
					"touch:",
					touchId,
				);
			};
			const onRelease = ({ touchId }: { touchId: TouchId }) => {
				if (interaction.activeTouchIds.size > 0) return;
				console.log(
					"Released piano key:",
					this.keyNotes.get(mesh),
					mesh.name,
					"touch:",
					touchId,
				);
			};

			interaction.on("enter", onEnter);
			interaction.on("leave", onRelease);
			interaction.on("release", onRelease);
		});
	}

	protected override get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Music",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Music,
					options: Object.values(SceneKey),
				},
			],
		};
	}
}
