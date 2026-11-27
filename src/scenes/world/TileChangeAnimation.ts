import * as THREE from "three";
import { Easing } from "@tweenjs/tween.js";
import { Tile } from "./TileManager";
import type { TileMesh } from "./TileMesh";

const DURATION_MS = 600;

type Overlay = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

interface TileChange {
	outgoing: Overlay;
	incoming: Overlay;
	targetScale: THREE.Vector3;
	opacity: number;
	elapsed: number;
}

/** Temporary visuals; the tile's geometry and raycast target stay fixed. */
export class TileChangeAnimation extends THREE.Group {
	private readonly changes = new Map<TileMesh, TileChange>();

	setTile(mesh: TileMesh, tile: Tile) {
		if (mesh.tile === tile) return;

		this.removeChange(mesh);
		const previousMaterial = mesh.material.clone();
		mesh.setTile(tile);

		const outgoing = this.createOverlay(mesh, previousMaterial, 0.998);
		const incoming = this.createOverlay(mesh, mesh.material.clone(), 0.996);
		const targetScale = incoming.scale.clone();
		incoming.scale.multiplyScalar(0.9);
		this.changes.set(mesh, {
			outgoing,
			incoming,
			targetScale,
			opacity: mesh.material.opacity,
			elapsed: 0,
		});
	}

	update(delta: number) {
		for (const [mesh, change] of this.changes) {
			change.elapsed += delta;
			const progress = Math.min(change.elapsed / DURATION_MS, 1);
			if (progress === 1) {
				this.removeChange(mesh);
				continue;
			}

			// Reveal the new biome while its inset copy grows and gently settles.
			const fade = 1 - Easing.Cubic.Out(progress);
			change.outgoing.material.opacity = change.opacity * fade;
			change.incoming.material.opacity = change.opacity * fade;
			change.incoming.scale.copy(change.targetScale).multiplyScalar(
				0.9 + 0.1 * Easing.Back.Out(progress),
			);
		}
	}

	dispose() {
		for (const mesh of this.changes.keys()) this.removeChange(mesh);
	}

	private createOverlay(
		source: TileMesh,
		material: THREE.MeshBasicMaterial,
		distanceScale: number,
	): Overlay {
		material.transparent = true;
		material.depthWrite = false;
		// Geometry and textures belong to the source tile and TileManager.
		const overlay = new THREE.Mesh(source.geometry, material);
		overlay.position.copy(source.position).multiplyScalar(distanceScale);
		overlay.quaternion.copy(source.quaternion);
		overlay.scale.copy(source.scale).multiplyScalar(distanceScale);
		// Scale position and size together to preserve angular coverage from the origin.
		overlay.raycast = () => {};
		this.add(overlay);
		return overlay;
	}

	private removeChange(mesh: TileMesh) {
		const change = this.changes.get(mesh);
		if (!change) return;
		for (const overlay of [change.outgoing, change.incoming]) {
			overlay.removeFromParent();
			overlay.material.dispose();
		}
		this.changes.delete(mesh);
	}
}
