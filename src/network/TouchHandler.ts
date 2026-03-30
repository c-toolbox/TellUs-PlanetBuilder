import * as THREE from "three";
import { EventEmitter } from "events";
import { TuioSocket } from "@/network/TuioSocket";
import { TouchId } from "@/network/tuioProtocol";
import { TouchPoint } from "./TouchPoint";
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

		// Convert to camera-local spherical coordinates where +Z is center (screen center),
		// +Y is up, +X is right.
		const direction = new THREE.Vector3(
			Math.sin(scaledPitch) * Math.cos(yaw),
			-Math.sin(scaledPitch) * Math.sin(yaw), // Flip
			Math.cos(scaledPitch),
		);

		// Apply camera quaternion to emit world-space direction
		const worldDirection = direction
			.clone()
			.applyQuaternion(this.cameraQuaternion);

		object.position.copy(worldDirection).multiplyScalar(TOUCH_DISTANCE);
		object.lookAt(ORIGIN);

		this.emit("touch", touchId, worldDirection);
	}

	removeTouch(touchId: TouchId) {
		const object = this.touchPoints.get(touchId);
		if (!object) return console.warn("Unknown touch id:", touchId);

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

	setCameraQuaternion(quaternion: THREE.Quaternion) {
		this.cameraQuaternion.copy(quaternion);
	}
}
