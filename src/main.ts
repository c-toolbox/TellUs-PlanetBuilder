import * as THREE from "three";

// To import GLSL shader files directly, you need to configure your build tool (like Vite, Webpack, etc.) to handle them as raw text.
// For example, with Vite, you can use the ?raw suffix:
import vertexShader from "./azeqproj_vs.glsl?raw";
import fragmentShader from "./azeqproj_fs.glsl?raw";
// const vertexShader = getSourceSync("/src/azeqproj_vs.glsl");
// const fragmentShader = getSourceSync("/src/azeqproj_fs.glsl");

import texture from "./assets/soccer.jpg";

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, -1, 1, -1, 1);
const renderer = new THREE.WebGLRenderer();

interface Uniforms {
	[uniform: string]: THREE.IUniform<any>;
	texture1: THREE.IUniform<THREE.Texture>;
	phi1: THREE.IUniform<number>;
	lambda0: THREE.IUniform<number>;
}

let uniforms: Uniforms;
let mouseDown = false;
let lastMouseX: number | null = null;
let lastMouseY: number | null = null;
let curLatitude = 0.0;
let curLongitude = 0.0;

function handleMouseDown(event: PointerEvent): void {
	if (event.button !== 0) return; // left button only
	mouseDown = true;
	lastMouseX = event.clientX;
	lastMouseY = event.clientY;
	renderer.domElement.setPointerCapture(event.pointerId);
}

function handleMouseUp(event: PointerEvent): void {
	mouseDown = false;
}

function handleMouseMove(event: PointerEvent): void {
	if (!mouseDown || lastMouseX === null || lastMouseY === null) {
		return;
	}
	const newX = event.clientX;
	const newY = event.clientY;

	const deltaX = newX - lastMouseX;
	const deltaY = newY - lastMouseY;

	curLatitude += deltaY / 100.0;
	curLongitude -= deltaX / 100.0;

	lastMouseX = newX;
	lastMouseY = newY;
}

function initCanvas(): void {
	const div = document.getElementById("placeholder");
	if (!div) throw new Error("No placeholder div found");

	const wh = Math.min(div.clientWidth, div.clientWidth);
	renderer.setSize(wh, wh);
	div.appendChild(renderer.domElement);

	const el = renderer.domElement;
	el.addEventListener("pointerdown", handleMouseDown);
	el.addEventListener("pointerup", handleMouseUp);
	el.addEventListener("pointercancel", handleMouseUp);
	el.addEventListener("pointermove", handleMouseMove);
	el.addEventListener("touchstart", (e) => e.preventDefault());

	// Update path to match your project structure
	const worldTexture = new THREE.TextureLoader().load(texture);
	worldTexture.minFilter = THREE.NearestFilter;
	worldTexture.wrapS = THREE.RepeatWrapping;
	worldTexture.wrapT = THREE.RepeatWrapping;

	uniforms = {
		texture1: { value: worldTexture },
		phi1: { value: 0.0 },
		lambda0: { value: 0.0 },
	};

	if (!vertexShader || !fragmentShader) {
		console.error("Failed to load shaders");
		return;
	}

	const mapMaterial = new THREE.ShaderMaterial({
		side: THREE.DoubleSide,
		uniforms,
		vertexShader,
		fragmentShader,
	});

	const mapGeometry = new THREE.PlaneGeometry(2, 2, 1, 1);
	const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
	mapGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

	const map = new THREE.Mesh(mapGeometry, mapMaterial);
	scene.add(map);

	const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
	const crossGeometry = new THREE.BufferGeometry();
	const crossDelta = 0.02;
	const vertices = new Float32Array([
		-crossDelta,
		0,
		0.1,
		crossDelta,
		0,
		0.1,
		0,
		-crossDelta,
		0.1,
		0,
		crossDelta,
		0.1,
	]);
	crossGeometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(vertices, 3)
	);
	const cross = new THREE.LineSegments(crossGeometry, lineMaterial);
	scene.add(cross);

	// Equatorial Circumference of the earth = 40,075.017 km
	const COE = 40075.017;
	const circleStep = 5000;
	for (let km = circleStep; km < COE; km += circleStep) {
		const i = km / COE;
		const tempGeometry = new THREE.CircleGeometry(i, 100);
		const positions = tempGeometry.attributes.position.array;

		// Create new array without center vertex (skip first 3 values)
		const circlePositions = new Float32Array(positions.length - 3);
		circlePositions.set(positions.slice(3), 0);

		const circleGeometry = new THREE.BufferGeometry();
		circleGeometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(circlePositions, 3)
		);

		const circle = new THREE.LineLoop(circleGeometry, lineMaterial);
		circle.position.z = 0.1;
		scene.add(circle);

		// Clean up temporary geometry
		tempGeometry.dispose();
	}

	// After the circle creation loop, add spheres at axis positions
	const sphereRadius = 0.05;
	const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
	const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

	// Create spheres at each axis position (using the last circle radius as distance)
	const axisPositions = [
		[1, 0, 0], // +X
		[-1, 0, 0], // -X
		[0, 1, 0], // +Y
		[0, -1, 0], // -Y
		[0, 0, 1], // +Z
		[0, 0, -1], // -Z
	];

	const lastRadius = (Math.floor(COE / circleStep) * circleStep) / COE;

	axisPositions.forEach(([x, y, z]) => {
		const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
		sphere.position.set(
			x * lastRadius,
			y * lastRadius,
			z * lastRadius + 0.1 // Add 0.1 to match other elements' z-offset
		);
		scene.add(sphere);
	});
}

function render(): void {
	requestAnimationFrame(render);
	if (uniforms) {
		uniforms.phi1.value = curLatitude;
		uniforms.lambda0.value = curLongitude;
	}
	renderer.render(scene, camera);
}

initCanvas();
render();
