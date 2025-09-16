import * as THREE from "three";
import { EventEmitter } from "events";
import { TuioSocket } from "@/network/TuioSocket";
import { TouchId } from "@/network/tuioProtocol";
import { TouchPoint } from "./TouchPoint";
import { TOUCH_DISTANCE, TOUCH_SIZE } from "@/constants";

import circleAsset from "@/assets/circle.png";

export class GlobeTouchHandler extends EventEmitter {
	public touchGroup: THREE.Group;
	private touchPoints: Map<TouchId, TouchPoint>;
	private touchMaterial: THREE.MeshBasicMaterial;

	constructor() {
		super();

		this.touchGroup = new THREE.Group();

		/* ThreeJS */

		this.touchPoints = new Map<TouchId, TouchPoint>();

		const textureLoader = new THREE.TextureLoader();
		this.touchMaterial = new THREE.MeshBasicMaterial({
			map: textureLoader.load(circleAsset),
			transparent: true,
			// premultipliedAlpha: true,
			side: THREE.DoubleSide,
			depthWrite: true,
		});

		/* TuIO */

		const tuioSocket = new TuioSocket();
		tuioSocket.on("touchAdd", (id: TouchId) => {
			this.addTouch(id);
		});
		tuioSocket.on("touchRemove", (id: TouchId) => {
			this.removeTouch(id);
		});
		tuioSocket.on("touchUpdate", (id: TouchId, pitch: number, yaw: number) => {
			this.updateTouch(id, pitch, yaw);

			const direction = this.dirFromPitchYaw(pitch, yaw);
			this.emit("touch", id, direction);
		});
	}

	addTouch(touchId: TouchId) {
		const geometry = new THREE.PlaneGeometry(1, 1);

		const mesh = new TouchPoint(geometry, this.touchMaterial.clone());

		// Scale with distance so angular size is constant
		mesh.scale.setScalar(TOUCH_SIZE * TOUCH_DISTANCE);

		this.touchGroup.add(mesh);
		this.touchPoints.set(touchId, mesh);
	}

	updateTouch(touchId: TouchId, pitch: number, yaw: number) {
		let object = this.touchPoints.get(touchId);
		if (!object) return console.warn("Unknown touch id:", touchId);

		// Convert pitch/yaw to direction
		const dir = this.dirFromPitchYaw(pitch, yaw);
		const radius = 0.9;
		object.position.copy(dir).multiplyScalar(radius);
		object.lookAt(new THREE.Vector3(0, 0, 0));
	}

	removeTouch(touchId: TouchId) {
		const object = this.touchPoints.get(touchId);
		if (!object) return console.warn("Unknown touch id:", touchId);

		this.touchPoints.delete(touchId);
		this.touchGroup.remove(object);
	}

	getTouchPoint(touchId: TouchId) {
		return this.touchPoints.get(touchId);
	}

	dirFromPitchYaw(pitch: number, yaw: number): THREE.Vector3 {
		// assume yaw = rotation about Y (horizontal), pitch = rotation about X (vertical)
		// quaternion order matches camera's: q = yaw(Y) * pitch(X)
		const qYaw = new THREE.Quaternion().setFromAxisAngle(
			new THREE.Vector3(0, 1, 0),
			yaw
		);
		const qPitch = new THREE.Quaternion().setFromAxisAngle(
			new THREE.Vector3(1, 0, 0),
			pitch
		);
		const q = qYaw.multiply(qPitch);
		const forward = new THREE.Vector3(0, 0, 1);
		return forward.applyQuaternion(q).normalize();
	}
}
