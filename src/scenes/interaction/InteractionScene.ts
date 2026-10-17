import * as THREE from "three";
import { Easing, Tween } from "@tweenjs/tween.js";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";

import { UiConfigEvent } from "@/network/uiProtocol";
import { TouchInteraction } from "@/network/TouchInteraction";
import { Color } from "@/utils/colors";
import SphericalSlider from "@/components/SphericalSlider";
import { Renderer } from "@/rendering/Renderer";

const INTERACTION_SPHERE_COUNT = 7;

export default class InteractionScene extends BaseScene {
	private readonly interactionSpheres: InteractionSphere[];
	private readonly slider: SphericalSlider;

	constructor() {
		super();
		this.setClearColor(Color.Stone800);
		const sphereClasses = [
			HoverSphere,
			HoldToggleSphere,
			HoldDownSphere,
			DragRopeSphere,
			JoystickSphere,
			ClickFastSphere,
		];
		this.interactionSpheres = sphereClasses.map((Sphere, index) => {
			const angle = (index / INTERACTION_SPHERE_COUNT) * Math.PI * 2;
			const sphere = new Sphere(
				new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)),
				(target) => this.createTween(target),
			);
			this.add(sphere);
			this.registerTouchInteraction(sphere.sphere.interaction);
			this.addText({
				text: sphere.label,
				color: sphere.sphere.baseColor,
				size: 0.04,
				position: sphere.sphere.position
					.clone()
					.add(new THREE.Vector3(0, -0.2, 0))
					.normalize(),
			});
			return sphere;
		});

		{
			const sliderAngle = (-1 / INTERACTION_SPHERE_COUNT) * Math.PI * 2;
			const sliderDirection = new THREE.Vector3(Math.sin(sliderAngle), 0, Math.cos(sliderAngle));
			const start = sliderDirection.clone().add(new THREE.Vector3(0.2, -0.3, 0)).normalize();
			const end = sliderDirection.clone().add(new THREE.Vector3(-0.2, 0.3, 0)).normalize();
			this.slider = new SphericalSlider({ start, end, color: Color.Green600 });
			this.slider.addEventListener("change", ({ value }) => this.onSliderChange(value));
			this.add(this.slider);
			this.registerTouchInteraction(this.slider.touchInteraction);
			this.addText({
				text: "Slider",
				color: Color.Green600,
				size: 0.04,
				position: start.clone().add(new THREE.Vector3(0, -0.23, 0)).normalize(),
			});
		}
	}

	override onExit(renderer: Renderer) {
		super.onExit(renderer);
		this.slider.resetInteraction();
	}

	override update(delta: number) {
		this.interactionSpheres.forEach((sphere) => sphere.update());
		this.slider.update(delta / 1000);
	}

	private onSliderChange(value: number) {
		console.log(value);
	}

	protected get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Interaction ",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Interaction,
					options: Object.values(SceneKey),
				},
			],
		};
	}
}

type CreateTween = <T extends object>(target: T) => Tween<T>;

class InteractionSphere extends THREE.Group {
	readonly sphere;

	constructor(
		readonly label: string,
		direction: THREE.Vector3,
		baseColor: number,
	) {
		super();
		const mesh = new THREE.Mesh(
			new THREE.SphereGeometry(0.11, 32, 16),
			new THREE.MeshBasicMaterial({ color: baseColor }),
		);
		mesh.position.copy(direction).normalize();
		this.add(mesh);
		this.sphere = Object.assign(mesh, {
			baseColor,
			interaction: new TouchInteraction(mesh),
		});
	}

	update() {}
}

class HoverSphere extends InteractionSphere {
	private scaleTween?: Tween<THREE.Vector3>;

	constructor(
		direction: THREE.Vector3,
		protected readonly createTween: CreateTween,
	) {
		super("Hover", direction, Color.Blue600);
		const enter = this.sphere;
		enter.interaction.on("enter", () => {
			enter.material.color.setHex(Color.Sky400);
			this.tweenScale(1.25);
		});
		enter.interaction.on("leave", () => {
			enter.material.color.setHex(enter.baseColor);
			this.tweenScale(1);
		});
		enter.interaction.on("release", () => {
			enter.material.color.setHex(enter.baseColor);
			this.tweenScale(1);
		});
	}

	private tweenScale(target: number) {
		this.scaleTween?.stop();
		this.scaleTween = this.createTween(this.sphere.scale)
			.to({ x: target, y: target, z: target }, 150)
			.easing(Easing.Cubic.Out)
			.onComplete(() => (this.scaleTween = undefined))
			.start();
	}
}

class HoldToggleSphere extends InteractionSphere {
	private scaleTween?: Tween<THREE.Vector3>;

