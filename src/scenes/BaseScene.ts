import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

import { GlobeTouchHandler } from "@/network/GlobeTouchHandler";
import { TouchId } from "@/network/tuioProtocol";
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
import Player from "@/network/Player";
import { BACKGROUND_DISTANCE, ORIGIN } from "@/constants";
import { Renderer } from "./Renderer";

export default class BaseScene extends THREE.Scene {
	protected touchHandler: GlobeTouchHandler;
	protected raycaster: THREE.Raycaster;
	protected clickable: THREE.Object3D[];

	private omni: OmniSocket;
	private playerGroup: THREE.Group;
	protected players: Map<string, Player>;

	constructor() {
		super();

		// Touch input
		this.initTouchHandler();

		// Online input
		// this.initOmni();

		// Players
		this.playerGroup = new THREE.Group();
		this.add(this.playerGroup);
		this.players = new Map<string, Player>();
	}

	public setRendererSettings(renderer: Renderer) {}

	/* Touch input */

	private initTouchHandler() {
		this.touchHandler = new GlobeTouchHandler();
		this.add(this.touchHandler.touchGroup);

		this.raycaster = new THREE.Raycaster();
		this.clickable = [];
	}

	public makeClickable(group: THREE.Group) {
		group.children.forEach((mesh) => this.clickable.push(mesh));
	}

	protected handleRaycast(
		touchId: TouchId,
		vector: THREE.Vector3,
		type: "touch" | "click"
	) {}

	/* Online input */

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
	}

	/* 3D helpers */

	protected addBackground(assetPath: string) {
		const loader = new THREE.TextureLoader();
		loader.load(assetPath, (texture) => {
			// tex.colorSpace = THREE.SRGBColorSpace;

			const geometry = new THREE.SphereGeometry(BACKGROUND_DISTANCE, 64, 64);
			const material = new THREE.MeshBasicMaterial({
				map: texture,
				side: THREE.DoubleSide,
			});
			const sphere = new THREE.Mesh(geometry, material);
			sphere.scale.x *= -1;
			this.add(sphere);
		});
	}

	protected addText({
		text,
		color = 0xffffff,
		size = 0.1,
		position,
	}: {
		text: string;
		color?: number;
		size?: number;
		position: THREE.Vector3;
	}) {
		const loader = new FontLoader();
		loader.load("../assets/fonts/Lato/Black.json", (font) => {
			const material = new THREE.MeshBasicMaterial({ color: color });

			const shapes = font.generateShapes(text, size);
			const geometry = new THREE.ShapeGeometry(shapes);

			// Center text
			geometry.computeBoundingBox();
			const bounds = geometry.boundingBox!;
			geometry.translate(-(bounds.max.x - bounds.min.x) / 2, 0, 0);

			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.copy(position);
			mesh.lookAt(ORIGIN);

			this.add(mesh);
		});
	}

	update(delta: number) {}

	updateFixed(delta: number) {}

	postRender() {}
}
