import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";

import { UiConfigEvent } from "@/network/uiProtocol";
import { TouchInteraction } from "@/network/TouchInteraction";
import { Color } from "@/utils/colors";

const INTERACTION_SPHERE_COUNT = 6;

interface ScaleTween {
	scale: THREE.Vector3;
	start: number;
	target: number;
	elapsed: number;
	duration: number;
	ease: (value: number) => number;
}

export default class InteractionTestScene extends BaseScene {
	private dragOffset = new THREE.Vector3();
	private scaleTween?: ScaleTween;

	constructor() {
		super();

		this.setClearColor(Color.Stone800);
		this.addInteractionSpheres();
	}

	override update(delta: number) {
		this.dragOffset.multiplyScalar(0.9);

		if (!this.scaleTween) return;
		this.scaleTween.elapsed += delta;
		const progress = Math.min(
			this.scaleTween.elapsed / this.scaleTween.duration,
			1,
		);
		this.scaleTween.scale.setScalar(
			THREE.MathUtils.lerp(
				this.scaleTween.start,
				this.scaleTween.target,
				this.scaleTween.ease(progress),
			),
		);
		if (progress === 1) this.scaleTween = undefined;
	}

	private tweenScale(
		scale: THREE.Vector3,
		target: number,
		duration: number,
		ease: (value: number) => number,
	) {
		this.scaleTween = {
			scale,
			start: scale.x,
			target,
			elapsed: 0,
			duration,
			ease,
		};
	}

	private addInteractionSpheres() {
		let sphereIndex = 0;
		const nextPosition = () => {
			const angle = (sphereIndex++ / INTERACTION_SPHERE_COUNT) * Math.PI * 2;
			return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
		};

		const enter = this.addInteractionSphere(
			"Hover",
			nextPosition(),
			Color.Blue600,
		);
		enter.interaction.on("enter", () => {
			enter.material.color.setHex(Color.Sky400);
			enter.scale.setScalar(1.25);
		});
		enter.interaction.on("leave", () => {
			enter.material.color.setHex(enter.baseColor);
			enter.scale.setScalar(1);
		});
		enter.interaction.on("release", () => {
			enter.material.color.setHex(enter.baseColor);
			enter.scale.setScalar(1);
		});

		const press = this.addInteractionSphere(
			"Toggle",
			nextPosition(),
			Color.Yellow600,
		);
		let isPressedToggled = false;
		let isPressHeld = false;
		let pressTouchId: number | undefined;
		const setPressRestingState = () => {
			press.material.color.setHex(
				isPressedToggled ? Color.Orange600 : press.baseColor,
			);
		};
		const setPressHeld = (held: boolean) => {
			if (isPressHeld === held) return;
			isPressHeld = held;
			if (held) {
				press.material.color.setHex(Color.Amber700);
				this.tweenScale(
					press.scale,
					0.9,
					100,
					(value) => 1 - Math.pow(1 - value, 3),
				);
				return;
			}

			setPressRestingState();
			this.tweenScale(press.scale, 1, 500, (value) => {
				if (value === 0 || value === 1) return value;
				const amplitude = 1.5;
				const period = 0.5;
				const phase =
					(period / (2 * Math.PI)) * Math.asin(1 / amplitude);
				return (
					amplitude *
					Math.pow(2, -10 * value) *
					Math.sin(((value - phase) * 2 * Math.PI) / period) +
					1
				);
			});
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

		const hold = this.addInteractionSphere(
			"HOLD",
			nextPosition(),
			Color.Violet500,
		);
		let holdUpdates = 0;
		const heldTouchIds = new Set<number>();
		hold.interaction.on("press", ({ touchId }) => {
			heldTouchIds.add(touchId);
		});
		hold.interaction.on("hold", ({ touchId, isHovered }) => {
			if (!heldTouchIds.has(touchId)) return;
			holdUpdates += 1;
			hold.scale.setScalar(
				isHovered ? 1.1 + Math.sin(holdUpdates * 0.08) * 0.15 : 1,
			);
			hold.material.color.setHex(Color.Violet900);
		});
		const stopHolding = ({ touchId }: { touchId: number }) => {
			heldTouchIds.delete(touchId);
			if (heldTouchIds.size > 0) return;
			hold.scale.setScalar(1);
			hold.material.color.setHex(hold.baseColor);
		};
		hold.interaction.on("release", stopHolding);

		const drag = this.addInteractionSphere(
			"DRAG",
			nextPosition(),
			Color.Orange500,
		);
		let activeDrag:
			| {
					touchId: number;
			  }
			| undefined;
		drag.interaction.on("press", ({ touchId, direction }) => {
			if (activeDrag) return;
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
		});
		drag.interaction.on("release", ({ touchId }) => {
			if (activeDrag?.touchId === touchId) activeDrag = undefined;
			drag.material.color.setHex(drag.baseColor);
		});

		const joystick = this.addInteractionSphere(
			"JOYSTICK",
			nextPosition(),
			Color.Rose500,
		);
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

		const click = this.addInteractionSphere(
			"CLICK",
			nextPosition(),
			Color.Teal500,
		);
		let clicked = false;
		click.interaction.on("click", () => {
			clicked = !clicked;
			click.material.color.setHex(clicked ? Color.Amber400 : click.baseColor);
		});
	}

	private addInteractionSphere(
		label: string,
		direction: THREE.Vector3,
		baseColor: number,
	) {
		const material = new THREE.MeshBasicMaterial({
			color: baseColor,
		});
		const sphere = new THREE.Mesh(
			new THREE.SphereGeometry(0.11, 32, 16),
			material,
		);
		sphere.position.copy(direction).normalize();
		this.add(sphere);

		const interaction = this.registerTouchInteraction(
			new TouchInteraction(sphere),
		);
		this.addText({
			text: label,
			color: baseColor,
			size: 0.04,
			position: sphere.position
				.clone()
				.add(new THREE.Vector3(0, -0.2, 0))
				.normalize(),
		});

		return {
			material,
			interaction,
			baseColor,
			scale: sphere.scale,
			position: sphere.position,
		};
	}

	protected get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Interaction Test",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.InteractionTest,
					options: Object.values(SceneKey),
				},
			],
		};
	}
}
