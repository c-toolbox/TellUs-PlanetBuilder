import * as THREE from "three";

import worldTexUrl from "@/assets/world_standard.jpg";
import { GlobeTouchHandler } from "@/network/GlobeTouchHandler";

export class WorldScene extends THREE.Scene {
	private touchHandler: GlobeTouchHandler;

	public camera: THREE.PerspectiveCamera;
	public debugCamera: THREE.PerspectiveCamera;

	constructor() {
		super();

		// Touch handling
		this.initGlobeTouchHandler();

		this.addBackground();

		// Camera at origin (we rotate its orientation)
		this.camera = new THREE.PerspectiveCamera(75, 1.0, 0.01, 1000);
		this.camera.position.set(0, 0, 0);
		this.camera.lookAt(0, 0, 1);

		// Camera at origin (we rotate its orientation)
		this.debugCamera = new THREE.PerspectiveCamera(75, 1.0, 0.01, 1000);
		this.debugCamera.position.set(2, 2, 2);
		this.debugCamera.lookAt(0, 0, 0);

		// Lighting
		const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
		this.add(hemi);
		const dir = new THREE.DirectionalLight(0xffffff, 0.6);
		dir.position.set(5, 10, 7);
		this.add(dir);

		// Fog
		this.fog = new THREE.Fog(0x000000, 2, 3);
	}

	private initGlobeTouchHandler() {
		this.touchHandler = new GlobeTouchHandler();
		this.add(this.touchHandler.touchGroup);

		this.touchHandler.on("add", (object: THREE.Object3D) => {
			this.add(object);
		});
		this.touchHandler.on("delete", (object: THREE.Object3D) => {
			this.remove(object);
		});
	}

	private addBackground() {
		const loader = new THREE.TextureLoader();
		loader.load(worldTexUrl, (tex) => {
			// tex.colorSpace = THREE.SRGBColorSpace;

			const geometry = new THREE.SphereGeometry(500, 64, 64); // big sphere
			const material = new THREE.MeshBasicMaterial({
				map: tex,
				side: THREE.BackSide, // render inside of sphere
			});
			const sphere = new THREE.Mesh(geometry, material);
			this.add(sphere);
		});
	}
}
