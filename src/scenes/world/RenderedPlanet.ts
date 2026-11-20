import * as THREE from "three";
import { TileMask } from "./TileMask";
import type { TileMesh } from "./TileMesh";

import sphereVertex from "./shaders/sphere.vert?raw";
import lighting from "./shaders/lighting.glsl?raw";
import planetFragment from "./shaders/planet.frag?raw";
import bakedPlanetFragment from "./shaders/bakedPlanet.frag?raw";
import cloudsFragment from "./shaders/clouds.frag?raw";

import forestUrl from "./textures/realistic/forest.png";
import forestDarkUrl from "./textures/realistic/forest_dark.png";
import iceUrl from "./textures/realistic/ice.png";
import desertUrl from "./textures/realistic/desert.png";
import cloudsUrl from "@/assets/textures/globe/clouds.jpg";

// Inside the vertex markers (1.0), edges (1.1) and tile faces (1.2) so depth hides them; touches are at 0.8.
const PLANET_RADIUS = 0.9;
const CLOUD_RADIUS = 0.88;

// Cube face resolution of the baked planet.
const BAKE_SIZE = 2048;
// Wait for tile changes to stop before paying for another bake.
const BAKE_SETTLE_MS = 250;

// Radians per second.
const CLOUD_DRIFT = 0.01;

// Towards the sun, with the poles on the Y axis.
const SUN_DIRECTION = new THREE.Vector3(0.7, 0.66, 0.18).normalize();

/**
 * The tile layout shaded like RenderPlanet.blend. The expensive shader runs once into a cube map,
 * which is then shown on a cheap sphere under a separate, moving cloud layer.
 */
export class RenderedPlanet extends THREE.Group {
	private readonly mask = new TileMask();
	private readonly bakeTarget: THREE.WebGLCubeRenderTarget;
	private readonly bakeCamera: THREE.CubeCamera;
	private readonly bakeScene = new THREE.Scene();
	private readonly bakeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
	private readonly planet: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
	private readonly clouds: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
	private readonly textures: THREE.Texture[] = [];
	private pendingTextures = 0;
	private cloudRotation = 0;
	private settleTime: number | null = null;
	private nextBakeFace: number | null = null;

	constructor() {
		super();

		const sunDirection = { value: SUN_DIRECTION };

		this.bakeTarget = new THREE.WebGLCubeRenderTarget(BAKE_SIZE, {
			generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter,
			depthBuffer: false,
		});
		this.bakeTarget.texture.colorSpace = THREE.SRGBColorSpace;
		this.bakeCamera = new THREE.CubeCamera(0.1, 10, this.bakeTarget);

		this.bakeMesh = new THREE.Mesh(
			new THREE.SphereGeometry(1.3, 64, 48),
			new THREE.ShaderMaterial({
				name: "Planet bake",
				uniforms: {
					sunDirection,
					maskA: { value: this.mask.textures[0] },
					maskB: { value: this.mask.textures[1] },
					forestMap: { value: this.loadTexture(forestUrl) },
					forestDarkMap: { value: this.loadTexture(forestDarkUrl) },
					iceMap: { value: this.loadTexture(iceUrl) },
					desertMap: { value: this.loadTexture(desertUrl) },
				},
				vertexShader: sphereVertex,
				fragmentShader: lighting + planetFragment,
				side: THREE.BackSide,
			}),
		);
		this.bakeScene.add(this.bakeMesh);

		this.planet = new THREE.Mesh(
			new THREE.SphereGeometry(PLANET_RADIUS, 64, 48),
			new THREE.ShaderMaterial({
				name: "Rendered planet",
				uniforms: { planetMap: { value: this.bakeTarget.texture } },
				vertexShader: sphereVertex,
				fragmentShader: bakedPlanetFragment,
				side: THREE.BackSide,
			}),
		);
		// Until the first bake finishes the cube map is empty
		this.planet.visible = false;

		const cloudTexture = this.loadTexture(cloudsUrl);
		cloudTexture.wrapT = THREE.ClampToEdgeWrapping;
		this.clouds = new THREE.Mesh(
			new THREE.SphereGeometry(CLOUD_RADIUS, 64, 48),
			new THREE.ShaderMaterial({
				name: "Planet clouds",
				uniforms: {
					sunDirection,
					cloudMap: { value: cloudTexture },
					cloudRotation: { value: 0 },
				},
				vertexShader: sphereVertex,
				fragmentShader: lighting + cloudsFragment,
				side: THREE.BackSide,
				transparent: true,
				depthWrite: false,
			}),
		);
		// Before other transparent objects such as touch markers.
		this.clouds.renderOrder = -1;

		this.add(this.planet, this.clouds);
	}

	setTiles(tileMeshes: TileMesh[]) {
		this.mask.setTiles(tileMeshes);
	}

	update(renderer: THREE.WebGLRenderer, delta: number) {
		if (this.mask.update(renderer)) {
			this.settleTime = this.planet.visible ? BAKE_SETTLE_MS : 0;
			this.nextBakeFace = null;
		}

		// The bake samples the textures, so wait until they have arrived.
		if (this.settleTime !== null && this.pendingTextures === 0) {
			this.settleTime -= delta;
			if (this.settleTime <= 0) {
				this.settleTime = null;
				this.nextBakeFace = 0;
			}
		}

		if (this.nextBakeFace !== null) this.bakeFace(renderer, this.nextBakeFace);

		this.cloudRotation += CLOUD_DRIFT * delta / 1000;
		this.clouds.material.uniforms.cloudRotation.value = this.cloudRotation;
	}

	dispose() {
		this.mask.dispose();
		this.bakeTarget.dispose();
		this.textures.forEach((texture) => texture.dispose());
		for (const mesh of [this.bakeMesh, this.planet, this.clouds]) {
			mesh.geometry.dispose();
			mesh.material.dispose();
		}
	}

	// One face per frame, so a single frame never has to shade the whole sphere.
	private bakeFace(renderer: THREE.WebGLRenderer, face: number) {
		if (face === 0) {
			this.bakeCamera.coordinateSystem = renderer.coordinateSystem;
			this.bakeCamera.updateCoordinateSystem();
		}

		// Mipmaps only need regenerating after the last face.
		const last = face === 5;
		this.bakeTarget.texture.generateMipmaps = last;
		const previousTarget = renderer.getRenderTarget();
		renderer.setRenderTarget(this.bakeTarget, face);
		renderer.render(this.bakeScene, this.bakeCamera.children[face] as THREE.Camera);
		renderer.setRenderTarget(previousTarget);

		if (last) {
			this.nextBakeFace = null;
			this.planet.visible = true;
		} else {
			this.nextBakeFace = face + 1;
		}
	}

	private loadTexture(url: string) {
		this.pendingTextures++;
		const texture = new THREE.TextureLoader().load(url, () => this.pendingTextures--);
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 8;
		this.textures.push(texture);
		return texture;
	}
}
