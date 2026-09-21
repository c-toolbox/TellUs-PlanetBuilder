import * as THREE from "three";
import BaseScene from "@/scenes/BaseScene";
import { SceneKey } from "@/scenes/SceneManager";
import { Renderer } from "@/rendering/Renderer";

import { TouchId } from "@/network/tuioProtocol";
import { UiConfigEvent } from "@/network/uiProtocol";
import { BACKGROUND_DISTANCE, ORIGIN } from "@/constants";
import CircularButton from "@/components/CircularButton";
import pinIcon from "@/assets/icons/pin.png";
import homeIcon from "@/assets/icons/home.png";
import {
	LocationKey,
	LocationKeys,
	locations,
} from "@/scenes/vinjett/locations";

interface VinjettUiConfig {
	location: LocationKey; // Add in locations.ts
}

interface BackgroundCacheEntry {
	materials: THREE.MeshBasicMaterial[];
	ready: Promise<THREE.MeshBasicMaterial[]>;
}

type TransitionPhase = "idle" | "loading" | "wipe" | "reveal";

const BUTTON_ANIMATION_DURATION = 250;
const WIPE_DURATION = 1000;

export default class VinjettScene extends BaseScene {
	private worldConfig: VinjettUiConfig = {
		location: "Home",
	};
	private backgroundCube?: THREE.Mesh<
		THREE.BoxGeometry,
		THREE.MeshBasicMaterial[]
	>;
	private circularButtons: CircularButton[] = [];
	private pinTexture = new THREE.TextureLoader().load(pinIcon);
	private homeTexture = new THREE.TextureLoader().load(homeIcon);
	private backgroundCache = new Map<LocationKey, BackgroundCacheEntry>();
	private transitionPhase: TransitionPhase = "idle";
	private transitionElapsed = 0;
	private transitionTarget?: LocationKey;
	private transitionOrigin = new THREE.Vector3(0, 0, 1);
	private pendingBackground?: THREE.MeshBasicMaterial[];

	constructor() {
		super();

		this.addBackground(this.worldConfig.location);
		this.addCircularButtons();
	}

	private addCircularButtons() {
		this.circularButtons.forEach((button) => {
			this.remove(button);
			button.dispose();
		});
		this.circularButtons = [];

		if (this.worldConfig.location === "Home") {
			for (const locationKey of LocationKeys) {
				const location = locations[locationKey];
				if (!("homeButtonRotation" in location)) continue;

				const { pitch, yaw } = location.homeButtonRotation;
				const position = this.pitchYawToVector3(pitch, yaw);
				this.addCircularButton(
					position,
					location.color,
					this.pinTexture,
					() => this.setLocation(locationKey, position),
				);
			}
			return;
		}

		const location = locations[this.worldConfig.location];
		const { pitch, yaw } = location.homeButtonRotation;
		const position = this.pitchYawToVector3(pitch, yaw);
		this.addCircularButton(
			position,
			0x808080,
			this.homeTexture,
			() => this.setLocation("Home", position),
		);
	}

	private addCircularButton(
		position: THREE.Vector3,
		color: THREE.ColorRepresentation,
		texture: THREE.Texture,
		onClick: () => void,
	) {
			const button = new CircularButton({
				position,
				color,
				texture,
				onClick,
			});

			this.circularButtons.push(button);
			this.add(button);
	}

	private setLocation(
		locationKey: LocationKey,
		origin = this.getTransitionOrigin(locationKey),
	) {
		if (
			this.transitionPhase !== "idle" ||
			locationKey === this.worldConfig.location
		) {
			return;
		}

		this.transitionTarget = locationKey;
		this.transitionOrigin.copy(origin).normalize();
		this.pendingBackground = undefined;
		this.transitionPhase = "loading";
		this.transitionElapsed = 0;

		this.getBackground(locationKey).ready.then(
			(materials) => {
				if (this.transitionTarget === locationKey) {
					this.pendingBackground = materials;
				}
			},
			(error) => {
				console.error(`Failed to load location ${locationKey}`, error);
				this.backgroundCache.delete(locationKey);
				if (this.transitionTarget === locationKey) {
					this.transitionTarget = undefined;
					this.transitionPhase = "reveal";
					this.transitionElapsed = 0;
					this.circularButtons.forEach((button) => {
						button.visible = true;
						button.scale.setScalar(0);
					});
				}
			},
		);
	}

	private getTransitionOrigin(locationKey: LocationKey) {
		const originLocationKey =
			this.worldConfig.location === "Home"
				? locationKey
				: this.worldConfig.location;
		const location = locations[originLocationKey];
		if (!("homeButtonRotation" in location)) {
			return new THREE.Vector3(0, 0, 1);
		}

		const { pitch, yaw } = location.homeButtonRotation;
		return this.pitchYawToVector3(pitch, yaw);
	}

	protected override addBackground(locationKey: LocationKey) {
		this.applyBackground(this.getBackground(locationKey).materials);
	}

	private getBackground(locationKey: LocationKey): BackgroundCacheEntry {
		const cached = this.backgroundCache.get(locationKey);
		if (cached) return cached;

		const location = locations[locationKey];
		const loader = new THREE.TextureLoader();
		const textureEntries = [
			location.px,
			location.nx,
			location.py,
			location.ny,
			location.pz,
			location.nz,
		].map((assetPath) => {
			let texture!: THREE.Texture;
			const ready = new Promise<void>((resolve, reject) => {
				texture = loader.load(assetPath, () => resolve(), undefined, reject);
			});
			texture.colorSpace = THREE.SRGBColorSpace;
			return { texture, ready };
		});
		const materials = textureEntries.map(
			({ texture }) =>
				new THREE.MeshBasicMaterial({
					map: texture,
					side: THREE.BackSide,
				}),
		);
		const entry = {
			materials,
			ready: Promise.all(textureEntries.map(({ ready }) => ready)).then(
				() => materials,
			),
		};
		this.backgroundCache.set(locationKey, entry);
		return entry;
	}

