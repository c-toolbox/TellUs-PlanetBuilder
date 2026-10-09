import * as THREE from "three";
import { EventEmitter } from "events";
import { TuioSocket } from "@/network/TuioSocket";
import { TouchId } from "@/network/tuioProtocol";
import { TouchPoint } from "./TouchPoint";
import {
	TouchInteraction,
	TouchInteractionEvent,
	TouchInteractionEventName,
} from "./TouchInteraction";
import {
	ORIGIN,
	TOUCH_DISTANCE,
	TOUCH_SIZE,
	GLOBE_FOV_DEGREES,
} from "@/constants";

import circleAsset from "@/assets/circle.png";

export class TouchHandler extends EventEmitter {
	public touchGroup: THREE.Group;
	private touchPoints: Map<TouchId, TouchPoint>;
	private touchOuterMaterial: THREE.MeshBasicMaterial;
	private touchInnerMaterial: THREE.MeshBasicMaterial;
	private cameraQuaternion: THREE.Quaternion;
	private raycaster = new THREE.Raycaster();
	private interactions = new Set<TouchInteraction>();
	private interactionStates = new Map<
		TouchId,
		{
			hovered?: TouchInteraction;
			pressed?: TouchInteraction;
			startDirection: THREE.Vector3;
			previousDirection: THREE.Vector3;
			dragging: boolean;
		}
	>();

	constructor() {
		super();

		this.touchGroup = new THREE.Group();
		this.cameraQuaternion = new THREE.Quaternion();

		/* ThreeJS */

		this.touchPoints = new Map<TouchId, TouchPoint>();

		const textureLoader = new THREE.TextureLoader();

		this.touchOuterMaterial = new THREE.MeshBasicMaterial({
			map: textureLoader.load(circleAsset),
			alphaMap: textureLoader.load(circleAsset),
			transparent: true,
			premultipliedAlpha: true,
			side: THREE.DoubleSide,
			depthWrite: true,
			color: 0xffffff,
			opacity: 0.9,
		});
		this.touchOuterMaterial.alphaTest = 0.01;

		this.touchInnerMaterial = new THREE.MeshBasicMaterial({
			map: textureLoader.load(circleAsset),
			alphaMap: textureLoader.load(circleAsset),
			transparent: true,
			premultipliedAlpha: true,
			side: THREE.DoubleSide,
			depthWrite: true,
		});
		this.touchInnerMaterial.alphaTest = 0.01;
	}

	connect() {
		const socket = new TuioSocket();
		socket.on("touchAdd", (id: TouchId) => {
			this.addTouch(id);
		});
		socket.on("touchRemove", (id: TouchId) => {
			this.removeTouch(id);
		});
		socket.on("touchUpdate", (id: TouchId, pitch: number, yaw: number) => {
			this.updateTouch(id, pitch, yaw);
		});
	}

	addTouch(touchId: TouchId) {
		const geometry = new THREE.PlaneGeometry(1, 1);

		const mesh = new TouchPoint(
			geometry,
			this.touchOuterMaterial,
			this.touchInnerMaterial,
		);

		// Temporarily move it away from origin
		mesh.position.x = 10000;

		// Scale with distance so angular size is constant
		mesh.scale.setScalar(TOUCH_SIZE * TOUCH_DISTANCE);

		this.touchGroup.add(mesh);
		this.touchPoints.set(touchId, mesh);
	}

