import * as THREE from "three";
import CircleButton from "@/components/CircleButton";
import TextLabel from "@/components/TextLabel";
import type { TouchInteraction } from "@/network/TouchInteraction";
import { createPanelCurve, type PanelCurve } from "@/utils/curvePanel";
import arrowUrl from "@/assets/textures/icons/arrow.png";
import { Color } from "@/utils/colors";

// Piano-space layout on the black back panel above the keys.
const DISPLAY_Y = 0.5;
// Back panel top (0.24) plus clearance over its 0.5-wide curved facets.
const DISPLAY_Z = 0.27;
const LAYER = 0.002;
const LCD_WIDTH = 2.5;
const LCD_HEIGHT = 0.26;
const BEZEL_MARGIN = 0.01;
const TEXT_SIZE = 0.09;
// Approximate cap height ratio, to vertically center the baseline-anchored text.
const CAP_HEIGHT_RATIO = 0.72;
const TEXT_PADDING = 0.1;
const BUTTON_RADIUS = 0.06;
const BUTTON_X = -1.4;
const BUTTON_Y = 0.08;
const TEXT_SEGMENT_WIDTH = 0.05;
const PLANE_SEGMENT_WIDTH = 0.1;

const BEZEL_COLOR = Color.Stone500;
const LCD_COLOR = 0x0d2b2c;
const BUTTON_COLOR = LCD_COLOR;
const TEXT_COLOR = 0xffffff;
const ERROR_COLOR = 0xff7a7a;

interface PianoDisplayOptions {
	/** Group whose local space is the piano's, bent around Y at the given radius. */
	panel: THREE.Object3D;
	radius: number;
	registerInteraction: (interaction: TouchInteraction) => TouchInteraction;
	onStep: (delta: number) => void;
}

/** An LCD with instrument up/down buttons, curved to follow the piano. */
export class PianoDisplay {
	readonly object = new THREE.Group();
	private readonly label = new TextLabel(
		"",
		TEXT_SIZE,
		"left",
		LCD_WIDTH - TEXT_PADDING * 2,
		"baseline",
		"Regular",
	);
	private readonly buttons: { button: CircleButton; y: number }[] = [];
	private readonly planeCurves: PanelCurve[] = [];
	private labelCurve?: PanelCurve;
	private radius: number;
	private text = "";

	constructor(options: PianoDisplayOptions) {
		const { panel, radius, registerInteraction, onStep } = options;
		this.radius = radius;
		this.object.position.y = DISPLAY_Y;
		panel.add(this.object);

		const bezel = this.addPlane(
			LCD_WIDTH + BEZEL_MARGIN * 2,
			LCD_HEIGHT + BEZEL_MARGIN * 2,
			BEZEL_COLOR,
			DISPLAY_Z,
		);
		const lcd = this.addPlane(LCD_WIDTH, LCD_HEIGHT, LCD_COLOR, DISPLAY_Z + LAYER);
		for (const plane of [bezel, lcd]) {
			const curve = createPanelCurve(panel, { maxSegmentWidth: PLANE_SEGMENT_WIDTH }, plane);
			curve.setRadius(radius);
			this.planeCurves.push(curve);
		}

		this.label.position.set(
			-LCD_WIDTH / 2 + TEXT_PADDING,
			(-TEXT_SIZE * CAP_HEIGHT_RATIO) / 2,
			DISPLAY_Z + LAYER * 2,
		);
		this.label.material.color.set(TEXT_COLOR);
		// Each layout replaces the label's flat geometry, so capture and bend it again.
		this.label.onLayout = () => {
			this.labelCurve = createPanelCurve(panel, { maxSegmentWidth: TEXT_SEGMENT_WIDTH }, this.label);
			this.labelCurve.setRadius(this.radius);
		};
		this.object.add(this.label);

		const buttonSpecs = [
			{ y: BUTTON_Y, rotation: Math.PI / 2, step: 1 },
			{ y: -BUTTON_Y, rotation: -Math.PI / 2, step: -1 },
		];
		for (const { y, rotation, step } of buttonSpecs) {
			// The arrow texture points right; rotate it to point down or up.
			const texture = new THREE.TextureLoader().load(arrowUrl);
			texture.center.set(0.5, 0.5);
			texture.rotation = rotation;
			const button = new CircleButton({
				position: new THREE.Vector3(),
				radius: BUTTON_RADIUS,
				texture,
				color: BUTTON_COLOR,
				accentColor: BEZEL_COLOR,
				onClick: () => onStep(step),
			});
			registerInteraction(button.touchInteraction);
			this.buttons.push({ button, y });
			this.object.add(button);
		}
		this.placeButtons();
	}

	setRadius(radius: number) {
		this.radius = radius;
		for (const curve of this.planeCurves) curve.setRadius(radius);
		this.labelCurve?.setRadius(radius);
		this.placeButtons();
	}

	setText(text: string, error = false) {
		this.label.material.color.set(error ? ERROR_COLOR : TEXT_COLOR);
		if (text === this.text) return;
		this.text = text;
		this.label.setText(text);
	}

	reset() {
		for (const { button } of this.buttons) button.resetInteraction();
	}

	// Place on the cylinder like the bent geometry, facing the viewer.
	private placeButtons() {
		const buttonZ = DISPLAY_Z + LAYER * 2;
		const angle = BUTTON_X / this.radius;
		const distance = this.radius - buttonZ;
		for (const { button, y } of this.buttons) {
			button.position.set(
				distance * Math.sin(angle),
				y,
				this.radius - distance * Math.cos(angle),
			);
			button.rotation.set(0, -angle, 0, "YXZ");
		}
	}

	private addPlane(width: number, height: number, color: number, z: number) {
		const plane = new THREE.Mesh(
			new THREE.PlaneGeometry(width, height),
			new THREE.MeshBasicMaterial({ color }),
		);
		plane.position.z = z;
		plane.raycast = () => {};
		this.object.add(plane);
		return plane;
	}
}
