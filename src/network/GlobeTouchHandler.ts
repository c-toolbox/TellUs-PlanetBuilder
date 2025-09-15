import * as THREE from "three";
import { EventEmitter } from "events";
import { TuioSocket } from "@/network/TuioSocket";
import { TouchId } from "@/network/tuioProtocol";

import circleTexture from "@/assets/circle.png";

const ORIGIN = new THREE.Vector3(0, 0, 0);
const TOUCH_RADIUS = 0.05;

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

		let points: [number, number][] = [];
		for (let i = 0; i < 36; i++) {
			points.push([(i / 36) * 2 * Math.PI, 0]);
			points.push([(i / 36) * 2 * Math.PI, Math.PI / 2]);
			points.push([0, (i / 36) * 2 * Math.PI]);
		}
		points.forEach(([p, y], i) => {
			// this.addTouch(i);
			// this.updateTouch(i, p, y);
		});
	}

	addTouch(id: TouchId) {
		const mat = this.touchMaterial.clone();
		mat.color = new THREE.Color(Math.random() * 0xffffff);
		const object = new THREE.Sprite(mat);
		object.scale.setScalar(TOUCH_RADIUS);
		this.touchGroup.add(object);
		this.touchMap.set(id, object);
	}

	updateTouch(id: TouchId, pitch: number, yaw: number) {
		let object = this.touchMap.get(id);
		if (!object) return console.warn("Unknown touch id:", id);

		// Convert pitch/yaw to direction
		const dir = this.dirFromPitchYaw(pitch, yaw);
		const radius = 0.9;
		object.position.copy(dir).multiplyScalar(radius); // place on polyhedron radius

		// const direction = dirFromPitchYaw(pitch, yaw);
		// handleRayFromPitchYaw(direction);
	}

	removeTouch(id: TouchId) {
		const object = this.touchMap.get(id);
		if (!object) return console.warn("Unknown touch id:", id);

		this.touchMap.delete(id);
		this.touchGroup.remove(object);
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
