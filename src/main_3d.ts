import * as THREE from "three";
import { ProjectionScene } from "./scenes/ProjectionScene";
import { WorldScene } from "./scenes/WorldScene";
import { Polyhedra } from "./geometry/Polyhedra";

import model from "@/geometry/models/goldberg492.json";

/* Setup */

const placeholder = document.getElementById("placeholder");
if (!placeholder) throw new Error("Placeholder div not found");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(2.0);
renderer.setSize(
	placeholder.clientWidth || window.innerWidth,
	placeholder.clientHeight || window.innerHeight
);
// renderer.outputColorSpace = THREE.SRGBColorSpace;
// renderer.toneMapping = THREE.NoToneMapping;
placeholder.appendChild(renderer.domElement);

//
// World scene + environment
//
const worldScene = new WorldScene();
const projectionScene = new ProjectionScene();

const mySolid = new Polyhedra(model);
worldScene.add(mySolid.vertexGroup);
// worldScene.add(mySolid.edgeGroup);
worldScene.add(mySolid.faceGroup);
worldScene.add(mySolid.animalGroup);

const clickableObjects: THREE.Object3D[] = [];
mySolid.faceGroup.children.forEach((c) => clickableObjects.push(c));

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
function animate() {
	requestAnimationFrame(animate);

	yaw += 0.002;

	qYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
	qPitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
	qTmp.copy(qYaw).multiply(qPitch);
	worldScene.camera.quaternion.copy(qTmp);

	worldScene.debugCamera.position.x = zoom * Math.cos(yaw) * Math.cos(pitch);
	worldScene.debugCamera.position.y = zoom * Math.sin(pitch);
	worldScene.debugCamera.position.z = zoom * Math.sin(yaw) * Math.cos(pitch);
	worldScene.debugCamera.lookAt(new THREE.Vector3(0, 0, 0));

	if (debugMode) {
		// Just render the 3D world normally
		renderer.render(worldScene, worldScene.debugCamera);
	} else {
		// Original pipeline: cube render → quad shader
		projectionScene.cubeCamera.position.set(0, 0, 0);
		projectionScene.cubeCamera.quaternion.copy(worldScene.camera.quaternion);
		projectionScene.cubeCamera.update(renderer, worldScene);

		renderer.render(projectionScene, projectionScene.screenCamera);
	}
}
animate();
