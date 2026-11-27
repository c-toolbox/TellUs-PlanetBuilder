import * as THREE from "three";
import { EventEmitter } from "events";
import { Easing, Tween } from "@tweenjs/tween.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TouchInteraction, type TouchInteractionEvent } from "@/network/TouchInteraction";
import pianoUrl from "@/assets/models/piano.glb?url";
import { createPanelCurve, type PanelCurve } from "@/utils/curvePanel";
import { PianoDisplay } from "./PianoDisplay";
import { PianoGrab } from "./PianoGrab";

// Modeled at scale 1, which is also the largest size.
const PIANO_WIDTH = 8;
const PIANO_DISTANCE = 2;
const PIANO_MAX_SEGMENT_WIDTH = 0.5;
const MIN_SCALE = 0.35;
const MAX_SCALE = 1;
const INITIAL_SCALE = 0.5;
const KEY_PRESS_ANGLES = {
	white: THREE.MathUtils.degToRad(9.0),
	black: THREE.MathUtils.degToRad(6.5),
};
const KEY_PRESS_DURATION = 150;
const KEY_RELEASE_DURATION = 500;
const FIRST_MIDI_NOTE = 36; // C2

interface PianoKeyAnimation {
	mesh: THREE.Mesh;
	pivot: THREE.Group;
	pressAngle: number;
	/** The key's flat, unbent transform in panel space. */
	restMatrix: THREE.Matrix4;
	tween?: Tween<THREE.Euler>;
}

interface PianoEvents {
	noteOn: [note: number];
	noteOff: [note: number];
	instrumentStep: [delta: number];
}

interface PianoHost {
	registerInteraction: (interaction: TouchInteraction) => TouchInteraction;
	createTween: (target: THREE.Euler) => Tween<THREE.Euler>;
}

/**
 * The piano's model, touch surfaces and key animation; audio is supplied by its host.
 * `object` sits at the scene origin and is rotated to place the piano on the sphere.
 * Its panel is the piano's own space, bent around a cylinder whose radius grows as the
 * piano shrinks, so that it always matches the sphere at PIANO_DISTANCE.
 */
export class Piano extends EventEmitter<PianoEvents> {
	readonly object = new THREE.Group();
	readonly display: PianoDisplay;
	private readonly panel = new THREE.Group();
	private readonly grab: PianoGrab;
	private keyAnimations: PianoKeyAnimation[] = [];
	private heldNotes = new Set<number>();
	private curve?: PanelCurve;
	private scale = INITIAL_SCALE;
	private radius = PIANO_DISTANCE / INITIAL_SCALE;
	private readonly restPivot = new THREE.Matrix4();
	private readonly pivotRotation = new THREE.Quaternion();
	private readonly pivotEuler = new THREE.Euler();
	private readonly unitScale = new THREE.Vector3(1, 1, 1);

	constructor(private readonly host: PianoHost) {
		super();
		// Panel +Z faces the origin, where the viewer is.
		this.panel.position.set(0, 0, PIANO_DISTANCE);
		this.panel.rotation.y = Math.PI;
		this.panel.scale.setScalar(this.scale);
		this.object.add(this.panel);
		this.grab = new PianoGrab(this.object, {
			minScale: MIN_SCALE,
			maxScale: MAX_SCALE,
			getScale: () => this.scale,
			setScale: (scale) => this.setScale(scale),
		});
		this.display = new PianoDisplay({
			panel: this.panel,
			radius: this.radius,
			registerInteraction: host.registerInteraction,
			onStep: (delta) => this.emit("instrumentStep", delta),
		});
		new GLTFLoader().load(
			pianoUrl,
			(gltf) => this.addModel(gltf.scene),
			undefined,
			(error) => console.error("Failed to load piano model", error),
		);
	}

	reset() {
		this.display.reset();
		this.grab.clear();
		for (const note of this.heldNotes) this.emit("noteOff", note);
		this.heldNotes.clear();
		for (const key of this.keyAnimations) {
			key.tween?.stop();
			key.tween = undefined;
			key.pivot.rotation.x = 0;
		}
	}

