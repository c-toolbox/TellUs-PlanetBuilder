import * as THREE from "three";
import { EventEmitter } from "events";
import { Easing, Tween } from "@tweenjs/tween.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ORIGIN } from "@/constants";
import { TouchInteraction } from "@/network/TouchInteraction";
import pianoUrl from "@/assets/models/piano.glb?url";
import { curvePanel } from "@/utils/curvePanel";

const PIANO_WIDTH = 8;
const PIANO_DISTANCE = 2;
const PIANO_MAX_SEGMENT_WIDTH = 0.5;
const KEY_PRESS_ANGLES = {
	white: THREE.MathUtils.degToRad(9.0),
	black: THREE.MathUtils.degToRad(6.5),
};
const KEY_PRESS_DURATION = 150;
const KEY_RELEASE_DURATION = 500;
const FIRST_MIDI_NOTE = 36; // C2

interface PianoKeyAnimation {
	pivot: THREE.Group;
	pressAngle: number;
	tween?: Tween<THREE.Euler>;
}

interface PianoEvents {
	noteOn: [note: number];
	noteOff: [note: number];
}

interface PianoHost {
	registerInteraction: (interaction: TouchInteraction) => TouchInteraction;
	createTween: (target: THREE.Euler) => Tween<THREE.Euler>;
}

/** The piano's model, touch surfaces and key animation; audio is supplied by its host. */
export class Piano extends EventEmitter<PianoEvents> {
	readonly object = new THREE.Group();
	private keyAnimations: PianoKeyAnimation[] = [];
	private heldNotes = new Set<number>();

	constructor(private readonly host: PianoHost) {
		super();
		new GLTFLoader().load(
			pianoUrl,
			(gltf) => this.addModel(gltf.scene),
			undefined,
			(error) => console.error("Failed to load piano model", error),
		);
	}

	reset() {
		for (const note of this.heldNotes) this.emit("noteOff", note);
		this.heldNotes.clear();
		for (const key of this.keyAnimations) {
			key.tween?.stop();
			key.tween = undefined;
			key.pivot.rotation.x = 0;
		}
	}

	private createKeyAnimation(
		mesh: THREE.Mesh,
		piano: THREE.Group,
		pressAngle: number,
	) {
		// curvePanel bends geometry but leaves mesh origins in their flat positions.
		// Move the hinge onto the curve and align its X axis with the back row.
		const origin = piano.worldToLocal(
			mesh.getWorldPosition(new THREE.Vector3()),
		);
		const angle = origin.x / PIANO_DISTANCE;
		const radius = PIANO_DISTANCE - origin.z;
		const pivot = new THREE.Group();
		pivot.position.set(
			radius * Math.sin(angle),
			origin.y,
			PIANO_DISTANCE - radius * Math.cos(angle),
		);
		pivot.rotation.set(0, -angle, 0, "YXZ");
		piano.add(pivot);
		pivot.attach(mesh);
		const key: PianoKeyAnimation = { pivot, pressAngle };
		this.keyAnimations.push(key);
		return key;
	}

	private animateKey(key: PianoKeyAnimation, pressed: boolean) {
		key.tween?.stop();
		key.tween = this.host
			.createTween(key.pivot.rotation)
			.to(
				{ x: pressed ? key.pressAngle : 0 },
				pressed ? KEY_PRESS_DURATION : KEY_RELEASE_DURATION,
			)
			.easing(pressed ? Easing.Back.Out : Easing.Cubic.Out)
			.onComplete(() => (key.tween = undefined))
			.start();
	}

	private addModel(model: THREE.Group) {
		const keys: { mesh: THREE.Mesh; note: number; pressAngle: number }[] = [];
		model.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const { key, note }: { key?: unknown; note?: unknown } = object.userData;
			if (
				(key === "white" || key === "black") &&
				typeof note === "number" &&
				Number.isInteger(note) &&
				note >= 0 &&
				FIRST_MIDI_NOTE + note <= 127
			) {
				keys.push({ mesh: object, note, pressAngle: KEY_PRESS_ANGLES[key] });
			} else {
				object.raycast = () => {};
			}
		});
		if (keys.length !== 49) {
			console.warn(`Expected 49 piano keys (C2-C6), found ${keys.length}`);
		}

		// Center and normalize before bending in the piano group's coordinates.
		const bounds = new THREE.Box3().setFromObject(model);
		const size = bounds.getSize(new THREE.Vector3());
		const centered = new THREE.Group();
		centered.add(model);
		model.position.sub(bounds.getCenter(new THREE.Vector3()));
		centered.scale.setScalar(PIANO_WIDTH / size.x);

		const piano = this.object;
		piano.add(centered);
		// Exported keys face +Y, with their front edges toward +Z.
		// Rotate the playing surface toward local +Z and the front edges downward.
		centered.rotation.x = Math.PI / 2;
		curvePanel(piano, {
			radius: PIANO_DISTANCE,
			maxSegmentWidth: PIANO_MAX_SEGMENT_WIDTH,
		});
		piano.position.set(0, 0, PIANO_DISTANCE);
		piano.lookAt(ORIGIN);
		piano.updateMatrixWorld(true);

		keys.forEach(({ mesh, note, pressAngle }) => {
			const midiNote = FIRST_MIDI_NOTE + note;
			// Keep the touch surface at rest so rotation cannot release a held key.
			const touchTarget = mesh.clone(false);
			touchTarget.visible = false;
			mesh.parent!.add(touchTarget);
			const key = this.createKeyAnimation(mesh, piano, pressAngle);
			mesh.raycast = () => {};
			const interaction = this.host.registerInteraction(
				new TouchInteraction(touchTarget, { raycastRoot: piano }),
			);
			const onEnter = () => {
				if (this.heldNotes.has(midiNote)) return;
				this.heldNotes.add(midiNote);
				this.animateKey(key, true);
				this.emit("noteOn", midiNote);
			};
			const onRelease = () => {
				if (interaction.activeTouchIds.size > 0) return;
				if (!this.heldNotes.delete(midiNote)) return;
				this.animateKey(key, false);
				this.emit("noteOff", midiNote);
			};

			interaction.on("enter", onEnter);
			interaction.on("leave", onRelease);
			interaction.on("release", onRelease);
		});
	}
}
