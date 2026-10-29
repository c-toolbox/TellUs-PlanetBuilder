import * as THREE from "three";
import type { TouchPoint } from "@/network/TouchPoint";
import { Tile, tileManager } from "./TileManager";
import circleUrl from "@/assets/textures/circle.png";

const circleTexture = new THREE.TextureLoader().load(circleUrl);
const circleMask = new THREE.TextureLoader().load(circleUrl);
circleMask.channel = 1;

// Planet Builder owns tile selection and its cursor; shared touches stay scene-independent.
export class TileBrush extends THREE.Group {
	tile: Tile = Tile.None;
	private readonly tileGeometry = new THREE.PlaneGeometry(1, 1);
	private readonly outlineGeometry = new THREE.PlaneGeometry(1, 1);
	private readonly tileMaterial = new THREE.MeshBasicMaterial({
		alphaMap: circleMask, transparent: true, alphaTest: 0.01, side: THREE.FrontSide,
	});
	private readonly outlineMaterial = new THREE.MeshBasicMaterial({
		map: circleTexture, transparent: true, alphaTest: 0.01, side: THREE.FrontSide,
	});

	constructor(point: TouchPoint) {
		super();
		const outline = new THREE.Mesh(this.outlineGeometry, this.outlineMaterial);
		outline.scale.setScalar(0.92);
		const tile = new THREE.Mesh(this.tileGeometry, this.tileMaterial);
		tile.scale.setScalar(0.8);
		tile.position.z = 0.001;
		this.position.z = 0.002;
		this.add(outline, tile);
		point.add(this);

		// Crop only the image UVs; the circular alpha mask keeps its full UV range.
		this.tileGeometry.setAttribute("uv1", this.tileGeometry.getAttribute("uv").clone());
		let previousAspect = 0;
		tile.onBeforeRender = () => {
			const image = this.tileMaterial.map?.image;
			if (!image?.width || !image?.height) return;
			const aspect = image.width / image.height;
			if (aspect === previousAspect) return;
			previousAspect = aspect;
			const width = Math.min(1, 1 / aspect);
			const height = Math.min(1, aspect);
			const uv = this.tileGeometry.getAttribute("uv");
			for (let index = 0; index < uv.count; index++) {
				uv.setXY(
					index,
					(1 - width) / 2 + (index % 2) * width,
					(1 + height) / 2 - Math.floor(index / 2) * height,
				);
			}
			uv.needsUpdate = true;
		};
		this.setTile(Tile.None);
	}

	setTile(tile: Tile) {
		this.tile = tile;
		this.visible = tile !== Tile.None;
		this.tileMaterial.map = tileManager.getTexture(tile);
		this.tileMaterial.needsUpdate = true;
	}

	dispose() {
		this.removeFromParent();
		this.tileGeometry.dispose();
		this.outlineGeometry.dispose();
		this.tileMaterial.dispose();
		this.outlineMaterial.dispose();
	}
}