	constructor(
		direction: THREE.Vector3,
		protected readonly createTween: CreateTween,
	) {
		super("Hold toggle", direction, Color.Yellow500);
		const press = this.sphere;
		let isPressedToggled = false;
		let isPressHeld = false;
		let pressTouchId: number | undefined;
		const setPressRestingState = () => {
			press.material.color.setHex(
				isPressedToggled ? Color.Yellow100 : press.baseColor,
			);
		};
		const setPressHeld = (held: boolean) => {
			if (isPressHeld === held) return;
			isPressHeld = held;
			if (held) {
				this.tweenScale(press.scale, 0.8, 100, Easing.Cubic.Out);
				return;
			}

			setPressRestingState();
			this.tweenScale(press.scale, 1, 500, Easing.Elastic.Out);
		};
		press.interaction.on("press", ({ touchId }) => {
			if (pressTouchId !== undefined) return;
			pressTouchId = touchId;
			setPressHeld(true);
		});
		press.interaction.on("hold", ({ touchId, isHovered }) => {
			if (pressTouchId !== touchId) return;
			setPressHeld(isHovered);
		});
		press.interaction.on("release", ({ touchId, isHovered }) => {
			if (pressTouchId !== touchId) return;
			pressTouchId = undefined;
			if (isHovered) isPressedToggled = !isPressedToggled;
			setPressHeld(false);
		});
	}
	private tweenScale(
		scale: THREE.Vector3,
		target: number,
		duration: number,
		ease: (value: number) => number,
	) {
		this.scaleTween?.stop();
		this.scaleTween = this.createTween(scale)
			.to({ x: target, y: target, z: target }, duration)
			.easing(ease)
			.onComplete(() => (this.scaleTween = undefined))
			.start();
	}
}

class HoldDownSphere extends InteractionSphere {
	constructor(
		direction: THREE.Vector3,
		protected readonly createTween: CreateTween,
	) {
		super("Hold and leave", direction, Color.Violet500);
		const hold = this.sphere;
		let holdUpdates = 0;
		const heldTouchIds = new Set<number>();
		hold.interaction.on("press", ({ touchId }) => {
			holdUpdates = 0;
			heldTouchIds.add(touchId);
		});
		hold.interaction.on("hold", ({ touchId }) => {
			if (!heldTouchIds.has(touchId)) return;
			holdUpdates += 1;
			hold.scale.setScalar(1.0 + Math.sin(holdUpdates * 0.08) * 0.15);
			hold.material.color.setHex(Color.White);
		});
		const stopHolding = ({ touchId }: { touchId: number }) => {
			heldTouchIds.delete(touchId);
			if (heldTouchIds.size > 0) return;
			hold.scale.setScalar(1);
			hold.material.color.setHex(hold.baseColor);
		};
		hold.interaction.on("release", stopHolding);
	}
}

class DragRopeSphere extends InteractionSphere {
	private dragOffset = new THREE.Vector3();

