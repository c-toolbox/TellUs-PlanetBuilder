import * as THREE from "three";
import { EventEmitter } from "events";
import { TuioSocket } from "@/network/TuioSocket";
import { TouchId } from "@/network/tuioProtocol";

import circleTexture from "@/assets/circle.png";

const ORIGIN = new THREE.Vector3(0, 0, 0);
const TOUCH_RADIUS = 0.1;

export class GlobeTouchHandler extends EventEmitter {
	public touchGroup: THREE.Group;
	private touchMap: Map<TouchId, THREE.Sprite>;
	private touchMaterial: THREE.SpriteMaterial;

	private raycaster: THREE.Raycaster;

	constructor() {
		super();

		this.touchGroup = new THREE.Group();

		/* ThreeJS */

		this.touchMap = new Map<TouchId, THREE.Sprite>();
		this.raycaster = new THREE.Raycaster();

		const textureLoader = new THREE.TextureLoader();
		this.touchMaterial = new THREE.SpriteMaterial({
			map: textureLoader.load(circleTexture),
			transparent: true,
			// depthWrite: false,
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
			this.handleRayFromPitchYaw(direction);
		});
	}

	addTouch(id: TouchId) {
		// const touchSphereGeometry = new THREE.SphereGeometry(0.1, 12, 10);
		// const touchSphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
		// const sphere = new THREE.Mesh(touchSphereGeometry, touchSphereMat.clone());
		// this.touchMap.set(id, sphere);
		// this.emit("add", sphere);

		const object = new THREE.Sprite(this.touchMaterial);
		object.scale.setScalar(TOUCH_RADIUS);
		this.touchGroup.add(object);
		this.touchMap.set(id, object);
		// this.emit("add", object);
	}

	updateTouch(id: TouchId, pitch: number, yaw: number) {
		let object = this.touchMap.get(id);
		if (!object) return console.warn("Unknown touch id:", id);

		// Convert pitch/yaw to direction
		const dir = this.dirFromPitchYaw(pitch, yaw);
		const desiredRadius = 2;
		object.position.copy(dir).multiplyScalar(desiredRadius / 2); // place on polyhedron radius

		console.log("Move", id, object.position);

		// const direction = dirFromPitchYaw(pitch, yaw);
		// handleRayFromPitchYaw(direction);
	}

	removeTouch(id: TouchId) {
		const object = this.touchMap.get(id);
		if (!object) return console.warn("Unknown touch id:", id);

		this.touchMap.delete(id);
		this.touchGroup.remove(object);
		// this.emit("remove", object);
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

	handleRayFromPitchYaw(direction: THREE.Vector3) {
		this.raycaster.set(ORIGIN, direction);
		// check transparent faces first (both groups)

		/*
		const intersects = this.raycaster.intersectObjects(clickableObjects, true);
		if (intersects.length > 0) {
			const hit = intersects[0];
			const obj = intersects[0].object as THREE.Mesh;

			// pick a random color
			obj.userData.tileIndex = (obj.userData.tileIndex + 1) % 4;
			// const col = getNextColor(obj.userData.tileIndex);
			const col = Math.floor(Math.random() * 0xffffff);
			// console.log("click", obj.userData.tileIndex, col);

			const mat = obj.material as THREE.Material & { color?: THREE.Color };
			(mat as any).color.setHex(col);

			// return hit info for debugging
			return {
				object: obj,
				point: hit.point,
				faceType: (obj.userData as any).faceType,
			};
		}
		return null;
		*/
	}
}
