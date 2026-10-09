import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ProjectionScene } from "@/rendering/ProjectionScene";
import BaseScene from "../scenes/BaseScene";
import { globalServices } from "@/network/GlobalServices";
import { GLOBE_FOV_DEGREES } from "@/constants";

type ViewMode = "azimuthal" | "scene" | "sphere";

export class Renderer extends THREE.WebGLRenderer {
	public currentScene: BaseScene;
	public projectionScene: ProjectionScene;

	private debugControls: TrackballControls;
	private sphericalDisplayControls: OrbitControls;
	public centerCamera: THREE.PerspectiveCamera;
	public debugCamera: THREE.PerspectiveCamera;
	public sphericalDisplayCamera: THREE.PerspectiveCamera;

	private viewMode: ViewMode = "azimuthal";
	private sphericalDisplayRaycaster = new THREE.Raycaster();
	private activeSphereTouch?: { pointerId: number; touchId: number };
	private nextSimulatedTouchId = -1;

	constructor() {
		super({ antialias: true });
		this.setPixelRatio(window.devicePixelRatio);

		// Attach renderer to DOM
		const container = document.getElementById("container");
		if (!container) throw new Error("Container not found");
		container.appendChild(this.domElement);

		/* Cameras */

		// This camera stays at the origin, only its orientation matters
		this.centerCamera = new THREE.PerspectiveCamera(75, 1.0, 0.01, 10000);
		this.centerCamera.position.set(0, 0, 0);
		this.centerCamera.lookAt(0, 0, 1);

		// Debug camera, movable with TrackballControls
		this.debugCamera = new THREE.PerspectiveCamera(75, 1.0, 0.01, 10000);
		this.debugCamera.position.set(0, 2, 0);
		this.debugCamera.up.set(0, 0, 1);
		this.debugCamera.lookAt(0, 0, 0);
		this.centerCamera.quaternion.copy(this.debugCamera.quaternion);

		// Trackball controls for debug camera
		this.debugControls = new TrackballControls(
			this.debugCamera,
			this.domElement,
		);
		this.configureOrbitControls(this.debugControls);

		this.sphericalDisplayCamera = new THREE.PerspectiveCamera(
			70,
			1,
			0.01,
			100,
		);
		this.sphericalDisplayCamera.up.set(0, 1, 0);
		this.sphericalDisplayCamera.position.set(0, 0, 3);
		this.sphericalDisplayCamera.lookAt(0, 0, 0);
		this.sphericalDisplayControls = new OrbitControls(
			this.sphericalDisplayCamera,
			this.domElement,
		);
		this.sphericalDisplayControls.target.set(0, 0, 0);
		this.sphericalDisplayControls.enablePan = false;
		this.sphericalDisplayControls.enableDamping = true;
		this.sphericalDisplayControls.dampingFactor = 0.1;
		this.sphericalDisplayControls.rotateSpeed = 0.8;
		this.sphericalDisplayControls.zoomSpeed = 1.2;
		this.sphericalDisplayControls.minDistance = 1.5;
		this.sphericalDisplayControls.maxDistance = 10;
		this.sphericalDisplayControls.update();

		// Projection scene (spherical projection)
		this.projectionScene = new ProjectionScene();

		// Resize handler
		window.addEventListener("resize", () => this.resize());
		this.resize();

		window.addEventListener("keydown", (e) => {
			if (e.key === "1") this.setViewMode("azimuthal");
			if (e.key === "2") this.setViewMode("scene");
			if (e.key === "3") this.setViewMode("sphere");
		});
		this.domElement.addEventListener(
			"pointerdown",
			(event) => this.handleSphericalDisplayPointerDown(event),
			true,
		);
		this.domElement.addEventListener(
			"pointermove",
			(event) => this.handleSphericalDisplayPointerMove(event),
			true,
		);
		this.domElement.addEventListener(
			"pointerup",
			(event) => this.handleSphericalDisplayPointerEnd(event),
			true,
		);
		this.domElement.addEventListener(
			"pointercancel",
			(event) => this.handleSphericalDisplayPointerEnd(event),
			true,
		);

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

	private configureOrbitControls(controls: TrackballControls) {
		controls.rotateSpeed = 3.0;
		controls.zoomSpeed = 1.2;
		controls.panSpeed = 0.8;
		controls.noPan = true;
		controls.staticMoving = false;
		controls.dynamicDampingFactor = 0.2;
		controls.target.set(0, 0, 0);
	}

	private setViewMode(viewMode: ViewMode) {
		this.cancelActiveSphereTouch();
		this.viewMode = viewMode;
		this.debugControls.enabled = viewMode === "scene";
		this.sphericalDisplayControls.enabled = viewMode === "sphere";
	}

	private getSphericalDisplayTouchPosition(event: PointerEvent) {
		const bounds = this.domElement.getBoundingClientRect();
		const pointer = new THREE.Vector2(
			((event.clientX - bounds.left) / bounds.width) * 2 - 1,
			-((event.clientY - bounds.top) / bounds.height) * 2 + 1,
		);
		this.sphericalDisplayRaycaster.setFromCamera(
			pointer,
			this.sphericalDisplayCamera,
		);
		const [intersection] = this.sphericalDisplayRaycaster.intersectObject(
			this.projectionScene.sphericalDisplayMesh,
		);
		if (!intersection) return undefined;

		const sphereDirection = intersection.point.clone().normalize();
		const direction = new THREE.Vector3(
			sphereDirection.x,
			sphereDirection.z,
			sphereDirection.y,
		);
		const scaledPitch = Math.acos(THREE.MathUtils.clamp(direction.z, -1, 1));
		const pitch = scaledPitch / (GLOBE_FOV_DEGREES / 360);
		const yaw = Math.atan2(-direction.y, direction.x);
		return { pitch, yaw };
	}

	private handleSphericalDisplayPointerDown(event: PointerEvent) {
		if (this.viewMode !== "sphere") return;
		if (this.activeSphereTouch) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}

		const position = this.getSphericalDisplayTouchPosition(event);
		if (!position) return;

		event.preventDefault();
		event.stopImmediatePropagation();
		this.domElement.setPointerCapture(event.pointerId);

		const touchId = this.nextSimulatedTouchId--;
		this.activeSphereTouch = { pointerId: event.pointerId, touchId };
		const touchHandler = globalServices.touchHandler;
		touchHandler.addTouch(touchId);
		touchHandler.updateTouch(touchId, position.pitch, position.yaw);
	}