	updateTouch(touchId: TouchId, pitch: number, yaw: number) {
		let object = this.touchPoints.get(touchId);
		if (!object) return console.warn("Unknown touch id:", touchId);

		// Scale pitch to account for the globe's FOV constraint.
		// Only the central FOVbelt is visible (e.g. 320 of 360 degrees),
		// so we contract input pitch to that portion of the sphere.
		const scaledPitch = pitch * (GLOBE_FOV_DEGREES / 360);

		// Convert to camera-local spherical coordinates
		const direction = new THREE.Vector3(
			Math.sin(scaledPitch) * Math.cos(yaw),
			-Math.sin(scaledPitch) * Math.sin(yaw), // Flip
			Math.cos(scaledPitch),
		);

		// Store camera-local direction
		object.cameraLocalDirection.copy(direction);

		// Apply camera quaternion to emit world-space direction
		const worldDirection = direction
			.clone()
			.applyQuaternion(this.cameraQuaternion);

		const newWorldPos = worldDirection.clone().multiplyScalar(TOUCH_DISTANCE);
		const now = Date.now();

		if (object.hasPreviousPosition) {
			const dt = (now - object.lastUpdateTimestamp) / 1000; // seconds

			// Ensure dt is valid (> 0) and not too small to avoid division spikes
			if (dt > 0.001) {
				const displacement = newWorldPos.clone().sub(object.position);
				const calculatedVelocity = displacement.divideScalar(dt);

				// Clamp touch velocity to prevent hardware touch noise spikes
				const MAX_TOUCH_VELOCITY = 1000;
				if (calculatedVelocity.length() > MAX_TOUCH_VELOCITY) {
					calculatedVelocity.setLength(MAX_TOUCH_VELOCITY);
				}

				object.velocity.copy(calculatedVelocity);
				object.previousPosition.copy(object.position).normalize();
			}
		} else {
			// First update after touch down: initialize positions, zero velocity
			object.hasPreviousPosition = true;
			object.position.copy(newWorldPos);
			object.previousPosition.copy(newWorldPos).normalize();
			object.velocity.set(0, 0, 0);
		}

		object.lastUpdateTimestamp = now;
		object.position.copy(newWorldPos);
		object.lookAt(ORIGIN);
		this.updateInteractions(touchId, object, worldDirection);

		this.emit("touch", touchId, worldDirection);
	}

	registerInteraction(interaction: TouchInteraction) {
		this.interactions.add(interaction);
	}

	unregisterInteraction(interaction: TouchInteraction) {
		this.interactions.delete(interaction);
		for (const state of this.interactionStates.values()) {
			if (state.hovered === interaction) state.hovered = undefined;
			if (state.pressed === interaction) {
				state.pressed = undefined;
				state.dragging = false;
			}
		}
		interaction.activeTouchIds.clear();
	}

	private updateInteractions(
		touchId: TouchId,
		touchPoint: TouchPoint,
		direction: THREE.Vector3,
	) {
		let state = this.interactionStates.get(touchId);
		const isFirstUpdate = !state;
		if (!state) {
			state = {
				startDirection: direction.clone(),
				previousDirection: direction.clone(),
				dragging: false,
			};
			this.interactionStates.set(touchId, state);
		}

		const hit = this.getInteractionAt(direction);
		const hovered = hit?.interaction;
		if (state.hovered !== hovered) {
			if (state.hovered) {
				state.hovered.activeTouchIds.delete(touchId);
				this.emitInteraction(
					"leave",
					state.hovered,
					touchId,
					touchPoint,
					direction,
					state,
				);
			}
			state.hovered = hovered;
			if (hovered) {
				hovered.activeTouchIds.add(touchId);
				this.emitInteraction(
					"enter",
					hovered,
					touchId,
					touchPoint,
					direction,
					state,
					hit?.intersection,
				);
			}
		}

		if (isFirstUpdate && hovered) {
			state.pressed = hovered;
			state.dragging = true;
			this.emitInteraction(
				"press",
				hovered,
				touchId,
				touchPoint,
				direction,
				state,
				hit?.intersection,
			);
		}

		if (
			!isFirstUpdate &&
			state.dragging &&
			state.pressed &&
			!state.previousDirection.equals(direction)
		) {
			this.emitInteraction(
				"drag",
				state.pressed,
				touchId,
				touchPoint,
				direction,
				state,
				hit?.intersection,
			);
		}

		state.previousDirection.copy(direction);
	}

	update() {
		this.interactionStates.forEach((state, touchId) => {
			const touchPoint = this.touchPoints.get(touchId);
			if (!touchPoint) return;

			const direction = touchPoint.position.clone().normalize();
			const hit = this.getInteractionAt(direction);
			const hovered = hit?.interaction;
			if (state.hovered !== hovered) {
				if (state.hovered) {
					state.hovered.activeTouchIds.delete(touchId);
					this.emitInteraction(
						"leave",
						state.hovered,
						touchId,
						touchPoint,
						direction,
						state,
					);
				}
				state.hovered = hovered;
				if (hovered) {
					hovered.activeTouchIds.add(touchId);
					this.emitInteraction(
						"enter",
						hovered,
						touchId,
						touchPoint,
						direction,
						state,
						hit?.intersection,
					);
				}
			}
			const targets = new Set<TouchInteraction>();
			if (state.hovered?.isEnabled) targets.add(state.hovered);
			if (state.pressed?.isEnabled) targets.add(state.pressed);

			targets.forEach((interaction) => {
				this.emitInteraction(
					"hold",
					interaction,
					touchId,
					touchPoint,
					direction,
					state,
					hit?.interaction === interaction ? hit.intersection : undefined,
				);
			});
		});
	}

