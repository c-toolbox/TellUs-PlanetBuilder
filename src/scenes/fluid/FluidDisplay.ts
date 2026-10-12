/** Display styles shared with display.frag through shader defines. */
export const FLUID_DISPLAY_STYLES = {
	DISPLAY_DYE: 0,
	DISPLAY_VECTOR: 1,
	DISPLAY_SCALAR: 2,
	DISPLAY_DYE_FLOW: 3,
	DISPLAY_SCALAR_COMPARISON: 4,
} as const;

export type FluidDisplayField = "dye" | "advectedDye" | "advectedVelocity" |
	"forcedVelocity" | "velocity" | "derivatives" | "projectedDerivatives" | "pressure";

export interface FluidDisplayOption {
	field: FluidDisplayField;
	reference?: FluidDisplayField;
	style: typeof FLUID_DISPLAY_STYLES[keyof typeof FLUID_DISPLAY_STYLES];
	scale: number;
	channel?: 0 | 1;
	hint: string;
}

const vectorKey = " Colour encodes the signed X/Y/Z components as RGB; brightness shows magnitude. Arrows show the tangent direction.";
const scalarKey = " Blue is negative, orange is positive, dark is near zero.";
const styles = FLUID_DISPLAY_STYLES;

/** Ordered by simulation stage. References compare fields from the same completed step. */
export const FLUID_OUTPUTS = {
	"Dye (final)": {
		field: "dye", style: styles.DISPLAY_DYE, scale: 1,
		hint: "The usual ink display, after transport, fading and colour injection.",
	},
	"Velocity after advection": {
		field: "advectedVelocity", style: styles.DISPLAY_VECTOR, scale: 3,
		hint: "Momentum carried along the sphere and damped, before forces are added." + vectorKey,
	},
	"Velocity after forces": {
		field: "forcedVelocity", style: styles.DISPLAY_VECTOR, scale: 3,
		hint: "Advected velocity plus touch impulses, ambient flow and vorticity confinement." + vectorKey,
	},
	"Forces added": {
		field: "forcedVelocity", reference: "advectedVelocity", style: styles.DISPLAY_VECTOR, scale: 30,
		hint: "The velocity change from the forces pass, amplified for visibility. Includes the speed limit." + vectorKey,
	},
	"Vorticity": {
		field: "derivatives", style: styles.DISPLAY_SCALAR, scale: 0.15, channel: 1,
		hint: "Signed surface curl after forces, before pressure projection: local spinning motion." + scalarKey,
	},
	"Divergence before projection": {
		field: "derivatives", style: styles.DISPLAY_SCALAR, scale: 0.5,
		hint: "Local expansion (+) and compression (-) after forces. Uses the same colour scale as divergence after projection." + scalarKey,
	},
	"Pressure": {
		field: "pressure", style: styles.DISPLAY_SCALAR, scale: 400,
		hint: "Pressure impulse after the Jacobi solve. Its surface gradient corrects velocity; this is not physical pressure in pascals." + scalarKey,
	},
	"Pressure correction": {
		field: "velocity", reference: "forcedVelocity", style: styles.DISPLAY_VECTOR, scale: 30,
		hint: "The velocity change from subtracting the pressure gradient, amplified for visibility. Includes the speed limit." + vectorKey,
	},
	"Velocity after projection": {
		field: "velocity", style: styles.DISPLAY_VECTOR, scale: 3,
		hint: "The corrected tangent velocity used to transport the ink." + vectorKey,
	},
	"Divergence after projection": {
		field: "projectedDerivatives", style: styles.DISPLAY_SCALAR, scale: 0.5,
		hint: "Remaining expansion and compression after pressure correction. Uses the same colour scale as divergence before projection." + scalarKey,
	},
	"Divergence comparison": {
		field: "derivatives", reference: "projectedDerivatives", style: styles.DISPLAY_SCALAR_COMPARISON, scale: 0.5,
		hint: "Before projection on the -X hemisphere; after on +X, separated by a white meridian. Both use the same colour scale. Pause and switch between the full views to compare the same locations." + scalarKey,
	},
	"Dye after advection": {
		field: "advectedDye", style: styles.DISPLAY_DYE, scale: 1,
		hint: "Ink transported by the corrected velocity and faded, before new colour is injected.",
	},
	"Dye added": {
		field: "dye", reference: "advectedDye", style: styles.DISPLAY_DYE, scale: 1,
		hint: "Only the colour added by touches and the ambient ink supply during the latest step.",
	},
	"Dye + flow arrows": {
		field: "dye", style: styles.DISPLAY_DYE_FLOW, scale: 3,
		hint: "Final ink with arrows showing the corrected velocity that transports it. Pause to inspect the latest step.",
	},
} as const satisfies Record<string, FluidDisplayOption>;

export type FluidOutput = keyof typeof FLUID_OUTPUTS;
export const FLUID_OUTPUT_OPTIONS = Object.keys(FLUID_OUTPUTS) as FluidOutput[];
export const DEFAULT_FLUID_OUTPUT: FluidOutput = "Dye (final)";
