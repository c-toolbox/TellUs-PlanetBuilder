uniform sampler2D dye;
uniform float resolution;
varying vec3 vDirection;

void main() {
	vec3 color = sampleSphere(dye, normalize(vDirection), resolution).rgb;
	color = vec3(0.004, 0.007, 0.016) + 1.0 - exp(-1.6 * color);
	gl_FragColor = vec4(color, 1.0);
	#include <colorspace_fragment>
}
