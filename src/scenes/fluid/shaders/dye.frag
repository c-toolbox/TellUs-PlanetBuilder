uniform sampler2D dye;
uniform float resolution;
uniform float dt;
uniform float time;
uniform float ambient;
uniform float touchRadius;
uniform int touchCount;
uniform vec4 touchDirections[MAX_TOUCHES];
uniform vec3 touchColors[MAX_TOUCHES];
varying vec2 vUv;

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	vec3 color = sampleSphere(dye, n, resolution).rgb;
	// A slow colour supply keeps the idle flow visible as old dye fades.
	color += ambient * dt * 0.035 * seedDye(n);
	for (int i = 0; i < MAX_TOUCHES; i++) {
		if (i >= touchCount) break;
		float distanceSquared = 2.0 * (1.0 - clamp(dot(n, touchDirections[i].xyz), -1.0, 1.0));
		float weight = exp(-distanceSquared / (0.5 * touchRadius * touchRadius));
		color += touchColors[i] * weight * touchDirections[i].w * 7.0;
	}
	gl_FragColor = vec4(min(color, vec3(5.0)), 1.0);
}
