import { EventEmitter } from "events";
import type { MIDIPatchFull } from "spessasynth_core";
import { WorkletSynthesizer } from "spessasynth_lib";
import workletUrl from "spessasynth_lib/dist/spessasynth_processor.min.js?url";
import type { UiElement } from "@/network/uiProtocol";
import { AUDIO_SETTINGS, SOUND_FONTS, SoundFontConfig } from "./soundFonts";

interface SoundFontPlayerEvents {
	change: [];
	loadError: [error: unknown];
}

type InstrumentSelection = Pick<MIDIPatchFull, "program"> &
	Partial<Pick<MIDIPatchFull, "bankMSB" | "bankLSB" | "isGMGSDrum">>;

function instrumentLabel(instrument: MIDIPatchFull) {
	const { name, program, bankMSB, bankLSB, isGMGSDrum } = instrument;
	return `${program}: ${name} (${isGMGSDrum ? "drums" : `bank ${bankMSB}:${bankLSB}`})`;
}

/** A MIDI voice independent of the model or input device producing its notes. */
export class SoundFontPlayer extends EventEmitter<SoundFontPlayerEvents> {
	private readonly settings: typeof AUDIO_SETTINGS;
	private soundFont: SoundFontConfig;
	private loadedSoundFont?: SoundFontConfig;
	private instruments: MIDIPatchFull[] = [];
	private instrument?: MIDIPatchFull;
	private context?: AudioContext;
	private synth?: WorkletSynthesizer;
	private initialization?: Promise<void>;
	private fontChange = Promise.resolve();
	private selectionVersion = 0;
	private loading = false;
	private loadError?: string;
	private failedSoundFont?: SoundFontConfig;
	private active = false;
	private heldNotes = new Map<number, number>();
	private playingNotes = new Set<number>();

	constructor(
		private readonly soundFonts: readonly SoundFontConfig[] = SOUND_FONTS,
		settings: Partial<typeof AUDIO_SETTINGS> = {},
	) {
		super();
		if (!soundFonts.length)
			throw new Error("At least one sound font is required");
		this.soundFont = soundFonts[0];
		this.settings = { ...AUDIO_SETTINGS, ...settings };
	}

	get isActive() {
		return this.active;
	}

	activate() {
		this.active = true;
		// TUIO events cannot unlock browser audio; a local gesture can.
		window.addEventListener("pointerdown", this.resumeAudio, true);
		window.addEventListener("keydown", this.resumeAudio, true);
		void this.selectSoundFont(this.soundFont.name);
		this.resumeAudio();
		this.playHeldNotes();
	}

	deactivate() {
		this.active = false;
		window.removeEventListener("pointerdown", this.resumeAudio, true);
		window.removeEventListener("keydown", this.resumeAudio, true);
		this.heldNotes.clear();
		this.stopPlayingNotes();
		this.suspendAudio();
	}

	selectSoundFont(name: string): Promise<void> {
		const font = this.soundFonts.find((entry) => entry.name === name);
		if (!font) return Promise.resolve();
		if (font === this.soundFont && this.loading) return this.fontChange;
		if (font === this.loadedSoundFont && !this.loading && !this.loadError) {
			return Promise.resolve();
		}

		const version = ++this.selectionVersion;
		this.soundFont = font;
		this.loading = true;
		this.loadError = undefined;
		this.failedSoundFont = undefined;
		this.stopPlayingNotes();
		this.emit("change");

		// The worklet has one sound-bank response slot. Serialize changes and skip
		// superseded requests so rapid dropdown changes cannot mix fonts or presets.
		this.fontChange = this.fontChange.then(async () => {
			if (version !== this.selectionVersion) return;
			try {
				await this.initializeAudio();
				const response = await fetch(font.url);
				if (!response.ok) {
					throw new Error(
						`Failed to load ${font.name}: HTTP ${response.status}`,
					);
				}
				const buffer = await response.arrayBuffer();
				if (version !== this.selectionVersion) return;
				const synth = this.synth!;
				// Replacing one ID prevents presets from previous fonts leaking through.
				await this.withSoundBankErrors(synth, () =>
					synth.soundBankManager.addSoundBank(buffer, "instrument"),
				);
				this.loadedSoundFont = font;
				this.instruments = synth.presetList
					.map((preset): MIDIPatchFull => preset)
					.sort(
						(a, b) =>
							Number(a.isDrum) - Number(b.isDrum) ||
							a.bankMSB - b.bankMSB ||
							a.bankLSB - b.bankLSB ||
							a.program - b.program,
					);
				this.instrument = this.instruments[0];
				if (!this.instrument)
					throw new Error(`${font.name} has no instruments`);
				this.applyInstrument();
			} catch (error) {
				if (version !== this.selectionVersion) return;
				this.soundFont = this.loadedSoundFont ?? font;
				this.failedSoundFont = font;
				this.loadError = error instanceof Error ? error.message : String(error);
				this.emit("loadError", error);
			} finally {
				if (version === this.selectionVersion) {
					this.loading = false;
					this.playHeldNotes();
					this.emit("change");
				}
			}
		});
		return this.fontChange;
	}

