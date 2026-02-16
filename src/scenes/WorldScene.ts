import * as THREE from "three";

import { ORIGIN, SHOW_EDGES, SHOW_FACES, SHOW_VERTICES } from "@/constants";
import { TileMesh } from "@/geometry/TileMesh";
import { TouchId } from "@/network/tuioProtocol";
import { Tile, tileManager } from "@/geometry/TileManager";
import BaseScene from "./BaseScene";

import { Renderer } from "./Renderer";
import { Polyhedra } from "@/geometry/Polyhedra";
import backgroundAsset from "@/assets/backgrounds/globe/black_and_white.jpeg";
// import backgroundAsset from "@/assets/backgrounds/globe/heightmap.png";
// import backgroundAsset from "@/assets/backgrounds/globe/standard.jpg";
// import backgroundAsset from "@/assets/backgrounds/globe/truecolor.png";
// import backgroundAsset from "@/assets/backgrounds/streetview/iviv.jpeg";
// import backgroundAsset from "@/assets/backgrounds/streetview/tossa_de_mar.jpeg";
// import backgroundAsset from "@/assets/backgrounds/numbers.jpeg";
// import backgroundAsset from "@/assets/backgrounds/soccer.jpg";

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
// import model from "@/geometry/models/goldberg492.json"
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

export default class WorldScene extends BaseScene {
	constructor() {
		super();

		this.onTouch = this.onTouch.bind(this);
		this.onClick = this.onClick.bind(this);

		this.addBackground(backgroundAsset);
		// this.addText({
		// 	text: "Hello world!",
		// 	color: 0xff0000,
		// 	position: new THREE.Vector3(0, 1, 0),
		// });

		// Lighting
		const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.9);
		this.add(hemi);
		const dir = new THREE.DirectionalLight(0xffffff, 0.6);
		dir.position.set(5, 10, 7);
		this.add(dir);

		// Fog
		// this.fog = new THREE.Fog(0x000000, 2, 3);

		/* Polyhedra */

		const globe = new Polyhedra(model);
		if (SHOW_VERTICES) this.add(globe.vertexGroup);
		if (SHOW_EDGES) this.add(globe.edgeGroup);
		if (SHOW_FACES) this.add(globe.faceGroup);

		this.makeClickable(globe.faceGroup);
	}

	override onEnter(renderer: Renderer) {
		console.log("WorldScene active");

		// Subscribe to touch events
		this.touchHandler.on("touch", this.onTouch);
		this.touchHandler.on("click", this.onClick);

		// Example: listen for OmniSocket events
		// this.omniSocket.on("playerJoined", this.handlePlayerJoin);

		this.add(this.touchHandler.touchGroup);
	}

	override onExit(renderer: Renderer) {
		console.log("WorldScene exiting");

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
}