	private getInteractionAt(
		direction: THREE.Vector3,
	):
		| { interaction: TouchInteraction; intersection: THREE.Intersection }
		| undefined {
		const enabled = Array.from(this.interactions).filter(
			(interaction) => interaction.isEnabled,
		);
		const roots = Array.from(
			new Set(enabled.map((interaction) => interaction.raycastRoot)),
		);
		if (roots.length === 0) return;

		this.raycaster.set(ORIGIN, direction.clone().normalize());
		const [intersection] = this.raycaster.intersectObjects(roots, true);
		if (!intersection) return;

		let object: THREE.Object3D | null = intersection.object;
		while (object) {
			const interaction = enabled.find(
				(candidate) => candidate.object === object,
			);
			if (interaction) return { interaction, intersection };
			object = object.parent;
		}
	}

	private emitInteraction(
		eventName: TouchInteractionEventName,
		interaction: TouchInteraction,
		touchId: TouchId,
		touchPoint: TouchPoint,
		direction: THREE.Vector3,
		state: {
			hovered?: TouchInteraction;
			startDirection: THREE.Vector3;
			previousDirection: THREE.Vector3;
			dragging: boolean;
		},
		intersection?: THREE.Intersection,
	) {
		const event: TouchInteractionEvent = {
			touchId,
			touchPoint,
			target: interaction,
			direction: direction.clone(),
			startDirection: state.startDirection.clone(),
			previousDirection: state.previousDirection.clone(),
			intersection,
			isHovered: state.hovered === interaction,
			cancelDrag: () => {
				state.dragging = false;
			},
		};
		interaction.emit(eventName, event);
	}

	private updateTouchPointsForCameraRotation() {
		this.touchPoints.forEach((touchPoint) => {
			const worldDirection = touchPoint.cameraLocalDirection
				.clone()
				.applyQuaternion(this.cameraQuaternion);

			touchPoint.position.copy(worldDirection).multiplyScalar(TOUCH_DISTANCE);
			touchPoint.lookAt(ORIGIN);
		});
	}

	removeTouch(touchId: TouchId) {
		const object = this.touchPoints.get(touchId);
		if (!object) return console.warn("Unknown touch id:", touchId);

		const interactionState = this.interactionStates.get(touchId);
		if (interactionState) {
			interactionState.hovered?.activeTouchIds.delete(touchId);
			const pressedInteraction = interactionState.pressed;
			const releaseTargets = new Set<TouchInteraction>();
			if (interactionState.hovered) {
				releaseTargets.add(interactionState.hovered);
			}
			if (pressedInteraction) {
				releaseTargets.add(pressedInteraction);
			}
			releaseTargets.forEach((interaction) => {
				this.emitInteraction(
					"release",
					interaction,
					touchId,
					object,
					object.position.clone().normalize(),
					interactionState,
				);
			});
			if (
				object.shouldRegisterAsClick &&
				pressedInteraction &&
				pressedInteraction === interactionState.hovered
			) {
				this.emitInteraction(
					"click",
					pressedInteraction,
					touchId,
					object,
					object.position.clone().normalize(),
					interactionState,
				);
			}
		}
		this.interactionStates.delete(touchId);

		if (object.shouldRegisterAsClick) {
			const direction = object.position.clone().normalize();
			this.emit("click", touchId, direction);
		}

		this.touchPoints.delete(touchId);
		this.touchGroup.remove(object);

		this.emit("remove", touchId);
	}

	getTouchPoint(touchId: TouchId) {
		return this.touchPoints.get(touchId);
	}

	getTouchPoints() {
		return Array.from(this.touchPoints.values());
	}

	setCameraQuaternion(quaternion: THREE.Quaternion) {
		const changed =
			this.cameraQuaternion.x !== quaternion.x ||
			this.cameraQuaternion.y !== quaternion.y ||
			this.cameraQuaternion.z !== quaternion.z ||
			this.cameraQuaternion.w !== quaternion.w;

		this.cameraQuaternion.copy(quaternion);

		if (changed) {
			this.updateTouchPointsForCameraRotation();
		}
	}
}
