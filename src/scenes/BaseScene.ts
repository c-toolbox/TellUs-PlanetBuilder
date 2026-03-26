import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

import { Renderer } from "./Renderer";
import { globalServices } from "@/network/GlobalServices";
import { TouchId } from "@/network/tuioProtocol";
import Player from "@/network/Player";
import { BACKGROUND_DISTANCE, ORIGIN } from "@/constants";
import { SceneKey, sceneManager, scenes } from "./SceneManager";
import { UiConfigEvent } from "@/network/uiProtocol";

export default abstract class BaseScene extends THREE.Scene {
	protected omniSocket = globalServices.omniSocket;
	protected touchHandler = globalServices.touchHandler;
	protected uiSocket = globalServices.uiSocket;

	protected raycaster: THREE.Raycaster;
	protected clickable: THREE.Object3D[];

	protected playerGroup: THREE.Group;
	protected players: Map<string, Player>;

	constructor() {
		super();

		// Players
		this.playerGroup = new THREE.Group();
		this.add(this.playerGroup);
		this.players = new Map<string, Player>();

		this.raycaster = new THREE.Raycaster();
		this.clickable = [];

		this.onTouch = this.onTouch.bind(this);
		this.onClick = this.onClick.bind(this);
		this.onRemove = this.onRemove.bind(this);
	}

	public setRendererSettings(renderer: Renderer) {}

	/* Touch input */

	public makeClickable(group: THREE.Group) {
		group.children.forEach((mesh) => this.clickable.push(mesh));
	}

	/* Scene management */

	onEnter(renderer: Renderer) {
		this.initializeUi();
		this.sendUiConfig();

		this.add(this.touchHandler.touchGroup);
		this.touchHandler.on("touch", this.onTouch);
		this.touchHandler.on("click", this.onClick);
		this.touchHandler.on("remove", this.onRemove);
	}

	onExit(renderer: Renderer) {
		this.touchHandler.off("touch", this.onTouch);
		this.touchHandler.off("click", this.onClick);
		this.touchHandler.off("remove", this.onRemove);

		this.uiSocket.removeAllListeners();
	}

	/* Rendering */

	renderScene(renderer: Renderer) {
		const projectionScene = renderer.projectionScene;

		// Update cube camera orientation
		projectionScene.cubeCamera.position.copy(renderer.centerCamera.position);
		projectionScene.cubeCamera.quaternion.copy(
			renderer.centerCamera.quaternion,
		);
		projectionScene.cubeCamera.update(renderer, this);

		// Render Azimuthal Equidistant Projection (fisheye)
		renderer.setRenderTarget(null);
		renderer.render(projectionScene, projectionScene.screenCamera);
	}

	update(delta: number) {}

	updateFixed(delta: number) {}

	render(renderer: Renderer) {}

	postRender() {}

	/* 3D helpers */

	protected addBackground(
		assetPath: string,
		tintColor: THREE.ColorRepresentation = 0xffffff,
	) {
		const loader = new THREE.TextureLoader();
		loader.load(assetPath, (texture) => {
			texture.colorSpace = THREE.SRGBColorSpace;

			const geometry = new THREE.SphereGeometry(BACKGROUND_DISTANCE, 64, 64);
			const material = new THREE.MeshBasicMaterial({
				map: texture,
				// side: THREE.DoubleSide,
				side: THREE.BackSide,
			});
			material.color.set(tintColor);
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

	/* Touch events */

	protected onTouch(touchId: TouchId, vector: THREE.Vector3) {}

	protected onClick(touchId: TouchId, vector: THREE.Vector3) {}

	protected onRemove(touchId: TouchId) {}

	/* Socket UI */

	protected initializeUi() {
		this.uiSocket.on("request", () => this.sendUiConfig());

		this.uiSocket.on("scene", (value: SceneKey) => {
			sceneManager.setScene(scenes[value]);
		});
	}

	protected sendUiConfig() {
		this.uiSocket.send(this.uiConfig);
	}

	protected bindUiConfigKey<T extends string>(
		config: Record<string, any>,
		key: T,
	) {
		this.uiSocket.on(key, (value: any) => {
			config[key] = value;
			this.sendUiConfig();
		});
	}

	protected abstract get uiConfig(): UiConfigEvent;
}
