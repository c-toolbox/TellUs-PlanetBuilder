import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";

import { UiConfigEvent } from "@/network/uiProtocol";
import { TouchInteraction } from "@/network/TouchInteraction";

import backgroundAsset from "@/assets/backgrounds/globe/heightmap.png";

export default class InteractionTestScene extends BaseScene {
	private dragOffset = new THREE.Vector3();

	constructor() {
		super();

		this.addBackground(backgroundAsset);
		this.add(new THREE.HemisphereLight(0xffffff, 0x304050, 3));
		this.addInteractionSpheres();
	}

	override update() {
		this.dragOffset.multiplyScalar(0.9);
	}

	private addInteractionSpheres() {
		const enter = this.addInteractionSphere(
			"ENTER / LEAVE",
			new THREE.Vector3(-0.5, 0.28, 1),
			0x247ba0,
		);
		enter.interaction.on("enter", () => {
			enter.material.color.setHex(0x70c1b3);
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
			"PRESS / RELEASE",
			new THREE.Vector3(0, 0.32, 1),
			0x50514f,
		);
		press.interaction.on("press", () => {
			press.material.color.setHex(0xf25f5c);
			press.scale.setScalar(1.25);
		});
		press.interaction.on("release", () => {
			press.material.color.setHex(press.baseColor);
			press.scale.setScalar(1);
		});
		press.interaction.on("leave", () => {
			press.material.color.setHex(press.baseColor);
			press.scale.setScalar(1);
		});

		const hold = this.addInteractionSphere(
			"HOLD",
			new THREE.Vector3(0.5, 0.28, 1),
			0x9b5de5,
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
				isHovered
					? 1.1 + Math.sin(holdUpdates * 0.08) * 0.15
					: 1,
			);
			hold.material.color.setHex(0x3a165a);
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
			new THREE.Vector3(-0.45, -0.26, 1),
			0xff9f1c,
		);
		let activeDrag:
			| {
					touchId: number;
			  }
			| undefined;
		drag.interaction.on("press", ({ touchId, direction }) => {
			if (activeDrag) return;
			activeDrag = { touchId };
			this.dragOffset
				.copy(drag.position)
				.sub(direction.clone().normalize());
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
			new THREE.Vector3(0, -0.3, 1),
			0xe84855,
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
			new THREE.Vector3(0.45, -0.26, 1),
			0x00a896,
		);
		let clicked = false;
		click.interaction.on("click", () => {
			clicked = !clicked;
			click.material.color.setHex(clicked ? 0xffd166 : click.baseColor);
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
			size: 0.035,
			position: sphere.position
				.clone()
				.add(new THREE.Vector3(0, -0.15, 0))
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