	selectInstrument(selection: string | InstrumentSelection) {
		if (this.loading) return;
		const instrument = this.instruments.find((entry) =>
			typeof selection === "string"
				? instrumentLabel(entry) === selection
				: entry.program === selection.program &&
					entry.bankMSB === (selection.bankMSB ?? 0) &&
					entry.bankLSB === (selection.bankLSB ?? 0) &&
					entry.isGMGSDrum === (selection.isGMGSDrum ?? false),
		);
		if (!instrument || instrument === this.instrument) return;
		this.stopPlayingNotes();
		this.instrument = instrument;
		this.applyInstrument();
		this.playHeldNotes();
		this.emit("change");
	}

	retry() {
		return this.selectSoundFont((this.failedSoundFont ?? this.soundFont).name);
	}

	noteOn = (note: number, velocity = this.settings.velocity) => {
		if (!this.active) return;
		if (velocity === 0) return this.noteOff(note);
		this.heldNotes.set(note, velocity);
		this.playHeldNotes();
	};

	noteOff = (note: number) => {
		this.heldNotes.delete(note);
		if (this.playingNotes.delete(note)) {
			this.synth?.noteOff(this.settings.midiChannel, note);
		}
	};

	get uiElements(): UiElement[] {
		const elements: UiElement[] = [
			{
				type: "dropdown",
				id: "soundFont",
				hint_title: "Sound font",
				value: this.soundFont.name,
				options: this.soundFonts.map((font) => font.name),
			},
		];
		if (this.instrument) {
			elements.push({
				type: "dropdown",
				id: "instrument",
				hint_title: "Instrument",
				// hint_text: "Presets from the selected font, with zero-based MIDI program and bank numbers.",
				hint_text: this.instruments.length.toString(),
				value: instrumentLabel(this.instrument),
				options: this.instruments.map(instrumentLabel),
			});
		}
		return elements;
	}

	private initializeAudio() {
		return (this.initialization ??= this.createSynthesizer().catch((error) => {
			this.initialization = undefined;
			throw error;
		}));
	}

	private async createSynthesizer() {
		const context = new AudioContext({ latencyHint: "interactive" });
		this.context = context;
		context.addEventListener("statechange", () => this.playHeldNotes());
		let synth: WorkletSynthesizer | undefined;
		try {
			await context.audioWorklet.addModule(workletUrl);
			synth = new WorkletSynthesizer(context);
			synth.connect(context.destination);
			await this.withSoundBankErrors(synth, () => synth!.isReady);
			this.synth = synth;
			synth.controllerChange(
				this.settings.midiChannel,
				72,
				this.settings.releaseTime,
			);
			if (!this.active) this.suspendAudio();
		} catch (error) {
			synth?.destroy();
			this.context = undefined;
			await context.close();
			throw error;
		}
	}

	private async withSoundBankErrors<T>(
		synth: WorkletSynthesizer,
		operation: () => Promise<T>,
	) {
		// SpessaSynth reports invalid fonts as events rather than rejecting addSoundBank.
		const failure = new Promise<never>((_, reject) =>
			synth.eventHandler.addEvent("soundBankError", "font-loading", reject),
		);
		try {
			return await Promise.race([operation(), failure]);
		} finally {
			synth.eventHandler.removeEvent("soundBankError", "font-loading");
		}
	}

	private applyInstrument() {
		if (!this.synth || !this.instrument) return;
		const { midiChannel } = this.settings;
		const { program, bankMSB, bankLSB, isGMGSDrum } = this.instrument;
		this.synth.midiChannels[midiChannel].setDrums(isGMGSDrum);
		this.synth.controllerChange(midiChannel, 0, bankMSB);
		this.synth.controllerChange(midiChannel, 32, bankLSB);
		this.synth.programChange(midiChannel, program);
	}

	private resumeAudio = () => {
		if (this.active && this.context?.state === "suspended") {
			void this.context
				.resume()
				.catch((error) => console.error("Failed to resume music audio", error));
		}
	};

	private suspendAudio() {
		if (this.context?.state !== "running") return;
		void this.context
			.suspend()
			.then(() => {
				// The scene can be re-entered before suspension finishes.
				if (this.active) this.resumeAudio();
			})
			.catch((error) => console.error("Failed to suspend music audio", error));
	}

	private stopPlayingNotes() {
		this.playingNotes.clear();
		this.synth?.stopAll(true);
	}

	private playHeldNotes() {
		if (
			!this.active ||
			this.loading ||
			!this.instrument ||
			!this.synth ||
			this.context?.state !== "running"
		)
			return;
		for (const [note, velocity] of this.heldNotes) {
			if (this.playingNotes.has(note)) continue;
			this.synth.noteOn(this.settings.midiChannel, note, velocity);
			this.playingNotes.add(note);
		}
	}
}
