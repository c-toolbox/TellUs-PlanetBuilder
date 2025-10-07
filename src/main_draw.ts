// src/main.ts
import * as THREE from "three";
import { getNextColor } from "./utils/functions";
import { PEN_SIZE } from "./constants";

const placeholder = document.getElementById("placeholder");
if (!placeholder) throw new Error("Placeholder div not found");

//
// Renderer
//
const renderer = new THREE.WebGLRenderer({
	antialias: true,
	// preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(
	placeholder.clientWidth || window.innerWidth,
	placeholder.clientHeight || window.innerHeight
);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = false;
placeholder.appendChild(renderer.domElement);

//
// World scene + environment
//
const worldScene = new THREE.Scene();

//
// Camera at origin (we rotate its orientation)
//
const camera = new THREE.PerspectiveCamera(
	75,
	(placeholder.clientWidth || window.innerWidth) /
		(placeholder.clientHeight || window.innerHeight),
	0.01,
	1000
);
camera.position.set(0, 0, 0);
camera.lookAt(0, 0, 1);

//
// Cube render target + cube camera for sampling into the AEP shader
//
const cubeRT = new THREE.WebGLCubeRenderTarget(1024, {
	format: THREE.RGBAFormat,
	generateMipmaps: true,
	minFilter: THREE.LinearMipmapLinearFilter,
});
const cubeCam = new THREE.CubeCamera(0.01, 1000, cubeRT);
cubeCam.position.set(0, 0, 0);

//
// AEP full-screen quad (same shader idea as before)
//
const screenScene = new THREE.Scene();
const screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const aepMaterial = new THREE.ShaderMaterial({
	uniforms: { envMap: { value: cubeRT.texture } },
	vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }
  `,
	fragmentShader: `
    precision highp float;
    uniform samplerCube envMap;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) { gl_FragColor = vec4(0.0); return; }
      float c = r * 3.141592653589793;
      float theta = atan(p.y, p.x);
      float sc = sin(c), cc = cos(c);
      vec3 dir = vec3(sc * cos(theta), sc * sin(theta), cc);
      vec4 col = textureCube(envMap, dir);
      gl_FragColor = col;
    }
  `,
	depthTest: false,
	depthWrite: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aepMaterial);
screenScene.add(quad);

// Helper to convert incoming pitch/yaw to a direction vector
function dirFromPitchYaw(pitch: number, yaw: number): THREE.Vector3 {
	// assume yaw = rotation about Y (horizontal), pitch = rotation about X (vertical)
	// quaternion order matches camera's: q = yaw(Y) * pitch(X)
	const qYaw = new THREE.Quaternion().setFromAxisAngle(
		new THREE.Vector3(0, 1, 0),
		yaw
	);
	const qPitch = new THREE.Quaternion().setFromAxisAngle(
		new THREE.Vector3(1, 0, 0),
		pitch
	);
	const q = qYaw.multiply(qPitch);
	const forward = new THREE.Vector3(0, 0, 1);
	return forward.applyQuaternion(q).normalize();
}

// --- Touch visualization ---
const desiredRadius = 10;
interface TouchState {
	sphere: THREE.Mesh;
	lastPosition: THREE.Vector3 | null;
}
const touchStates = new Map<number, TouchState>();
const touchSphereGeo = new THREE.SphereGeometry(PEN_SIZE, 12, 10);
const touchSphereMat = new THREE.MeshBasicMaterial({
	color: 0xffffff,
	depthTest: false,
	depthWrite: false,
});
const lineGeo = new THREE.CylinderGeometry(PEN_SIZE, PEN_SIZE, 1, 8, 1);
lineGeo.rotateX(Math.PI / 2); // Make cylinder align with Z axis
const lineMeshes: THREE.Mesh[] = [];

function createLine(start: THREE.Vector3, end: THREE.Vector3): THREE.Mesh {
	const line = new THREE.Mesh(lineGeo, touchSphereMat.clone());
	const direction = end.clone().sub(start);
	const length = direction.length();

	// Position at midpoint
	line.position.copy(start).add(end).multiplyScalar(0.5);

	// Orient to point from start to end
	line.lookAt(end);
	line.scale.set(1, 1, length);

	return line;
}

let touchColors: { [id: number]: number } = {};

function updateTouchSphere(id: number, pitch: number, yaw: number) {
	if (!(id in touchColors)) {
		touchColors[id] = getNextColor();
	}
	touchSphereMat.color.setHex(touchColors[id]);

	let state = touchStates.get(id);
	if (!state) {
		const sphere = new THREE.Mesh(touchSphereGeo, touchSphereMat.clone());
		state = { sphere, lastPosition: null };
		touchStates.set(id, state);
		worldScene.add(sphere);
	}

	// Convert pitch/yaw to direction and get new position
	const dir = dirFromPitchYaw(pitch, yaw);
	const newPosition = dir.multiplyScalar(desiredRadius / 2);
	state.sphere.position.copy(newPosition);

	// If we have a previous position, create a line between them
	if (state.lastPosition) {
		const line = createLine(state.lastPosition, newPosition);
		worldScene.add(line);
		lineMeshes.push(line);
	}

	// Update last position
	state.lastPosition = newPosition.clone();
}
function removeTouchSphere(id: number) {
	const state = touchStates.get(id);
	if (state) {
		worldScene.remove(state.sphere);
		touchStates.delete(id);
	}
}

function clearLines() {
	// Clear all lines
	lineMeshes.forEach((line) => worldScene.remove(line));
	lineMeshes.length = 0;
}

//
// TuIO WebSocket: listens for {"event":"update","x":..., "y":...}
// x -> pitch, y -> yaw (radians). If your TuIO sends degrees or normalized, convert here.
//

let ws: WebSocket | null = null;
try {
	ws = new WebSocket("ws://localhost:8765");
	ws.onopen = () => console.log("TuIO WS connected");
	ws.onclose = () => console.log("TuIO WS closed");
	ws.onerror = (e) => console.warn("TuIO WS error", e);
	ws.onmessage = (ev) => {
		try {
			const data = JSON.parse(
				ev.data.replaceAll("Infinity", 0).replaceAll("NaN", 0)
			);
			if (!data || typeof data.id !== "number") return;

			const touchId = data.id;
			switch (data.event) {
				case "add":
					break;
				case "update":
					if (typeof data.x === "number" && typeof data.y === "number") {
						// console.log(data.id, data.x.toFixed(3), data.y.toFixed(3));
						const pitch = (data.y - 0.5) * Math.PI;
						const yaw = (1.5 - data.x) * 2 * Math.PI;
						updateTouchSphere(touchId, pitch, yaw);
					}
					break;
				case "remove":
					removeTouchSphere(touchId);
					break;
			}
		} catch (err) {
			console.warn("Failed to parse TuIO message", err);
		}
	};
} catch (err) {
	console.warn("Failed to create TuIO WebSocket", err);
}

//
let yaw = Math.PI / 2;
let pitch = -Math.PI / 2;

//
// Animation loop: update camera orientation from yaw/pitch and render
//
const qYaw = new THREE.Quaternion(),
	qPitch = new THREE.Quaternion(),
	qTmp = new THREE.Quaternion();
function animate() {
	requestAnimationFrame(animate);

	qYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
	qPitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
	qTmp.copy(qYaw).multiply(qPitch);
	camera.quaternion.copy(qTmp);

	// align cubeCam with camera orientation
	cubeCam.position.set(0, 0, 0);
	cubeCam.quaternion.copy(camera.quaternion);

	// renderer.clear();
	cubeCam.update(renderer, worldScene);
	renderer.render(screenScene, screenCam);

	clearLines();
}
animate();
