import * as THREE from "three";
import { Tile } from "./TileManager";
import type { TileMesh } from "./TileMesh";
import maskVertex from "./shaders/tileMask.vert?raw";
import maskFragment from "./shaders/tileMask.frag?raw";

const MASK_SIZE = 1024;

// Every biome owns one channel of one of two RGBA cube maps.
const CHANNELS: Partial<Record<Tile, [set: 0 | 1, channel: number]>> = {
	Snow: [0, 0],
	Ocean: [0, 1],
	Taiga: [0, 2],
	Forest: [0, 3],
	Savanna: [1, 0],
	Desert: [1, 1],
	Mountain: [1, 2],
};

/** Bakes the tile layout into cube maps of per-biome coverage, seen from the centre of the globe. */
export class TileMask {
	readonly textures: [THREE.CubeTexture, THREE.CubeTexture];
	private readonly targets: [THREE.WebGLCubeRenderTarget, THREE.WebGLCubeRenderTarget];
	private readonly cameras: [THREE.CubeCamera, THREE.CubeCamera];
	private readonly scene = new THREE.Scene();
	private readonly material = new THREE.ShaderMaterial({
		uniforms: { weightSet: { value: 0 } },
		vertexShader: maskVertex,
		fragmentShader: maskFragment,
		side: THREE.DoubleSide,
		blending: THREE.NoBlending,
		depthTest: false,
		depthWrite: false,
	});
	private readonly clearColor = new THREE.Color();

	private tileMeshes: TileMesh[] = [];
	private mesh: THREE.Mesh | null = null;
	private firstVertex = new Uint32Array(0);
	private weights: [Uint8Array, Uint8Array] = [new Uint8Array(0), new Uint8Array(0)];
	private bakedTiles: (Tile | null)[] = [];
	private needsBake = false;

	constructor() {
		const createTarget = () => new THREE.WebGLCubeRenderTarget(MASK_SIZE, {
			type: THREE.UnsignedByteType,
			format: THREE.RGBAFormat,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			generateMipmaps: false,
			depthBuffer: false,
		});
		this.targets = [createTarget(), createTarget()];
		this.cameras = [
			new THREE.CubeCamera(0.1, 10, this.targets[0]),
			new THREE.CubeCamera(0.1, 10, this.targets[1]),
		];
		this.textures = [this.targets[0].texture, this.targets[1].texture];
	}

	setTiles(tileMeshes: TileMesh[]) {
		if (tileMeshes === this.tileMeshes) return;
		this.tileMeshes = tileMeshes;
		this.disposeMesh();

		let vertexCount = 0;
		let indexCount = 0;
		for (const tileMesh of tileMeshes) {
			vertexCount += tileMesh.geometry.getAttribute("position").count;
			indexCount += tileMesh.geometry.index!.count;
		}

		// Tile geometry is rebuilt in world space so neighbouring tiles share exact edges.
		const positions = new Float32Array(vertexCount * 3);
		const indices = new Uint32Array(indexCount);
		this.firstVertex = new Uint32Array(tileMeshes.length + 1);
		const vertex = new THREE.Vector3();
		let vertexOffset = 0;
		let indexOffset = 0;
		tileMeshes.forEach((tileMesh, tileIndex) => {
			tileMesh.updateMatrix();
			const position = tileMesh.geometry.getAttribute("position");
			const index = tileMesh.geometry.index!;
			this.firstVertex[tileIndex] = vertexOffset;
			for (let i = 0; i < position.count; i++) {
				vertex.fromBufferAttribute(position, i).applyMatrix4(tileMesh.matrix);
				vertex.toArray(positions, (vertexOffset + i) * 3);
			}
			for (let i = 0; i < index.count; i++) {
				indices[indexOffset++] = vertexOffset + index.getX(i);
			}
			vertexOffset += position.count;
		});
		this.firstVertex[tileMeshes.length] = vertexOffset;

		this.weights = [new Uint8Array(vertexCount * 4), new Uint8Array(vertexCount * 4)];
		this.bakedTiles = tileMeshes.map(() => null);

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute("weightsA", new THREE.BufferAttribute(this.weights[0], 4, true));
		geometry.setAttribute("weightsB", new THREE.BufferAttribute(this.weights[1], 4, true));
		geometry.setIndex(new THREE.BufferAttribute(indices, 1));
		this.mesh = new THREE.Mesh(geometry, this.material);
		this.mesh.frustumCulled = false;
		this.scene.add(this.mesh);
		this.needsBake = true;
	}

	/** Re-bakes only when a tile changed since the last call; returns whether it did. */
	update(renderer: THREE.WebGLRenderer): boolean {
		if (!this.mesh) return false;

		const geometry = this.mesh.geometry;
		let changed = false;
		for (let i = 0; i < this.tileMeshes.length; i++) {
			const tile = this.tileMeshes[i].tile;
			if (tile === this.bakedTiles[i]) continue;
			this.bakedTiles[i] = tile;
			this.writeWeights(i, tile);
			changed = true;
		}
		if (changed) {
			geometry.getAttribute("weightsA").needsUpdate = true;
			geometry.getAttribute("weightsB").needsUpdate = true;
		}
		if (!changed && !this.needsBake) return false;

		this.needsBake = false;
		this.bake(renderer);
		return true;
	}

	dispose() {
		this.disposeMesh();
		this.material.dispose();
		this.targets.forEach((target) => target.dispose());
	}

	private writeWeights(tileIndex: number, tile: Tile) {
		const channel = CHANNELS[tile];
		const start = this.firstVertex[tileIndex] * 4;
		const end = this.firstVertex[tileIndex + 1] * 4;
		for (const set of this.weights) set.fill(0, start, end);
		if (!channel) return;

		const [set, offset] = channel;
		for (let i = start; i < end; i += 4) this.weights[set][i + offset] = 255;
	}

	private bake(renderer: THREE.WebGLRenderer) {
		const clearAlpha = renderer.getClearAlpha();
		renderer.getClearColor(this.clearColor);
		renderer.setClearColor(0x000000, 0);
		for (const set of [0, 1] as const) {
			this.material.uniforms.weightSet.value = set;
			this.cameras[set].update(renderer, this.scene);
		}
		renderer.setClearColor(this.clearColor, clearAlpha);
	}

	private disposeMesh() {
		if (!this.mesh) return;
		this.scene.remove(this.mesh);
		this.mesh.geometry.dispose();
		this.mesh = null;
	}
}
