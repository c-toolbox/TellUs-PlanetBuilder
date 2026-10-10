uniform float resolution;
uniform float seedMode;
varying vec2 vUv;

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	if (seedMode < 0.5) gl_FragColor = vec4(0.0);
	else if (seedMode < 1.5) gl_FragColor = vec4(ambientFlow(n, 0.0), 0.0);
	else gl_FragColor = vec4(seedDye(n), 1.0);
}
