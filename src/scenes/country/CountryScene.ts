import * as THREE from "three";
import earcut from "earcut";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";

import { TouchId } from "@/network/tuioProtocol";
import { UiConfigEvent } from "@/network/uiProtocol";
import { BACKGROUND_DISTANCE, ORIGIN } from "@/constants";

import worldGeodata from "@/assets/world.json";
import backgroundAsset from "@/assets/square.png";

import dayMapAsset from "@/assets/backgrounds/earth/8k_earth_daymap.jpg";
import nightMapAsset from "@/assets/backgrounds/earth/8k_earth_nightmap.jpg";
import cloudMapAsset from "@/assets/backgrounds/earth/8k_earth_clouds.png";
import specularMapAsset from "@/assets/backgrounds/earth/8k_earth_specular_map.jpg";
import normalMapAsset from "@/assets/backgrounds/earth/8k_earth_normal_map.jpg";

import canis_aureus_118264161 from "@/assets/backgrounds/iucn/canis_aureus_118264161.png";
import canis_latrans_3745 from "@/assets/backgrounds/iucn/canis_latrans_3745.png";
import canis_lupaster_118264888 from "@/assets/backgrounds/iucn/canis_lupaster_118264888.png";
import canis_lupus_3746 from "@/assets/backgrounds/iucn/canis_lupus_3746.png";
import { Color } from "@/utils/colors";
const species = [
	canis_aureus_118264161,
	canis_latrans_3745,
	canis_lupaster_118264888,
	canis_lupus_3746,
];

export default class CountryScene extends BaseScene {
	private countryMeshes: {
		mesh: THREE.Mesh;
		feature: any;
	}[] = [];

	constructor() {
		super();

		// this.addBackground(backgroundAsset, 0x888888);
		this.addBackground(backgroundAsset, 0xffffff);
		// this.addEarthBackground();

		this.drawCountries();

		species.forEach((animal, index) => {
			// const tint = Math.random() * 0xffffff;
			const radius = 1.02 + 0.002 * index;
			const tint = [
				// Color.Amber500,
				// Color.Lime500,
				// Color.Emerald500,
				// Color.Teal500,
				// Color.Cyan500,
				Color.Red500,
				Color.Green500,
				Color.Yellow500,
				Color.Orange500,
			][index % 6];
			this.drawSpecies(animal, radius, tint);
		});
	}

	// setRendererSettings(renderer: Renderer) {
	// 	renderer.outputColorSpace = THREE.SRGBColorSpace;
	// }

	/* Drawing */

	addEarthBackground() {
		const loader = new THREE.TextureLoader();
		const dayMap = loader.load(dayMapAsset);
		const nightMap = loader.load(nightMapAsset);
		const cloudMap = loader.load(cloudMapAsset);
		const specularMap = loader.load(specularMapAsset);
		const normalMap = loader.load(normalMapAsset);

		const material = new THREE.MeshBasicMaterial({
			map: dayMap,
			side: THREE.DoubleSide,
			color: 0x777777,
		});

		const geometry = new THREE.SphereGeometry(0.95, 64, 64);
		const earth = new THREE.Mesh(geometry, material);
		this.add(earth);

		const cloudMaterial = new THREE.MeshBasicMaterial({
			map: cloudMap,
			transparent: true,
			opacity: 0,
			side: THREE.DoubleSide,
		});

		const clouds = new THREE.Mesh(
			new THREE.SphereGeometry(0.95 + 0.01, 64, 64),
			cloudMaterial,
		);

		this.add(clouds);

		const light = new THREE.DirectionalLight(0xffffff, 1);
		light.position.set(5, 3, 5);
		this.add(light);

		dayMap.colorSpace = THREE.SRGBColorSpace;

		normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
	}

	drawSpecies(assetPath: string, radius: number, tintColor: number) {
		const loader = new THREE.TextureLoader();
		loader.load(assetPath, (texture) => {
			texture.colorSpace = THREE.SRGBColorSpace;

			const geometry = new THREE.SphereGeometry(radius, 64, 64);
			const material = new THREE.MeshBasicMaterial({
				map: texture,
				// side: THREE.BackSide,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.5,
			});
			material.color.set(tintColor);
			const sphere = new THREE.Mesh(geometry, material);
			sphere.scale.x *= -1;
			this.add(sphere);
		});
	}

	/* Touch input */

	protected onTouch(touchId: TouchId, vector: THREE.Vector3) {
		this.onClick(touchId, vector);
	}

	protected onClick(touchId: TouchId, vector: THREE.Vector3) {
		// Use raycasting to detect which country was clicked
		this.raycaster.set(ORIGIN, vector);

		const clickableMeshes = this.countryMeshes.map((entry) => entry.mesh);
		const intersects = this.raycaster.intersectObjects(clickableMeshes);

		if (intersects.length > 0) {
			const hitMesh = intersects[0].object as THREE.Mesh;

			const countryEntry = this.countryMeshes.find(
				(entry) => entry.mesh === hitMesh,
			);

			if (countryEntry) {
				console.log("Clicked country:", countryEntry.feature.properties.name);

				const material = hitMesh.material as THREE.MeshBasicMaterial;
				material.color.set(Math.random() * 0xffffff);
			}

			return;
		}

		console.log("No country hit");
	}

	/* Coordinates */

	drawCountries() {
		worldGeodata.features.forEach((countryData) => {
			const { type, coordinates } = countryData.geometry;
			const outlineColor = 0x000000;
			// const color = Math.random() * 0xffffff;
			const color = 0xffffff;

			if (type == "Polygon") {
				this.drawCountryOutline(
					coordinates as [number, number][][],
					outlineColor,
				);
				// this.drawCountry(
				// 	coordinates as [number, number][][],
				// 	color,
				// 	countryData,
				// );
			} else if (type == "MultiPolygon") {
				coordinates.forEach((coords) => {
					this.drawCountryOutline(coords as [number, number][][], outlineColor);
					// this.drawCountry(coords as [number, number][][], color, countryData);
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
			points.push(this.latLonToVector3(lat, lon, 1.001)); // slight offset to avoid z-fighting
		});

		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		// geometry.scale(0.5, 0.5, 0.5);

		const material = new THREE.LineBasicMaterial({ color });

		const line = new THREE.LineLoop(geometry, material);
		this.add(line);
	}

	drawCountry(
		coordinates: [number, number][][],
		color: THREE.ColorRepresentation,
		feature: any,
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

		const material = new THREE.MeshBasicMaterial({
			color,
			side: THREE.DoubleSide,
		});

		const mesh = new THREE.Mesh(geometry, material);

		this.add(mesh);
		this.countryMeshes.push({ mesh, feature });
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

	initializeUi() {
		super.initializeUi();
	}

	sendUiConfig() {
		this.uiSocket.send(this.uiConfig);
	}

	get uiConfig(): UiConfigEvent {
		return {
			type: "config",
			title: "Country",
			elements: [
				{
					type: "dropdown",
					id: "scene",
					hint_title: "Scene",
					hint_text: "Switch to a different scene",
					value: SceneKey.Country,
					options: Object.values(SceneKey),
				},
			],
		};
	}
}
