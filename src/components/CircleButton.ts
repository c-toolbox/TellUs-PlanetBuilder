import * as THREE from "three";
import { Easing, Tween } from "@tweenjs/tween.js";
import { ORIGIN } from "@/constants";
import TextLabel from "@/components/TextLabel";
import { TouchInteraction } from "@/network/TouchInteraction";
import type { TouchId } from "@/network/tuioProtocol";
import circleUrl from "@/assets/textures/circle.png";

const circleTexture = new THREE.TextureLoader().load(circleUrl);
const circleMask = new THREE.TextureLoader().load(circleUrl);
circleMask.channel = 1;

export interface CircleButtonOptions {
	position: THREE.Vector3;
	onClick?: () => void;
	onPress?: () => void;
	radius?: number;
	texture?: THREE.Texture | string;
	color?: THREE.ColorRepresentation;
	label?: string;
}

export default class CircleButton extends THREE.Mesh<
	THREE.CircleGeometry,
	THREE.MeshBasicMaterial
> {
	private readonly visuals = new THREE.Group();
	private readonly clickCallback?: () => void;
	private readonly radius: number;
	private pressTouchId?: TouchId;
	private clickTouchId?: TouchId;
	private held = false;
	private scaleTween?: Tween<THREE.Vector3>;
	private icon?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
	private textLabel?: TextLabel;
	public readonly touchInteraction: TouchInteraction;

	constructor({
		position,
		onClick,
		onPress,
		radius = 0.08,
		texture,
		color = 0xffffff,
		label,
	}: CircleButtonOptions) {
		const map =
			typeof texture === "string"
				? new THREE.TextureLoader().load(texture)
				: texture;

		super(
			new THREE.CircleGeometry(radius, 64),
			new THREE.MeshBasicMaterial({ visible: false }),
		);

		const background = new THREE.Mesh(
			new THREE.PlaneGeometry(radius * 2, radius * 2),
			new THREE.MeshBasicMaterial({
				color,
				map: circleTexture,
				transparent: true,
				alphaTest: 0.01,
				side: THREE.FrontSide,
			}),
		);
		background.raycast = () => {};
		background.onBeforeRender = () => { this.scaleTween?.update(); };
		this.visuals.add(background);
		this.add(this.visuals);

		this.clickCallback = onClick;
		this.radius = radius;
		this.touchInteraction = new TouchInteraction(this, { clickDuration: Infinity });
		this.touchInteraction.on("press", ({ touchId }) => {
			if (this.pressTouchId !== undefined) return;
			this.pressTouchId = touchId;
			this.clickTouchId = undefined;
			this.setHeld(true);
			onPress?.();
		});
		this.touchInteraction.on("leave", ({ touchId }) => {
			if (touchId !== this.pressTouchId) return;
			this.pressTouchId = undefined;
			this.clickTouchId = undefined;
			this.setHeld(false);
		});
		this.touchInteraction.on("release", ({ touchId, isHovered }) => {
			if (touchId !== this.pressTouchId) return;
			this.pressTouchId = undefined;
			this.clickTouchId = isHovered ? touchId : undefined;
			this.setHeld(false);
		});
		this.touchInteraction.on("click", ({ touchId }) => {
			if (touchId !== this.clickTouchId) return;
			this.clickTouchId = undefined;
			this.click();
		});
		this.position.copy(position);
		this.lookAt(ORIGIN);

		const outline = new THREE.Mesh(
			new THREE.PlaneGeometry(radius * 2.3, radius * 2.3),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				map: circleTexture,
				transparent: true,
				alphaTest: 0.01,
				side: THREE.FrontSide,
			}),
		);
		outline.position.z = -0.001;
		outline.raycast = () => {};
		this.visuals.add(outline);

		if (map) {
			this.setTexture(map);
		}

		if (label) {
			this.setLabel(label);
		}
	}

	setLabel(label: string) {
		if (this.textLabel) {
			this.textLabel.setText(label);
			return;
		}

		this.textLabel = new TextLabel(label, 0.1);
		this.textLabel.position.set(
			0,
			-this.radius - 0.1,
			0.003,
		);
		this.visuals.add(this.textLabel);
	}

	setLabelVisible(visible: boolean) {
		if (this.textLabel) this.textLabel.visible = visible;
	}

	setTexture(texture: THREE.Texture) {
		texture.colorSpace = THREE.SRGBColorSpace;
		if (this.icon) {
			this.icon.material.map = texture;
			this.icon.material.needsUpdate = true;
			return;
		}

		this.icon = new THREE.Mesh(
			new THREE.PlaneGeometry(this.radius * 2, this.radius * 2),
			new THREE.MeshBasicMaterial({
				map: texture,
				alphaMap: circleMask,
				transparent: true,
				alphaTest: 0.01,
				side: THREE.FrontSide,
			}),
		);
		this.icon.position.z = 0.002;
		this.icon.raycast = () => {};
		this.icon.geometry.setAttribute("uv1", this.icon.geometry.getAttribute("uv").clone());
		let previousAspect = 0;
		this.icon.onBeforeRender = () => {
			const icon = this.icon!;
			const image = icon.material.map?.image;
			if (!image?.width || !image?.height) return;
			const aspect = image.width / image.height;
			if (aspect === previousAspect) return;
			previousAspect = aspect;
			const width = Math.min(1, 1 / aspect);
			const height = Math.min(1, aspect);
			const uv = icon.geometry.getAttribute("uv");
			for (let index = 0; index < uv.count; index++) {
				uv.setXY(
					index,
					(1 - width) / 2 + (index % 2) * width,
					(1 + height) / 2 - Math.floor(index / 2) * height,
				);
			}
			uv.needsUpdate = true;
		};
		this.visuals.add(this.icon);
	}

	private setHeld(held: boolean) {
		if (this.held === held) return;
		this.held = held;
		this.scaleTween?.stop();
		const target = held ? 0.9 : 1;
		this.scaleTween = new Tween(this.visuals.scale)
			.to({ x: target, y: target, z: target }, held ? 100 : 500)
			.easing(held ? Easing.Cubic.Out : Easing.Elastic.Out)
			.start();
	}

	resetInteraction() {
		this.scaleTween?.stop();
		this.scaleTween = undefined;
		this.pressTouchId = undefined;
		this.clickTouchId = undefined;
		this.held = false;
		this.visuals.scale.setScalar(1);
	}

	click() {
		this.clickCallback?.();
	}

	dispose() {
		this.resetInteraction();
		this.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			if (object instanceof TextLabel) {
				object.dispose();
				return;
			}

			object.geometry.dispose();
			const materials = Array.isArray(object.material)
				? object.material
				: [object.material];
			materials.forEach((material) => material.dispose());
		});
	}
}