	constructor(
		direction: THREE.Vector3,
		protected readonly createTween: CreateTween,
	) {
		super("Drag drop", direction, Color.Orange500);
		const drag = this.sphere;
		const dragOrigin = drag.position.clone();
		const dragOriginMarker = new THREE.Mesh(
			new THREE.SphereGeometry(0.11, 32, 16),
			new THREE.MeshBasicMaterial({
				color: new THREE.Color(drag.baseColor).multiplyScalar(0.4),
			}),
		);
		dragOriginMarker.position.copy(dragOrigin).multiplyScalar(2);
		this.add(dragOriginMarker);
		// A spherical ribbon gives the rope a consistent width in the projection.
		const ropeRadius = dragOriginMarker.position.length();
		const ropeWidth = dragOriginMarker.geometry.parameters.radius;
		const ropeHalfAngle = ropeWidth / (2 * ropeRadius);
		const ropeSegments = 128;
		const ropeVertices = new Float32Array((ropeSegments + 1) * 2 * 3);
		const ropeIndices: number[] = [];
		for (let i = 0; i < ropeSegments; i++) {
			const vertex = i * 2;
			ropeIndices.push(vertex, vertex + 1, vertex + 2);
			ropeIndices.push(vertex + 1, vertex + 3, vertex + 2);
		}
		const ropeGeometry = new THREE.BufferGeometry();
		const ropePositions = new THREE.BufferAttribute(ropeVertices, 3);
		ropePositions.setUsage(THREE.DynamicDrawUsage);
		ropeGeometry.setAttribute("position", ropePositions);
		ropeGeometry.setIndex(ropeIndices);
		const rope = new THREE.Mesh(
			ropeGeometry,
			new THREE.MeshBasicMaterial({
				color: dragOriginMarker.material.color,
				side: THREE.FrontSide,
			}),
		);
		rope.visible = false;
		this.add(rope);
		const ropeRotation = new THREE.Quaternion();
		const ropeStepRotation = new THREE.Quaternion();
		const ropeIdentity = new THREE.Quaternion();
		const ropeNormal = new THREE.Vector3();
		const ropePoint = new THREE.Vector3();
		const ropeEdge = new THREE.Vector3();
		const updateRope = () => {
			rope.visible = dragOrigin.angleTo(drag.position) > 1e-6;
			if (!rope.visible) return;
			ropeRotation.setFromUnitVectors(dragOrigin, drag.position);
			ropeNormal
				.set(ropeRotation.x, ropeRotation.y, ropeRotation.z)
				.normalize();
			for (let i = 0; i <= ropeSegments; i++) {
				ropeStepRotation.slerpQuaternions(
					ropeIdentity,
					ropeRotation,
					i / ropeSegments,
				);
				ropePoint.copy(dragOrigin).applyQuaternion(ropeStepRotation);
				for (let side = 0; side < 2; side++) {
					ropeEdge
						.copy(ropePoint)
						.multiplyScalar(Math.cos(ropeHalfAngle))
						.addScaledVector(
							ropeNormal,
							(side === 0 ? -1 : 1) * Math.sin(ropeHalfAngle),
						)
						.multiplyScalar(ropeRadius);
					ropePositions.setXYZ(
						i * 2 + side,
						ropeEdge.x,
						ropeEdge.y,
						ropeEdge.z,
					);
				}
			}
			ropePositions.needsUpdate = true;
			ropeGeometry.computeBoundingSphere();
		};
		let dragReturnTween: Tween<{ progress: number }> | undefined;
		let activeDrag:
			| {
					touchId: number;
			  }
			| undefined;
		drag.interaction.on("press", ({ touchId, direction }) => {
			if (activeDrag) return;
			dragReturnTween?.stop();
			dragReturnTween = undefined;
			activeDrag = { touchId };
			this.dragOffset.copy(drag.position).sub(direction.clone().normalize());
		});
		drag.interaction.on("hold", ({ touchId, direction }) => {
			if (!activeDrag || activeDrag.touchId !== touchId) return;

			drag.position
				.copy(direction)
				.normalize()
				.add(this.dragOffset)
				.normalize();
			updateRope();
		});
		drag.interaction.on("release", ({ touchId }) => {
			if (activeDrag?.touchId !== touchId) return;
			activeDrag = undefined;
			drag.material.color.setHex(drag.baseColor);
			const releasePosition = drag.position.clone().normalize();
			const returnRotation = new THREE.Quaternion().setFromUnitVectors(
				releasePosition,
				dragOrigin,
			);
			const rotation = new THREE.Quaternion();
			const identity = new THREE.Quaternion();
			dragReturnTween = createTween({ progress: 0 })
				.to({ progress: 1 }, 1000)
				.easing(Easing.Elastic.Out)
				.onUpdate(({ progress }) => {
					rotation.slerpQuaternions(identity, returnRotation, progress);
					drag.position.copy(releasePosition).applyQuaternion(rotation);
					updateRope();
				})
				.onComplete(() => {
					drag.position.copy(dragOrigin);
					updateRope();
					dragReturnTween = undefined;
				})
				.start();
		});
	}

	override update() {
		this.dragOffset.multiplyScalar(0.9);
	}
}

class JoystickSphere extends InteractionSphere {
	constructor(
		direction: THREE.Vector3,
		protected readonly createTween: CreateTween,
	) {
		super("Joystick", direction, Color.Rose500);
		const joystick = this.sphere;
		const joystickOrigin = joystick.position.clone();
		const maximumJoystickDistance = THREE.MathUtils.degToRad(5);
		let joystickTouchId: number | undefined;
		joystick.interaction.on("press", ({ touchId }) => {
			if (joystickTouchId !== undefined) return;
			joystickTouchId = touchId;
		});
		joystick.interaction.on("hold", ({ touchId, direction }) => {
			if (joystickTouchId !== touchId) return;

			const touchDirection = direction.clone().normalize();
			const angle = joystickOrigin.angleTo(touchDirection);
			if (angle <= maximumJoystickDistance) {
				joystick.position.copy(touchDirection);
				return;
			}

			const rotation = new THREE.Quaternion().setFromUnitVectors(
				joystickOrigin,
				touchDirection,
			);
			joystick.position
				.copy(joystickOrigin)
				.applyQuaternion(
					new THREE.Quaternion().rotateTowards(
						rotation,
						maximumJoystickDistance,
					),
				);
		});
		joystick.interaction.on("release", ({ touchId }) => {
			if (joystickTouchId !== touchId) return;
			joystickTouchId = undefined;
			joystick.position.copy(joystickOrigin);
		});
	}
}

class ClickFastSphere extends InteractionSphere {
	private scaleTween?: Tween<THREE.Vector3>;

	constructor(
		direction: THREE.Vector3,
		protected readonly createTween: CreateTween,
	) {
		super("Tap fast", direction, Color.Teal500);
		const click = this.sphere;
		let clicked = false;
		click.interaction.on("click", () => {
			clicked = !clicked;
			click.material.color.setHex(clicked ? Color.White : click.baseColor);
			this.scaleTween?.stop();
			this.scaleTween = this.createTween(click.scale)
				.to({ x: 1.3, y: 1.3, z: 1.3 }, 100)
				.easing(Easing.Cubic.Out)
				.onComplete(() => {
					this.scaleTween = this.createTween(click.scale)
						.to({ x: 1, y: 1, z: 1 }, 500)
						.easing(Easing.Bounce.Out)
						.onComplete(() => (this.scaleTween = undefined))
						.start();
				})
				.start();
		});
	}
}