	private handleSphericalDisplayPointerMove(event: PointerEvent) {
		const touch = this.activeSphereTouch;
		if (!touch || touch.pointerId !== event.pointerId) return;

		event.preventDefault();
		event.stopImmediatePropagation();
		const position = this.getSphericalDisplayTouchPosition(event);
		if (position) {
			globalServices.touchHandler.updateTouch(
				touch.touchId,
				position.pitch,
				position.yaw,
			);
		}
	}

	private handleSphericalDisplayPointerEnd(event: PointerEvent) {
		const touch = this.activeSphereTouch;
		if (!touch || touch.pointerId !== event.pointerId) return;

		event.preventDefault();
		event.stopImmediatePropagation();
		this.cancelActiveSphereTouch();
	}

	private cancelActiveSphereTouch() {
		const touch = this.activeSphereTouch;
		if (!touch) return;

		this.activeSphereTouch = undefined;
		globalServices.touchHandler.removeTouch(touch.touchId);
		if (this.domElement.hasPointerCapture(touch.pointerId)) {
			this.domElement.releasePointerCapture(touch.pointerId);
		}
	}

	setScene(scene: BaseScene) {
		this.projectionScene.setTransition(false);
		this.currentScene = scene;
		this.currentScene.applyRendererSettings(this);
	}

	redraw(delta: number) {
		if (!this.currentScene) return;

		globalServices.touchHandler.update();
		this.currentScene.update(delta);
		this.debugControls.update();
		this.sphericalDisplayControls.update();

		if (this.viewMode === "scene") {
			this.render(this.currentScene, this.debugCamera);
		} else {
			this.currentScene.renderScene(this);
			if (this.viewMode === "sphere") {
				this.setRenderTarget(null);
				this.render(
					this.projectionScene.sphericalDisplayScene,
					this.sphericalDisplayCamera,
				);
			}
		}

		this.currentScene.postRender(this);
	}

	// Render directly from the debug camera
	renderDebug() {
		this.render(this.currentScene, this.debugCamera);
	}

	updateFixed(delta: number) {
		if (!this.currentScene) return;

		this.currentScene.updateFixed(delta);
	}

	resize() {
		const size = Math.min(window.innerWidth, window.innerHeight);
		this.setSize(size, size);

		this.centerCamera.aspect = 1 / 1;
		this.centerCamera.updateProjectionMatrix();

		this.debugCamera.aspect = 1 / 1;
		this.debugCamera.updateProjectionMatrix();

		this.sphericalDisplayCamera.aspect = 1 / 1;
		this.sphericalDisplayCamera.updateProjectionMatrix();

		this.debugControls.handleResize();
	}
}
