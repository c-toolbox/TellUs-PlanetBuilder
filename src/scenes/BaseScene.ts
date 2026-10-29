import * as THREE from "three";
import { Group, Tween } from "@tweenjs/tween.js";
import type { Renderer } from "@/rendering/Renderer";
import { globalServices } from "@/network/GlobalServices";
import type { TouchId } from "@/network/tuioProtocol";
import type { TouchInteraction } from "@/network/TouchInteraction";
import type { UiConfigEvent } from "@/network/socket_ui/protocol";

export default abstract class BaseScene extends THREE.Scene {
	protected renderer: Renderer | null = null;
	protected touchHandler = globalServices.touchHandler;
	protected sceneManager = globalServices.sceneManager;
	private tweenGroup = new Group();
	private touchInteractions = new Set<TouchInteraction>();
	private touchInteractionsActive = false;
	protected uiSocket = globalServices.uiSocket;

	constructor() {
		super();
		this.onTouch = this.onTouch.bind(this);
		this.onRemove = this.onRemove.bind(this);
	}

	applyRendererSettings(renderer: Renderer) {
		renderer.setClearColor(0x000000);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.NoToneMapping;
		renderer.autoClear = true;
	}

	// Register once when creating an object. BaseScene activates it only in this scene.
	protected registerTouchInteraction(interaction: TouchInteraction) {
		this.touchInteractions.add(interaction);
		if (this.touchInteractionsActive) {
			this.touchHandler.registerInteraction(interaction);
		}
		return interaction;
	}

	onSceneEnter(renderer: Renderer) {
		this.renderer = renderer;
		this.registerSocketUiListeners();
		this.sendSocketUiConfig();
		this.add(this.touchHandler.touchGroup);
		this.touchHandler.on("touch", this.onTouch);
		this.touchHandler.on("remove", this.onRemove);
		this.touchInteractionsActive = true;
		this.touchInteractions.forEach((interaction) =>
			this.touchHandler.registerInteraction(interaction),
		);
	}

	onSceneExit(renderer: Renderer) {
		this.uiSocket.removeAllListeners();
		this.tweenGroup.getAll().forEach((tween) => tween.stop());
		this.tweenGroup.removeAll();
		this.touchInteractionsActive = false;
		this.touchInteractions.forEach((interaction) =>
			this.touchHandler.unregisterInteraction(interaction),
		);
		this.touchHandler.off("touch", this.onTouch);
		this.touchHandler.off("remove", this.onRemove);
		this.renderer = null;
	}

	renderScene(renderer: Renderer) {
		renderer.renderProjection(this);
	}

	updateTweens() {
		this.tweenGroup.update();
		this.tweenGroup.getAll()
			.filter((tween) => !tween.isPlaying())
			.forEach((tween) => this.tweenGroup.remove(tween));
	}

	protected createTween<T extends object>(target: T) {
		const tween = new Tween(target);
		this.tweenGroup.add(tween);
		return tween;
	}

	protected registerSocketUiListeners() {
		// On SocketUI refreshing, which then sends a request to get the config
		this.uiSocket.on("request", () => this.sendSocketUiConfig());
	}

	protected sendSocketUiConfig() {
		this.uiSocket.send(this.socketUiConfig);
	}

	protected abstract get socketUiConfig(): UiConfigEvent;

	// Frame updates use milliseconds; fixed updates use seconds.
	update(delta: number) {}
	updateFixed(delta: number) {}

	postRender(renderer: Renderer) {
		this.touchHandler.setCameraQuaternion(renderer.projectionCamera.quaternion);
	}

	protected onTouch(touchId: TouchId, direction: THREE.Vector3) {}
	protected onRemove(touchId: TouchId) {}

	protected unregisterTouchInteraction(interaction: TouchInteraction) {
		this.touchInteractions.delete(interaction);
		this.touchHandler.unregisterInteraction(interaction);
	}
}
