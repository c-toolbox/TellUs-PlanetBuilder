import WorldScene from "./world/WorldScene";
import PaintScene from "./paint/PaintScene";
import BoidsScene from "./boids/BoidsScene";
import CountryScene from "./country/CountryScene";
import VinjettScene from "./vinjett/VinjettScene";
import MusicScene from "./music/MusicScene";
import InteractionScene from "./interaction/InteractionScene";
import MeasuringScene from "./measuring/MeasuringScene";
import FluidScene from "./fluid/FluidScene";
import ForceGraphScene from "./graph/ForceGraphScene";
import ReactionDiffusionScene from "./reaction/ReactionDiffusionScene";

// IDs are stable; titles are the labels in the local menu.
export const scenes = [
	{ id: "Planet", title: "Planet", create: () => new WorldScene() },
	{ id: "Paint", title: "Paint", create: () => new PaintScene() },
	{ id: "Fish", title: "Fish", create: () => new BoidsScene() },
	{ id: "Country", title: "Country", create: () => new CountryScene() },
	{ id: "Wildlife", title: "Wildlife", create: () => new VinjettScene() },
	{ id: "Music", title: "Music", create: () => new MusicScene() },
	{ id: "Interaction", title: "Interaction", create: () => new InteractionScene() },
	{ id: "Measuring", title: "Measuring", create: () => new MeasuringScene() },
	{ id: "Fluid", title: "Fluid", create: () => new FluidScene() },
	{ id: "Force graph", title: "Force graph", create: () => new ForceGraphScene() },
	{ id: "ReactionDiffusion", title: "Reaction diffusion", create: () => new ReactionDiffusionScene() },
] as const;

export type SceneId = (typeof scenes)[number]["id"];

export const SceneId = Object.fromEntries(
	scenes.map(({ id }) => [id, id]),
) as { readonly [Id in SceneId]: Id };

export function isSceneId(id: string): id is SceneId {
	return scenes.some((scene) => scene.id === id);
}
