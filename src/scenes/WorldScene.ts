import * as THREE from "three";
import { GlobeTouchHandler } from "@/network/GlobeTouchHandler";

import { ORIGIN, SHOW_PLAYERS } from "@/constants";
import { TileMesh } from "@/geometry/TileMesh";
import { TouchId } from "@/network/tuioProtocol";
import { Tile, tileManager } from "@/geometry/TileManager";
import {
	Movement,
	OmniAuthorized,
	OmniConnect,
	OmniDisconnect,
	OmniError,
	OmniJoin,
	OmniLeave,
	OmniSocket,
} from "@/network/OmniSocket";
import { Player } from "@/network/Player";

import backgroundAsset from "@/assets/backgrounds/globe/black_and_white.jpeg";
// import backgroundAsset from "@/assets/backgrounds/globe/heightmap.png";
// import backgroundAsset from "@/assets/backgrounds/globe/standard.jpg";
// import backgroundAsset from "@/assets/backgrounds/globe/truecolor.png";
// import backgroundAsset from "@/assets/backgrounds/streetview/iviv.jpeg";
// import backgroundAsset from "@/assets/backgrounds/streetview/tossa_de_mar.jpeg";
// import backgroundAsset from "@/assets/backgrounds/numbers.jpeg";
// import backgroundAsset from "@/assets/backgrounds/soccer.jpg";

export class WorldScene extends THREE.Scene {
	private touchHandler: GlobeTouchHandler;
	private raycaster: THREE.Raycaster;
	private clickable: THREE.Object3D[];

	private omni: OmniSocket;
	private playerGroup: THREE.Group;
	private players: Map<string, Player>;

	public camera: THREE.PerspectiveCamera;
	public debugCamera: THREE.PerspectiveCamera;

	constructor() {
		super();

		// Touch handling
		this.initGlobeTouchHandler();

		// Multiplayer handling
		this.initOmni();

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

	private initOmni() {
		/* Omni server */

		this.omni = new OmniSocket();
		(window as any).omni = this.omni;

		this.omni.on("server_connect", (data: OmniConnect) => {});
		this.omni.on("server_disconnect", (data: OmniDisconnect) => {});
		this.omni.on("server_authorized", (data: OmniAuthorized) => {});
		this.omni.on("server_join", (data: OmniJoin) => {
			if (data.role == "guest") {
				const player = new Player(data.user);
				this.playerGroup.add(player);
				this.players.set(data.user, player);

				this.omni.sendSetInput("joystick");
			}
		});
		this.omni.on("server_leave", (data: OmniLeave) => {
			const player = this.players.get(data.user);
			if (player) {
				this.players.delete(data.user);
				this.playerGroup.remove(player);
			}
		});
		this.omni.on("server_error", (data: OmniError) => {});
		this.omni.on("movement", (data: Movement) => {
			let player = this.players.get(data.user);
			if (player) {
				player.move(data.x, data.y);
			}
		});

		this.omni.connect();

		/* Players */

		this.playerGroup = new THREE.Group();
		this.add(this.playerGroup);
		this.players = new Map<string, Player>();
	}

	private addBackground() {
		const loader = new THREE.TextureLoader();
		loader.load(backgroundAsset, (tex) => {
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

	update() {
		this.players.forEach((player) => player.update());
	}
}
