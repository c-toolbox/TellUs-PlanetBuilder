uniform sampler2D state;
uniform float resolution;
uniform float hue;
uniform float contrast;
varying vec3 vDirection;

vec3 palette(float phase) {
	return 0.5 + 0.5 * cos(2.0 * PI * (phase + vec3(0.0, 0.333333, 0.666667)));
}

void main() {
	vec2 chemicals = sampleSphere(state, normalize(vDirection), resolution).rg;
	float density = clamp(chemicals.y * 2.7, 0.0, 1.0);
	float pigment = pow(smoothstep(0.025, 0.8, density), contrast);
	vec3 dark = vec3(0.003, 0.006, 0.015);
	vec3 color = mix(dark, palette(hue + 0.32 * density), pigment);
	// A bright reaction front reveals the outlines of cells and branching bands.
	float rim = exp(-pow((density - 0.28) / 0.09, 2.0));
	color += rim * 0.22 * palette(hue + 0.16);
	gl_FragColor = vec4(color, 1.0);
	#include <colorspace_fragment>
}
