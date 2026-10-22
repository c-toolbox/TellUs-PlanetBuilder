import type { MIDIPatchFull } from "spessasynth_core";
import musescoreUrl from "@/assets/audio/soundfonts/MuseScore.sf3?url";
import gmUrl from "@/assets/audio/soundfonts/gm.sf2?url";
import FluidR3MonoUrl from "@/assets/audio/soundfonts/FluidR3Mono_GM.sf3?url";

export type InstrumentDefinition = Pick<MIDIPatchFull, "name" | "program"> &
	Partial<Omit<MIDIPatchFull, "name" | "program">>;

export interface SoundFontConfig {
	name: string;
	url: string;
}

export const SOUND_FONTS: readonly SoundFontConfig[] = [
	{ name: "MuseScore", url: musescoreUrl },
	{ name: "Microsoft", url: gmUrl },
	{ name: "FluidR3Mono_GM", url: FluidR3MonoUrl },
];

export const AUDIO_SETTINGS = {
	midiChannel: 0,
	velocity: 100,
	releaseTime: 90,
};
