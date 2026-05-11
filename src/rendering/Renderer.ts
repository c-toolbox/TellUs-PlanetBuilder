import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import { ProjectionScene } from "@/rendering/ProjectionScene";
import BaseScene from "../scenes/BaseScene";

export class Renderer extends THREE.WebGLRenderer {
	public currentScene: BaseScene;
	public projectionScene: ProjectionScene;

	private controls: TrackballControls;
	public centerCamera: THREE.PerspectiveCamera;
	public debugCamera: THREE.PerspectiveCamera;

	private debugMode: boolean;

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

		// Trackball controls for debug camera
		this.controls = new TrackballControls(this.debugCamera, this.domElement);
		this.controls.rotateSpeed = 3.0;
		this.controls.zoomSpeed = 1.2;
		this.controls.panSpeed = 0.8;
		this.controls.noPan = true; // optional
		this.controls.staticMoving = false;
		this.controls.dynamicDampingFactor = 0.2;
		this.controls.target.set(0, 0, 0); // orbit around the origin

		// Projection scene (spherical projection)
		this.projectionScene = new ProjectionScene();

		// Resize handler
		window.addEventListener("resize", () => this.resize());
		this.resize();

		// Debug toggle
		this.debugMode = false;
		window.addEventListener("keydown", (e) => {
			if (e.key === " ") {
				this.debugMode = !this.debugMode;
			}
		});

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

	setScene(scene: BaseScene) {
		this.currentScene = scene;
		this.currentScene.setRendererSettings(this);
	}

	redraw(delta: number) {
		if (!this.currentScene) return;

		this.currentScene.update(delta);
		this.controls.update();
		// this.centerCamera.quaternion.copy(this.debugCamera.quaternion);

		if (this.debugMode) {
			this.render(this.currentScene, this.debugCamera);
		} else {
			this.currentScene.renderScene(this);
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

		this.controls.handleResize();
	}
}
