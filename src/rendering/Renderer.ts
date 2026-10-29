import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GlobeProjection } from "@/rendering/GlobeProjection";
import type BaseScene from "../scenes/BaseScene";
import { globalServices } from "@/network/GlobalServices";
import { GLOBE_FOV_DEGREES } from "@/constants";

export enum ViewMode {
	GlobePreview = "globe_preview",
	ProjectorOutput = "azimuthal",
	Scene3D = "3d_scene",
}

export const viewModes = [
	{ id: ViewMode.GlobePreview, title: "Globe preview" },
	{ id: ViewMode.ProjectorOutput, title: "Projector output" },
	{ id: ViewMode.Scene3D, title: "3D scene" },
] as const;

const MAX_GLOBE_TOUCHES = 64;

export class Renderer extends THREE.WebGLRenderer {
	public currentScene: BaseScene | null = null;
	public readonly projection: GlobeProjection;

	public projectionCamera: THREE.PerspectiveCamera;
	private initialProjectionCameraQuaternion = new THREE.Quaternion();

	public scene3DCamera: THREE.PerspectiveCamera;
	private scene3DControls: OrbitControls;

	public globePreviewCamera: THREE.PerspectiveCamera;
	private globePreviewControls: OrbitControls;

	private viewMode: ViewMode = import.meta.env.DEV
		? ViewMode.GlobePreview
		: ViewMode.ProjectorOutput;
	private globeRaycaster = new THREE.Raycaster();
	private activeGlobePointers = new Map<number, number>();
	private nextSimulatedTouchId = -1;

	constructor() {
		super({ antialias: true });
		this.setPixelRatio(window.devicePixelRatio);

		// Attach renderer to DOM
		const container = document.getElementById("container");
		if (!container) throw new Error("Container not found");
		container.appendChild(this.domElement);

		/* Cameras */

		// Shared by projector output and globe preview; only its orientation matters.
		this.projectionCamera = new THREE.PerspectiveCamera(75, 1.0, 0.01, 10000);
		this.projectionCamera.position.set(0, 0, 0);
		this.projectionCamera.up.set(0, 0, 1);
		this.projectionCamera.lookAt(0, -1, 0);
		this.initialProjectionCameraQuaternion.copy(this.projectionCamera.quaternion);

		this.scene3DCamera = new THREE.PerspectiveCamera(75, 1.0, 0.01, 10000);
		this.scene3DCamera.position.set(0, 0, -2);
		this.scene3DCamera.lookAt(0, 0, 0);
		this.scene3DControls = this.createScene3DControls();

		this.globePreviewCamera = this.createGlobePreviewCamera();
		this.globePreviewControls = this.createGlobePreviewControls();

		// Azimuthal output and globe preview
		this.projection = new GlobeProjection();
		this.setViewMode(this.viewMode);

		// Resize handler
		window.addEventListener("resize", () => this.resize());
		this.resize();

		this.setupGlobeTouchSimulation();

		//
		// Animation loop: update camera orientation from yaw/pitch and render
		//

		const FIXED_TIME_STEP = 1000 / 60; // 60 fps logic = ~16.67ms
		let last = performance.now();
		let accumulator = 0;

		const animate = (now: number) => {
			requestAnimationFrame(animate);

			let delta = now - last;
			if (delta > 1000) delta = FIXED_TIME_STEP; // handle tab switch / pause
			last = now;
			accumulator += delta;

			// Run updates in fixed steps
			while (accumulator >= FIXED_TIME_STEP) {
				this.updateFixed(FIXED_TIME_STEP / 1000); // pass seconds
				accumulator -= FIXED_TIME_STEP;
			}

			// Render once per frame
			this.redraw(delta);
		};
		requestAnimationFrame(animate);
	}

	private createGlobePreviewCamera() {
		const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
		camera.up.set(0, 1, 0);
		camera.position.set(0, 0, 3);
		camera.lookAt(0, 0, 0);
		return camera;
	}

