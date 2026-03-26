import * as THREE from "three";

import { ORIGIN, SHOW_EDGES, SHOW_FACES, SHOW_VERTICES } from "@/constants";
import { TileMesh } from "@/geometry/TileMesh";
import { TouchId } from "@/network/tuioProtocol";
import { Tile, tileManager } from "@/geometry/TileManager";
import BaseScene from "./BaseScene";

import { Renderer } from "./Renderer";
import { Polyhedra } from "@/geometry/Polyhedra";
import { UiConfigEvent } from "@/network/uiProtocol";
import backgroundAsset from "@/assets/backgrounds/globe/black_and_white.jpeg";


export default class DragDropScene extends BaseScene {
	constructor() {
		super();

		this.onTouch = this.onTouch.bind(this);
		this.onClick = this.onClick.bind(this);

		this.addBackground(backgroundAsset);
		this.addText({
			text: "Hello world!",
			color: 0xff0000,
			position: new THREE.Vector3(0, 1, 0),
		});

		// this.makeClickable(globe.faceGroup);
	}

	override onEnter(renderer: Renderer) {
		console.info("DragDropScene.onEnter");

		// Subscribe to touch events
		this.touchHandler.on("touch", this.onTouch);
		this.touchHandler.on("click", this.onClick);

		// Example: listen for OmniSocket events
		// this.omniSocket.on("playerJoined", this.handlePlayerJoin);
	}

	override onExit(renderer: Renderer) {
		console.info("DragDropScene.onExit");

		// Clean up event bindings
		this.touchHandler.off("touch", this.onTouch);
		this.touchHandler.off("click", this.onClick);
		// this.omniSocket.off("playerJoined", this.handlePlayerJoin);
	}

	private onTouch(touchId: TouchId, vector: THREE.Vector3) {
		this.handleRaycast(touchId, vector, "touch");
	}

	private onClick(touchId: TouchId, vector: THREE.Vector3) {
		this.handleRaycast(touchId, vector, "click");
	}

	handleRaycast(
		touchId: TouchId,
		vector: THREE.Vector3,
		type: "touch" | "click"
	) {
		this.raycaster.set(ORIGIN, vector);

		const touchPoint = this.touchHandler.getTouchPoint(touchId);
		if (!touchPoint) return;

		const intersects = this.raycaster.intersectObjects(this.clickable, true);
		if (intersects.length > 0) {
			const tileMesh = intersects[0].object as TileMesh;
			if (tileMesh) {
				if (type == "touch" && touchPoint.tile == Tile.None) {
					touchPoint.setTile(tileMesh.tile);
				} else if (type == "click") {
					touchPoint.setTile(tileManager.getNextTile(tileMesh.tile));
				}

				tileMesh.setTile(touchPoint.tile);
			}
		}
	}

	update(delta: number) {
		this.players.forEach((player) => player.update());
	}

	get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Drag Drop",
			elements: [],
		};
	}
}
