import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import {
	CSS3DRenderer,
} from "three/examples/jsm/renderers/CSS3DRenderer";
import { GlobeTouchHandler } from "./network/GlobeTouchHandler";
import { ORIGIN } from "./constants";
import { Element } from "./components/Element";

// Declare global variables with explicit types
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let cssRenderer: CSS3DRenderer;
let webglRenderer: THREE.WebGLRenderer;
let controls: TrackballControls;
let group: THREE.Group;

init();
animate();

function init(): void {
	const container = document.getElementById("container");
	if (!container) {
		throw new Error("Container element #placeholder not found");
	}

	// --- Camera setup ---
	camera = new THREE.PerspectiveCamera(
		50,
		window.innerWidth / window.innerHeight,
		1,
		5000
	);
	camera.position.set(500, 500, 500);

	// --- Scene setup ---
	scene = new THREE.Scene();

	// --- WebGL Renderer (for 3D objects) ---
	webglRenderer = new THREE.WebGLRenderer({ alpha: true });
	webglRenderer.setSize(window.innerWidth, window.innerHeight);
	Object.assign(webglRenderer.domElement.style, {
		position: "absolute",
		left: "0",
		top: "0",
	});
	container.appendChild(webglRenderer.domElement);

	// --- CSS3D Renderer (for HTML elements) ---
	cssRenderer = new CSS3DRenderer();
	cssRenderer.setSize(window.innerWidth, window.innerHeight);
	Object.assign(cssRenderer.domElement.style, {
		position: "absolute",
		left: "0",
		top: "0",
	});
	container.appendChild(cssRenderer.domElement);

	// --- Example 3D cube (visible in WebGL layer) ---
	const geometry = new THREE.BoxGeometry(100, 100, 100);
	const material = new THREE.MeshBasicMaterial({
		color: 0xff0000,
		side: THREE.DoubleSide,
	});
	const cube = new THREE.Mesh(geometry, material);
	scene.add(cube);

	// --- Add CSS3D elements ---
	group = new THREE.Group();
	group.add(new Element("SJOz3qjfQXU", 0, 0, 300, 0));
	group.add(new Element("Y2-xZ-1HE-Q", 300, 0, 0, Math.PI / 2));
	group.add(new Element("IrydklNpcFI", 0, 0, -300, Math.PI));
	group.add(new Element("9ubytEsCaS0", -300, 0, 0, -Math.PI / 2));
	scene.add(group);

	// --- Controls ---
	controls = new TrackballControls(camera, cssRenderer.domElement);
	controls.rotateSpeed = 4;

	window.addEventListener("resize", onWindowResize);

	// --- Touch interaction handler ---
	const touchHandler = new GlobeTouchHandler();
	scene.add(touchHandler.touchGroup);

	touchHandler.on("touch", (touchId: number, vector: THREE.Vector3) => {
		simulateClickFromDirection(vector);
	});
}

function onWindowResize(): void {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	cssRenderer.setSize(window.innerWidth, window.innerHeight);
	webglRenderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(): void {
	requestAnimationFrame(animate);
	controls.update();
	cssRenderer.render(scene, camera);
	webglRenderer.render(scene, camera);
}

function simulateClickFromDirection(direction: THREE.Vector3): void {
	const dir = direction.clone().normalize();

	const raycaster = new THREE.Raycaster(ORIGIN, dir);
	const intersects = raycaster.intersectObjects(group.children, true);

	if (intersects.length > 0) {
		const point = intersects[0].point.clone();
		const projected = point.clone().project(camera);

		const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
		const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;

		const element = document.elementFromPoint(x, y);
		if (element) {
			element.dispatchEvent(
				new PointerEvent("touchdown", {
					// pointerId: 0,
					bubbles: true,
					cancelable: true,
					clientX: x,
					clientY: y,
				})
			);
		}
	} else {
		console.log("No results");
	}
}
