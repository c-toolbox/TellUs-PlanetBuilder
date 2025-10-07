import * as THREE from "three";
import { ProjectionScene } from "./scenes/ProjectionScene";
import { WorldScene } from "./scenes/WorldScene";
import { Polyhedra } from "./geometry/Polyhedra";

// https://en.wikipedia.org/wiki/List_of_geodesic_polyhedra_and_Goldberg_polyhedra

// import model from "@/geometry/models/geodesic20.json"
// import model from "@/geometry/models/geodesic60.json"
// import model from "@/geometry/models/geodesic80.json"
// import model from "@/geometry/models/geodesic140.json"
// import model from "@/geometry/models/geodesic180.json"
// import model from "@/geometry/models/geodesic240.json"
// import model from "@/geometry/models/geodesic320.json"
// import model from "@/geometry/models/geodesic420.json"
// import model from "@/geometry/models/geodesic500.json"
// import model from "@/geometry/models/geodesic540.json"

// import model from "@/geometry/models/goldberg12.json"
// import model from "@/geometry/models/goldberg32.json"
// import model from "@/geometry/models/goldberg42.json"
// import model from "@/geometry/models/goldberg72.json"
// import model from "@/geometry/models/goldberg92.json"
// import model from "@/geometry/models/goldberg122.json"
// import model from "@/geometry/models/goldberg162.json"
// import model from "@/geometry/models/goldberg212.json"
import model from "@/geometry/models/goldberg252.json";
// import model from "@/geometry/models/goldberg272.json"
// import model from "@/geometry/models/goldberg282.json"
// import model from "@/geometry/models/goldberg363.json"
// import model from "@/geometry/models/goldberg482.json"
// import model from "@/geometry/models/goldberg492.json";
// import model from "@/geometry/models/goldberg1002.json"
// import model from "@/geometry/models/goldberg1962.json"
// import model from "@/geometry/models/goldberg2522.json"
// import model from "@/geometry/models/goldberg4412.json"
// import model from "@/geometry/models/goldberg5672.json"
// import model from "@/geometry/models/goldberg7842.json"
// import model from "@/geometry/models/goldberg10292.json"

// import model from "@/geometry/models/octahedral56.json"
// import model from "@/geometry/models/tetrahedral28.json"
// import model from "@/geometry/models/half_sphere_hexagon.json";

import { SHOW_EDGES, SHOW_FACES, SHOW_VERTICES } from "./constants";

/* Setup */

const placeholder = document.getElementById("placeholder");
if (!placeholder) throw new Error("Placeholder div not found");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
const size = Math.min(
	placeholder.clientWidth || window.innerWidth,
	placeholder.clientHeight || window.innerHeight
);
renderer.setSize(size, size);
// renderer.outputColorSpace = THREE.SRGBColorSpace;
// renderer.toneMapping = THREE.NoToneMapping;
placeholder.appendChild(renderer.domElement);

//
// World scene + environment
//
const worldScene = new WorldScene();
const projectionScene = new ProjectionScene();

const globe = new Polyhedra(model);
if (SHOW_VERTICES) worldScene.add(globe.vertexGroup);
if (SHOW_EDGES) worldScene.add(globe.edgeGroup);
if (SHOW_FACES) worldScene.add(globe.faceGroup);

worldScene.makeClickable(globe.faceGroup);

//
// Drag to rotate camera orientation (keeps camera at origin)
//
let isDragging = false,
	lastX = 0,
	lastY = 0,
	yaw = Math.PI / 2,
	pitch = -Math.PI / 2,
	zoom = 1.9;
const ROT_SPEED = 0.005;

renderer.domElement.addEventListener("pointerdown", (e: PointerEvent) => {
	isDragging = true;
	lastX = e.clientX;
	lastY = e.clientY;
	renderer.domElement.setPointerCapture?.((e as any).pointerId);
});
renderer.domElement.addEventListener("pointerup", (e: PointerEvent) => {
	isDragging = false;
	renderer.domElement.releasePointerCapture?.((e as any).pointerId);
});
renderer.domElement.addEventListener("pointermove", (e: PointerEvent) => {
	if (!isDragging) return;
	const dx = e.clientX - lastX,
		dy = e.clientY - lastY;
	lastX = e.clientX;
	lastY = e.clientY;
	yaw += dx * ROT_SPEED;
	pitch += dy * ROT_SPEED;
	const maxPitch = Math.PI / 2 - 0.001;
	pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
});
renderer.domElement.addEventListener("wheel", (e: WheelEvent) => {
	zoom = Math.max(zoom + e.deltaY / 2000, 0.001);
});

window.addEventListener("resize", () => {
	const w = placeholder.clientWidth || window.innerWidth;
	const h = placeholder.clientHeight || window.innerHeight;
	renderer.setSize(w, h);
	worldScene.camera.aspect = w / h;
	worldScene.camera.updateProjectionMatrix();
});

// Toggle debug
let debugMode = false;
window.addEventListener("keydown", (e) => {
	if (e.key === " ") {
		debugMode = !debugMode;
		console.log("Debug mode:", debugMode);
	}
});

//
// Animation loop: update camera orientation from yaw/pitch and render
//
const qYaw = new THREE.Quaternion(),
	qPitch = new THREE.Quaternion(),
	qTmp = new THREE.Quaternion();

const FIXED_TIME_STEP = 1000 / 60; // 60 fps logic = ~16.67ms
let last = performance.now();
let accumulator = 0;

function animate(now: number) {
	requestAnimationFrame(animate);

	let delta = now - last;
	if (delta > 1000) delta = FIXED_TIME_STEP; // handle tab switch / pause
	last = now;
	accumulator += delta;

	// Run updates in fixed steps
	while (accumulator >= FIXED_TIME_STEP) {
		update(FIXED_TIME_STEP / 1000); // pass seconds
		accumulator -= FIXED_TIME_STEP;
	}

	// Render once per frame
	render();
}
requestAnimationFrame(animate);

function update(dt: number) {
	// advance simulation with constant timestep
	// e.g. camera motion, physics, animations

	// yaw += 0.0005;
}

function render() {

	qYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
	qPitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
	qTmp.copy(qYaw).multiply(qPitch);
	worldScene.camera.quaternion.copy(qTmp);

	worldScene.debugCamera.position.x = zoom * Math.cos(yaw) * Math.cos(pitch);
	worldScene.debugCamera.position.y = zoom * Math.sin(pitch);
	worldScene.debugCamera.position.z = zoom * Math.sin(yaw) * Math.cos(pitch);
	worldScene.debugCamera.lookAt(new THREE.Vector3(0, 0, 0));

	worldScene.update();

	if (debugMode) {
		renderer.render(worldScene, worldScene.debugCamera);
	} else {
		projectionScene.cubeCamera.position.set(0, 0, 0);
		projectionScene.cubeCamera.quaternion.copy(worldScene.camera.quaternion);
		projectionScene.cubeCamera.update(renderer, worldScene);

		renderer.render(projectionScene, projectionScene.screenCamera);
	}
}