	private createGlobePreviewControls() {
		const controls = new OrbitControls(this.globePreviewCamera, this.domElement);
		controls.target.set(0, 0, 0);
		controls.enablePan = false;
		controls.enableDamping = true;
		controls.dampingFactor = 0.1;
		controls.rotateSpeed = 0.8;
		controls.zoomSpeed = 1.2;
		controls.minDistance = 1.5;
		controls.maxDistance = 10;
		controls.update();
		return controls;
	}

	private createScene3DControls() {
		const controls = new OrbitControls(this.scene3DCamera, this.domElement);
		controls.rotateSpeed = 0.8;
		controls.zoomSpeed = 1.2;
		controls.enablePan = false;
		controls.enableDamping = true;
		controls.dampingFactor = 0.2;
		controls.target.set(0, 0, 0);
		controls.update();
		return controls;
	}

	getViewMode(): ViewMode {
		return this.viewMode;
	}

	setViewMode(viewMode: ViewMode) {
		this.cancelGlobeTouches();
		this.viewMode = viewMode;
		this.scene3DControls.enabled = viewMode === ViewMode.Scene3D;
		this.globePreviewControls.enabled = viewMode === ViewMode.GlobePreview;
		this.resize();
	}

	// Destination for a scene's final azimuthal image, including its effects.
	get projectionOutputTarget(): THREE.WebGLRenderTarget | null {
		return this.viewMode === ViewMode.GlobePreview
			? this.projection.globePreviewTarget
			: null;
	}

	renderProjection(scene: THREE.Scene, target = this.projectionOutputTarget) {
		this.projection.render(
			this,
			scene,
			this.projectionCamera,
			target,
		);
	}

