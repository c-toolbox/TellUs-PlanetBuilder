/* Button */

interface UiButtonConfig {
	type: "button";
	id: string;
	text: string;
	hint_title?: string;
	hint_text?: string;
	color?: string;
}

interface UiButtonEvent {
	type: "button";
	id: string;
}

/* Dropdown */

interface UiDropdownConfig {
	type: "dropdown";
	id: string;
	hint_title?: string;
	hint_text?: string;
	options: readonly string[];
	value: string;
	color?: string;
}

interface UiDropdownEvent {
	type: "dropdown";
	id: string;
	value: string;
}

/* Hr */

interface UiHrConfig {
	type: "hr";
	id: string;
	hint_title?: string;
}

/* Ratio slider */

interface UiRatioSliderConfig {
	type: "ratio_slider";
	id: string;
	hint_title?: string;
	hint_text?: string;
	values: {
		name: string;
		value: number;
		color: string;
	}[];
}

interface UiRatioSliderEvent {
	type: "ratio_slider";
	id: string;
	values: number[];
}

/* Slider */

interface UiSliderConfig {
	type: "slider";
	id: string;
	hint_title?: string;
	hint_text?: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	color?: string;
}

interface UiSliderEvent {
	type: "slider";
	id: string;
	value: number;
}

/* Switch */

interface UiSwitchConfig {
	type: "switch";
	id: string;
	hint_title?: string;
	hint_text?: string;
	value: boolean;
	color?: string;
}

interface UiSwitchEvent {
	type: "switch";
	id: string;
	value: boolean;
}

/* Text */

interface UiTextConfig {
	type: "text";
	id: string;
	hint_title?: string;
	hint_text?: string;
}

/* Grid */

interface UiGridConfig {
	type: "grid";
	id: string;
	columns: number;
	elements: UiElement[];
}

/* Events */

export type UiElement =
	| UiButtonConfig
	| UiDropdownConfig
	| UiHrConfig
	| UiRatioSliderConfig
	| UiSliderConfig
	| UiSwitchConfig
	| UiTextConfig
	| UiGridConfig;

export interface UiConfigEvent {
	type: "config";
	title: string;
	elements: UiElement[];
}

export interface UiRequestEvent {
	type: "request";
}

export type UiUpdateEvent =
	| UiButtonEvent
	| UiDropdownEvent
	| UiRatioSliderEvent
	| UiSliderEvent
	| UiSwitchEvent;

export type UiEvent = UiConfigEvent | UiRequestEvent | UiUpdateEvent;