	private applyBackground(materials: THREE.MeshBasicMaterial[]) {
		if (this.backgroundCube) {
			this.backgroundCube.material = materials;
			return;
		}

		const size = BACKGROUND_DISTANCE * 2;
		this.backgroundCube = new THREE.Mesh(
			new THREE.BoxGeometry(size, size, size),
			materials,
		);
		this.backgroundCube.position.copy(ORIGIN);
		this.add(this.backgroundCube);
	}

	private finishBackgroundSwap() {
		if (!this.transitionTarget || !this.pendingBackground) return;

		this.applyBackground(this.pendingBackground);
		this.worldConfig.location = this.transitionTarget;
		this.transitionTarget = undefined;
		this.pendingBackground = undefined;
		this.addCircularButtons();
		this.circularButtons.forEach((button) => button.scale.setScalar(0));
		this.sendUiConfig();
		this.transitionPhase = "reveal";
		this.transitionElapsed = 0;
	}

	private easeInBack(progress: number) {
		const overshoot = 1.70158;
		return (overshoot + 1) * progress ** 3 - overshoot * progress ** 2;
	}

	private easeOutBack(progress: number) {
		const overshoot = 1.70158;
		return (
			1 +
			(overshoot + 1) * (progress - 1) ** 3 +
			overshoot * (progress - 1) ** 2
		);
	}

	override update(delta: number) {
		if (this.transitionPhase === "idle") return;

		if (this.transitionPhase === "loading") {
			this.transitionElapsed += delta;
			const progress = Math.min(
				this.transitionElapsed / BUTTON_ANIMATION_DURATION,
				1,
			);
			const scale = 1 - this.easeInBack(progress);
			this.circularButtons.forEach((button) => button.scale.setScalar(scale));

			if (progress === 1) {
				this.circularButtons.forEach((button) => (button.visible = false));
				if (this.pendingBackground) {
					this.transitionPhase = "wipe";
					this.transitionElapsed = 0;
				}
			}
			return;
		}

		this.transitionElapsed += delta;
		if (this.transitionPhase === "wipe") {
			const progress = Math.min(this.transitionElapsed / WIPE_DURATION, 1);
			if (progress === 1) {
				this.finishBackgroundSwap();
			}
			return;
		}

		const progress = Math.min(
			this.transitionElapsed / BUTTON_ANIMATION_DURATION,
			1,
		);
		const scale = this.easeOutBack(progress);
		this.circularButtons.forEach((button) => button.scale.setScalar(scale));

		if (progress === 1) {
			this.circularButtons.forEach((button) => button.scale.setScalar(1));
			this.transitionPhase = "idle";
		}
	}

	override renderScene(renderer: Renderer) {
		const projectionScene = renderer.projectionScene;
		const cameraPosition = renderer.centerCamera.position;
		const cameraQuaternion = renderer.centerCamera.quaternion;

		projectionScene.cubeCamera.position.copy(cameraPosition);
		projectionScene.cubeCamera.quaternion.copy(cameraQuaternion);
		projectionScene.cubeCamera.update(renderer, this);

		if (
			this.transitionPhase === "wipe" &&
			this.backgroundCube &&
			this.pendingBackground
		) {
			const currentBackground = this.backgroundCube.material;
			this.backgroundCube.material = this.pendingBackground;

			projectionScene.transitionCubeCamera.position.copy(cameraPosition);
			projectionScene.transitionCubeCamera.quaternion.copy(cameraQuaternion);
			projectionScene.transitionCubeCamera.update(renderer, this);
			this.backgroundCube.material = currentBackground;

			const localOrigin = this.transitionOrigin
				.clone()
				.applyQuaternion(cameraQuaternion.clone().invert());
			projectionScene.setTransition(
				true,
				Math.min(this.transitionElapsed / WIPE_DURATION, 1),
				localOrigin,
			);
		} else {
			projectionScene.setTransition(false);
		}

		renderer.setRenderTarget(null);
		renderer.render(projectionScene, projectionScene.screenCamera);
	}

	// setRendererSettings(renderer: Renderer) {
	// 	renderer.outputColorSpace = THREE.SRGBColorSpace;
	// }

	/* Touch input */

	protected onClick(touchId: TouchId, vector: THREE.Vector3) {
		if (this.transitionPhase !== "idle") return;

		this.raycaster.set(ORIGIN, vector.clone().normalize());
		const [intersection] = this.raycaster.intersectObjects(
			this.circularButtons,
		);

		if (intersection) {
			(intersection.object as CircularButton).click();
		}
	}

	/* Coordinates */

	private pitchYawToVector3(
		pitchDegrees: number,
		yawDegrees: number,
		radius = 1,
	): THREE.Vector3 {
		const pitch = THREE.MathUtils.degToRad(pitchDegrees);
		const yaw = THREE.MathUtils.degToRad(yawDegrees);

		return new THREE.Vector3(
			radius * Math.cos(pitch) * Math.sin(yaw),
			radius * Math.sin(pitch),
			radius * Math.cos(pitch) * Math.cos(yaw),
		);
	}

	/* Socket UI */

	initializeUi() {
		super.initializeUi();

		this.uiSocket.on("location", (value: LocationKey) => {
			this.setLocation(value);
		});
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

				{
					type: "dropdown",
					id: "location",
					hint_title: "Location",
					hint_text: "Select the location for the scene",
					value: this.worldConfig.location,
					options: LocationKeys, // Add list of all valid location keys
				},
			],
		};
	}
}
