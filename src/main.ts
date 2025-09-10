import * as THREE from "three";
import worldTexUrl from "./assets/world_standard.jpg";
import { addEdges, addVertices } from "./geometry/wiremesh";
import { TruncatedIcosahedron } from "@/geometry/shapes/TruncatedIcosahedron";

const placeholder = document.getElementById("placeholder");
if (!placeholder) throw new Error("Placeholder div not found");

//
// Renderer
//
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(
	placeholder.clientWidth || window.innerWidth,
	placeholder.clientHeight || window.innerHeight
);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
placeholder.appendChild(renderer.domElement);

//
// World scene + environment
//
const worldScene = new THREE.Scene();
const loader = new THREE.TextureLoader();
loader.load(worldTexUrl, (tex) => {
	tex.mapping = THREE.EquirectangularReflectionMapping;
	tex.colorSpace = THREE.SRGBColorSpace;
	worldScene.background = tex;
});

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
	  // vec2 p = vUv * 2.0 - 1.0;
      // float r = length(p);
      // if (r > 1.0) { gl_FragColor = vec4(0.0); return; }
	  // float phi = sqrt(r) * 2.7;
      // float theta = atan(p.x, p.y);
      // vec3 dir = vec3(sin(phi) * sin(theta), -sin(phi) * cos(theta), cos(phi));
      // gl_FragColor = textureCube(envMap, dir);

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

const mySolid = new TruncatedIcosahedron();
worldScene.add(mySolid.pentGroup);
worldScene.add(mySolid.hexGroup);

const clickableObjects: THREE.Object3D[] = [];
mySolid.pentGroup.children.forEach((c) => clickableObjects.push(c));
mySolid.hexGroup.children.forEach((c) => clickableObjects.push(c));

addVertices(worldScene, mySolid.vertices);
addEdges(worldScene, mySolid.vertices, mySolid.edges);

//
// Lighting (so filled faces look nice)
//
const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.9);
worldScene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(5, 10, 7);
worldScene.add(dir);

//
// Interaction system
//
const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3(0, 0, 0);

// helper to convert incoming pitch/yaw to a direction vector
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

function getNextColor(index: number = 0) {
	const colors = [0xff0000, 0xffff00, 0x00ff00, 0x0000ff];
	return colors[index];
}

// raycast and handle hits
function handleRayFromPitchYaw(pitch: number, yaw: number) {
	const direction = dirFromPitchYaw(pitch, yaw);
	raycaster.set(origin, direction);
	// check transparent faces first (both groups)

	const intersects = raycaster.intersectObjects(clickableObjects, true);
	const objects = new Set<THREE.Mesh>(
		intersects.map((i) => i.object as THREE.Mesh)
	);
	console.log("Touching", objects);
	intersects.forEach((hit) => {
		console.log(hit);
		const obj = hit.object as THREE.Mesh;

		// pick a random color
		obj.userData.tileIndex = (obj.userData.tileIndex + 1) % 4;
		// const col = getNextColor(obj.userData.tileIndex);
		const col = Math.floor(Math.random() * 0xffffff);
		// console.log("click", obj.userData.tileIndex, col);

		const mat = obj.material as THREE.Material & { color?: THREE.Color };
		(mat as any).color.setHex(col);

		// return hit info for debugging
		return {
			object: obj,
			point: hit.point,
			faceType: (obj.userData as any).faceType,
		};
	});
	return null;
}

// --- Touch visualization ---
const maxTouches = 32;
const touchSpheres = new Map<number, THREE.Mesh>();
const touchSphereGeo = new THREE.SphereGeometry(0.1, 12, 10);
const touchSphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

function updateTouchSphere(id: number, pitch: number, yaw: number) {
	let sphere = touchSpheres.get(id);
	if (!sphere) {
		if (touchSpheres.size >= maxTouches) return; // ignore extra touches
		sphere = new THREE.Mesh(touchSphereGeo, touchSphereMat.clone());
		touchSpheres.set(id, sphere);
		worldScene.add(sphere);
	}
	// Convert pitch/yaw to direction
	const dir = dirFromPitchYaw(pitch, yaw);
	const desiredRadius = 5;
	sphere.position.copy(dir).multiplyScalar(desiredRadius / 2); // place on polyhedron radius
}

