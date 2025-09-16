import * as THREE from "three";
import { GlobeTouchHandler } from "@/network/GlobeTouchHandler";

import worldTexUrl from "@/assets/backgrounds/globe/black_and_white.jpeg";
import { ORIGIN } from "@/constants";
import { TileMesh } from "@/geometry/TileMesh";
import { TouchId } from "@/network/tuioProtocol";
import { Tile, tileManager } from "@/geometry/TileMap";
// import worldTexUrl from "@/assets/backgrounds/globe/black_and_white.jpeg";
// import worldTexUrl from "@/assets/backgrounds/numbers.jpeg";

export class WorldScene extends THREE.Scene {
	private touchHandler: GlobeTouchHandler;
	private raycaster: THREE.Raycaster;
	private clickable: THREE.Object3D[];

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
		// this.fog = new THREE.Fog(0x000000, 2, 3);
	}

	private initGlobeTouchHandler() {
		this.touchHandler = new GlobeTouchHandler();
		this.add(this.touchHandler.touchGroup);

		this.touchHandler.on("touch", (touchId: TouchId, vector: THREE.Vector3) => {
			this.handleRaycast(touchId, vector);
		});

		this.raycaster = new THREE.Raycaster();
		this.clickable = [];
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

	makeClickable(group: THREE.Group) {
		group.children.forEach((mesh) => this.clickable.push(mesh));
	}

	private handleRaycast(touchId: TouchId, vector: THREE.Vector3) {
		this.raycaster.set(ORIGIN, vector);

		const touchPoint = this.touchHandler.getTouchPoint(touchId);
		if (!touchPoint) return;

		const intersects = this.raycaster.intersectObjects(this.clickable, true);
		if (intersects.length > 0) {
			const tileMesh = intersects[0].object as TileMesh;
			if (tileMesh) {
				if (touchPoint.tile == Tile.None) {
					touchPoint.setTile(tileManager.getNextTile(tileMesh.tile));
					console.log(
						"touch has no tile, so set it to",
						tileMesh.tile,
						"->",
						touchPoint.tile
					);
				}

				tileMesh.setTile(touchPoint.tile);
			}
		}
	}
}
