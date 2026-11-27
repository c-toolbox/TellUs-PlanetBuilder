import * as THREE from "three";
import earcut from "earcut";
import { Easing, Tween } from "@tweenjs/tween.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import BackgroundSphere from "@/components/BackgroundSphere";
import backgroundAsset from "@/assets/textures/earth/animated.webm";
import BaseScene from "@/scenes/BaseScene";
import { SceneId, scenes } from "@/scenes/scenes";

import { TouchInteraction } from "@/network/TouchInteraction";
import { UiConfigEvent } from "@/network/socket_ui/protocol";
import type { Renderer } from "@/rendering/Renderer";

import countriesGeodata from "./countries.json";

interface CountryHighlight {
	material: THREE.MeshBasicMaterial;
	interaction: TouchInteraction;
	active: boolean;
	tween?: Tween<THREE.MeshBasicMaterial>;
}

export default class CountryScene extends BaseScene {
	private readonly backgroundVideo = document.createElement("video");
	private readonly countryHighlights: CountryHighlight[] = [];

	constructor() {
		super();

		this.backgroundVideo.loop = true;
		this.backgroundVideo.muted = true;
		this.backgroundVideo.playsInline = true;
		this.backgroundVideo.preload = "metadata";
		this.backgroundVideo.src = backgroundAsset;
		this.add(new BackgroundSphere(new THREE.VideoTexture(this.backgroundVideo), 2));

		this.drawCountries();
	}

	override onSceneEnter(renderer: Renderer) {
		super.onSceneEnter(renderer);
		void this.backgroundVideo.play().catch((error: unknown) => {
			if (this.renderer) console.error("Failed to play country background video", error);
		});
	}

	override onSceneExit(renderer: Renderer) {
		this.backgroundVideo.pause();
		super.onSceneExit(renderer);
		for (const country of this.countryHighlights) {
			country.material.opacity = 0;
			country.active = false;
			country.tween = undefined;
		}
	}

	/* Touch input */

	private updateCountryHighlight(country: CountryHighlight) {
		const active = country.interaction.activeTouchIds.size > 0;
		if (country.active === active) return;
		country.active = active;
		country.tween?.stop();
		country.tween = this.createTween(country.material)
			.to({ opacity: active ? 0.75 : 0 }, active ? 200 : 1200)
			.easing(active ? Easing.Back.Out : Easing.Cubic.Out)
			.onComplete(() => (country.tween = undefined))
			.start();
	}

	/* Coordinates */

	drawCountries() {
		countriesGeodata.features.forEach((countryData) => {
			const { type, coordinates } = countryData.geometry;
			const group = new THREE.Group();
			group.name = countryData.properties.name;
			this.add(group);
			const material = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0,
				depthWrite: false,
			});
			const interaction = this.registerTouchInteraction(new TouchInteraction(group));
			const country: CountryHighlight = { material, interaction, active: false };
			this.countryHighlights.push(country);
			const updateHighlight = () => this.updateCountryHighlight(country);
			interaction.on("enter", updateHighlight);
			interaction.on("leave", updateHighlight);
			interaction.on("release", updateHighlight);

			if (type == "Polygon") {
				this.drawCountryOutline(
					coordinates as [number, number][][],
					0xffffff,
				);
				this.drawCountry(
					coordinates as [number, number][][],
					material,
					group,
				);
			} else if (type == "MultiPolygon") {
				coordinates.forEach((coords) => {
					this.drawCountryOutline(coords as [number, number][][], 0xffffff);
					this.drawCountry(
						coords as [number, number][][],
						material,
						group,
					);
				});
			}
		});
	}

	drawCountryOutline(
		coordinates: [number, number][][],
		color: THREE.ColorRepresentation,
	) {
		const points: THREE.Vector3[] = [];

		coordinates[0].forEach(([lon, lat]) => {
			points.push(this.latLonToVector3(lat, lon, 0.99)); // slight offset to avoid z-fighting
		});

		if (points.length < 2) return;
		if (!points[0].equals(points[points.length - 1])) points.push(points[0].clone());
		const geometry = new LineGeometry().setPositions(points.flatMap((point) => point.toArray()));

		const material = new LineMaterial({ color, linewidth: 2 });

		const line = new Line2(geometry, material);
		this.add(line);
	}

	drawCountry(
		coordinates: [number, number][][],
		material: THREE.MeshBasicMaterial,
		group: THREE.Group,
	) {
		const vertices: number[] = [];
		const holes: number[] = [];
		const positions3D: THREE.Vector3[] = [];

		let holeIndex = 0;

		coordinates.forEach((ring, i) => {
			if (i > 0) {
				holeIndex += coordinates[i - 1].length;
				holes.push(holeIndex);
			}

			ring.forEach(([lon, lat]) => {
				// Store 2D for triangulation
				vertices.push(lon, lat);

				// Store 3D version
				positions3D.push(this.latLonToVector3(lat, lon, 1.001));
			});
		});

		// Triangulate
		const indices = earcut(vertices, holes, 2);

		// Build geometry
		const finalVertices: number[] = [];

		indices.forEach((i) => {
			const v = positions3D[i];
			finalVertices.push(v.x, v.y, v.z);
		});

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(finalVertices, 3),
		);
		geometry.computeVertexNormals();

		const mesh = new THREE.Mesh(geometry, material);

		group.add(mesh);
	}

	latLonToVector3(lat: number, lon: number, radius = 1): THREE.Vector3 {
		const phi = (90 - lat) * (Math.PI / 180); // polar angle
		const theta = (lon + 180) * (Math.PI / 180); // azimuthal

		return new THREE.Vector3(
			radius * Math.sin(phi) * Math.cos(theta),
			radius * Math.cos(phi),
			radius * Math.sin(phi) * Math.sin(theta),
		);
	}

	/* Socket UI */

	registerSocketUiListeners() {
		super.registerSocketUiListeners();
		this.uiSocket.on("scene", (id: SceneId) => {
			this.sceneManager.setScene(id);
		});
	}

	get socketUiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Country",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneId.Country,
					options: scenes.map((scene) => scene.id),
				},
			],
		};
	}
}