function removeTouchSphere(id: number) {
	const sphere = touchSpheres.get(id);
	if (sphere) {
		worldScene.remove(sphere);
		touchSpheres.delete(id);
	}
}

//
// TuIO WebSocket: listens for {"event":"update","x":..., "y":...}
// x -> pitch, y -> yaw (radians). If your TuIO sends degrees or normalized, convert here.
//

let usedIds: number[] = [];
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
					// updateTouchSphere(touchId, 0, 0); // temporary at origin, will be updated on first "update"
					break;
				case "update":
					if (typeof data.x === "number" && typeof data.y === "number") {
						// console.log(data.id, data.x.toFixed(3), data.y.toFixed(3));
						const pitch = (data.y - 0.5) * Math.PI;
						const yaw = (1.5 - data.x) * 2 * Math.PI;
						updateTouchSphere(touchId, pitch, yaw);
						//if (!usedIds.includes(data.id)) {
						handleRayFromPitchYaw(pitch, yaw);
						//usedIds.push(data.id);
						//	}
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
// Also allow clicking with mouse for local debug: convert screen coords to pitch/yaw
//
function screenToPitchYaw(clientX: number, clientY: number) {
	// Map pointer position on the displayed AEP quad into a pitch/yaw ray.
	// We convert the screen point into normalized device coordinates, map onto the AEP unit circle,
	// then invert the Azimuthal Equidistant projection to recover spherical angles:
	const rect = renderer.domElement.getBoundingClientRect();
	const u = (clientX - rect.left) / rect.width;
	const v = (clientY - rect.top) / rect.height;
	const p = new THREE.Vector2(u * 2 - 1, v * 2 - 1);
	// if outside unit circle, return null
	if (p.length() > 1) return null;
	const r = p.length();
	const c = r * Math.PI; // inverse mapping used in shader (same constant)
	const theta = Math.atan2(p.y, p.x);
	// spherical direction: (sin(c)*cos(theta), sin(c)*sin(theta), cos(c))
	const dir = new THREE.Vector3(
		Math.sin(c) * Math.cos(theta),
		Math.sin(c) * Math.sin(theta),
		Math.cos(c)
	);
	// we need pitch & yaw corresponding to that direction according to our convention (camera forward = +Z)
	// derive yaw = atan2(x, z)? Our yaw rotates around Y, and pitch around X.
	const yaw = Math.atan2(dir.x, dir.z); // rotation about Y that aligns forward to projected x/z
	const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)); // rotation about X
	return { pitch, yaw };
}

renderer.domElement.addEventListener("pointerdown", (e: PointerEvent) => {
	// detect click to change color locally (useful for debugging)
	const res = screenToPitchYaw(e.clientX, e.clientY);
	if (!res) return;
	const result = handleRayFromPitchYaw(res.pitch, res.yaw);
	if (result) console.log("mouse hit", (result as any).faceType);
});

//
// Drag to rotate camera orientation (keeps camera at origin)
//
let isDragging = false,
	lastX = 0,
	lastY = 0,
	yaw = Math.PI / 2,
	pitch = -Math.PI / 2;
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
	yaw -= dx * ROT_SPEED;
	pitch -= dy * ROT_SPEED;
	const maxPitch = Math.PI / 2 - 0.001;
	pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
});

window.addEventListener("resize", () => {
	const w = placeholder.clientWidth || window.innerWidth;
	const h = placeholder.clientHeight || window.innerHeight;
	renderer.setSize(w, h);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
});

/* Debug toggle */

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

	qYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
	qPitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
	qTmp.copy(qYaw).multiply(qPitch);
	camera.quaternion.copy(qTmp);

	if (debugMode) {
		// Just render the 3D world normally
		renderer.render(worldScene, camera);
	} else {
		// Original pipeline: cube render → quad shader
		cubeCam.position.set(0, 0, 0);
		cubeCam.quaternion.copy(camera.quaternion);
		cubeCam.update(renderer, worldScene);

		renderer.render(screenScene, screenCam);
	}
}
animate();