	private createKeyAnimation(mesh: THREE.Mesh, pressAngle: number) {
		// The curve bends geometry but leaves mesh origins in their flat positions.
		const restMatrix = this.panel.matrixWorld
			.clone()
			.invert()
			.multiply(mesh.matrixWorld);
		const pivot = new THREE.Group();
		this.panel.add(pivot);
		pivot.add(mesh);
		const key: PianoKeyAnimation = { mesh, pivot, pressAngle, restMatrix };
		this.placeKey(key);
		this.keyAnimations.push(key);
		return key;
	}

	/** Move the hinge onto the curve with its X axis aligned with the back row. */
	private placeKey({ mesh, pivot, restMatrix }: PianoKeyAnimation) {
		const x = restMatrix.elements[12];
		const y = restMatrix.elements[13];
		const z = restMatrix.elements[14];
		const angle = x / this.radius;
		const distance = this.radius - z;
		pivot.position.set(
			distance * Math.sin(angle),
			y,
			this.radius - distance * Math.cos(angle),
		);
		// A press tweens rotation.x, which is kept.
		pivot.rotation.set(pivot.rotation.x, -angle, 0, "YXZ");
		this.pivotRotation.setFromEuler(this.pivotEuler.set(0, -angle, 0, "YXZ"));
		this.restPivot
			.compose(pivot.position, this.pivotRotation, this.unitScale)
			.invert()
			.multiply(restMatrix)
			.decompose(mesh.position, mesh.quaternion, mesh.scale);
	}

	private setScale(scale: number) {
		this.scale = scale;
		this.radius = PIANO_DISTANCE / scale;
		this.panel.scale.setScalar(scale);
		this.curve?.setRadius(this.radius);
		for (const key of this.keyAnimations) this.placeKey(key);
		this.display.setRadius(this.radius);
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
			}
		});
		if (keys.length !== 49) {
			console.warn(`Expected 49 piano keys (C2-C6), found ${keys.length}`);
		}

		// Center and normalize before bending in the panel's coordinates.
		const bounds = new THREE.Box3().setFromObject(model);
		const size = bounds.getSize(new THREE.Vector3());
		const centered = new THREE.Group();
		centered.add(model);
		model.position.sub(bounds.getCenter(new THREE.Vector3()));
		centered.scale.setScalar(PIANO_WIDTH / size.x);

		const panel = this.panel;
		panel.add(centered);
		// Exported keys face +Y, with their front edges toward +Z.
		// Rotate the playing surface toward local +Z and the front edges downward.
		centered.rotation.x = Math.PI / 2;
		this.curve = createPanelCurve(
			panel,
			{ maxSegmentWidth: PIANO_MAX_SEGMENT_WIDTH },
			centered,
		);
		this.curve.setRadius(this.radius);
		panel.updateMatrixWorld(true);

		// Anything that is not a key or button moves the piano, the black back panel above all.
		const body = new TouchInteraction(centered, { raycastRoot: panel });
		body.on("press", ({ touchId, direction }) =>
			this.grab.press(touchId, direction),
		);
		const move = ({ touchId, direction }: TouchInteractionEvent) =>
			this.grab.move(touchId, direction);
		body.on("drag", move);
		body.on("hold", move);
		body.on("release", ({ touchId, direction }) =>
			this.grab.release(touchId, direction),
		);
		this.host.registerInteraction(body);

		keys.forEach(({ mesh, note, pressAngle }) => {
			const midiNote = FIRST_MIDI_NOTE + note;
			// Keep the touch surface at rest so rotation cannot release a held key.
			// It shares the key's geometry, so it follows every re-bend.
			const touchTarget = mesh.clone(false);
			touchTarget.visible = false;
			mesh.parent!.add(touchTarget);
			const key = this.createKeyAnimation(mesh, pressAngle);
			mesh.raycast = () => {};
			const interaction = this.host.registerInteraction(
				new TouchInteraction(touchTarget, { raycastRoot: panel }),
			);
			// Fingers dragging the piano slide over keys without playing them.
			const isPlayed = () =>
				Array.from(interaction.activeTouchIds).some((id) => !this.grab.has(id));
			const onEnter = ({ touchId }: TouchInteractionEvent) => {
				if (this.grab.has(touchId) || this.heldNotes.has(midiNote)) return;
				this.heldNotes.add(midiNote);
				this.animateKey(key, true);
				this.emit("noteOn", midiNote);
			};
			const onRelease = () => {
				if (isPlayed()) return;
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