	// Simulate sphere touches in globe preview and release them when focus is lost.
	private setupGlobeTouchSimulation() {
		window.addEventListener("blur", () => this.cancelGlobeTouches());
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) this.cancelGlobeTouches();
		});
		this.domElement.addEventListener(
			"pointerdown",
			(event) => this.handleGlobePointerDown(event),
			true,
		);
		this.domElement.addEventListener(
			"pointermove",
			(event) => this.handleGlobePointerMove(event),
			true,
		);
		this.domElement.addEventListener(
			"pointerup",
			(event) => this.handleGlobePointerEnd(event),
			true,
		);
		this.domElement.addEventListener(
			"pointercancel",
			(event) => this.handleGlobePointerEnd(event),
			true,
		);
		this.domElement.addEventListener(
			"lostpointercapture",
			(event) => this.handleGlobePointerEnd(event),
			true,
		);
	}

	private getGlobeTouchPosition(event: PointerEvent) {
		const bounds = this.domElement.getBoundingClientRect();
		const pointer = new THREE.Vector2(
			((event.clientX - bounds.left) / bounds.width) * 2 - 1,
			-((event.clientY - bounds.top) / bounds.height) * 2 + 1,
		);
		this.globeRaycaster.setFromCamera(pointer, this.globePreviewCamera);
		const [intersection] = this.globeRaycaster.intersectObject(
			this.projection.globePreviewMesh,
		);
		if (!intersection) return undefined;

		const globeDirection = intersection.point.clone().normalize();
		const direction = new THREE.Vector3(
			globeDirection.x,
			globeDirection.z,
			globeDirection.y,
		);
		const scaledPitch = Math.acos(THREE.MathUtils.clamp(direction.z, -1, 1));
		if (scaledPitch > Math.PI * (GLOBE_FOV_DEGREES / 360)) return undefined;
		const pitch = scaledPitch / (GLOBE_FOV_DEGREES / 360);
		const yaw = Math.atan2(-direction.y, direction.x);
		return { pitch, yaw };
	}

	private handleGlobePointerDown(event: PointerEvent) {
		if (this.viewMode !== ViewMode.GlobePreview || event.button !== 0) return;
		if (this.activeGlobePointers.has(event.pointerId)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}

		const position = this.getGlobeTouchPosition(event);
		if (!position) return;
		if (this.activeGlobePointers.size >= MAX_GLOBE_TOUCHES) return;

		event.preventDefault();
		event.stopImmediatePropagation();

		// Keep simulated IDs separate from hardware TUIO session IDs.
		const touchId = this.nextSimulatedTouchId--;
		this.activeGlobePointers.set(event.pointerId, touchId);
		globalServices.touchHandler.addTouch(touchId);
		this.domElement.setPointerCapture(event.pointerId);
		globalServices.touchHandler.updateTouch(
			touchId,
			position.pitch,
			position.yaw,
		);
	}

	private handleGlobePointerMove(event: PointerEvent) {
		const touchId = this.activeGlobePointers.get(event.pointerId);
		if (touchId === undefined) return;

		event.preventDefault();
		event.stopImmediatePropagation();
		const position = this.getGlobeTouchPosition(event);
		if (position) {
			globalServices.touchHandler.updateTouch(
				touchId,
				position.pitch,
				position.yaw,
			);
		}
	}

	private handleGlobePointerEnd(event: PointerEvent) {
		if (!this.activeGlobePointers.has(event.pointerId)) return;

		event.preventDefault();
		event.stopImmediatePropagation();
		this.releaseGlobePointer(event.pointerId);
	}

	private releaseGlobePointer(pointerId: number) {
		const touchId = this.activeGlobePointers.get(pointerId);
		if (touchId === undefined) return;

		// Forget the pointer before releasing capture, which can emit another event.
		this.activeGlobePointers.delete(pointerId);
		globalServices.touchHandler.removeTouch(touchId);
		if (this.domElement.hasPointerCapture(pointerId)) {
			this.domElement.releasePointerCapture(pointerId);
		}
	}

	private cancelGlobeTouches() {
		for (const pointerId of this.activeGlobePointers.keys()) {
			this.releaseGlobePointer(pointerId);
		}
	}

	setScene(scene: BaseScene) {
		this.cancelGlobeTouches();
		this.projectionCamera.position.set(0, 0, 0);
		this.projectionCamera.quaternion.copy(this.initialProjectionCameraQuaternion);
		globalServices.touchHandler.setCameraQuaternion(
			this.projectionCamera.quaternion,
		);
		this.currentScene = scene;
		this.currentScene.applyRendererSettings(this);
	}

	redraw(delta: number) {
		if (!this.currentScene) return;

		globalServices.touchHandler.update();
		this.currentScene.updateTweens();
		this.currentScene.update(delta);
		this.scene3DControls.update();
		this.globePreviewControls.update();

		if (this.viewMode === ViewMode.Scene3D) {
			this.renderScene3D();
		} else {
			this.currentScene.renderScene(this);
			if (this.viewMode === ViewMode.GlobePreview) {
				this.setRenderTarget(null);
				this.render(this.projection.globePreviewScene, this.globePreviewCamera);
			}
		}

		this.currentScene.postRender(this);
	}

	renderScene3D() {
		if (this.currentScene) this.render(this.currentScene, this.scene3DCamera);
	}

	updateFixed(delta: number) {
		if (!this.currentScene) return;

		this.currentScene.updateFixed(delta);
	}

	resize() {
		const size = Math.min(window.innerWidth, window.innerHeight);
		const width = this.viewMode === ViewMode.ProjectorOutput ? size : window.innerWidth;
		const height = this.viewMode === ViewMode.ProjectorOutput ? size : window.innerHeight;
		this.setSize(width, height);

		this.projectionCamera.aspect = 1 / 1;
		this.projectionCamera.updateProjectionMatrix();

		this.scene3DCamera.aspect = width / height;
		this.scene3DCamera.updateProjectionMatrix();

		this.globePreviewCamera.aspect = width / height;
		this.globePreviewCamera.updateProjectionMatrix();

	}
}
