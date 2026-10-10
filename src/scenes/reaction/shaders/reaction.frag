uniform sampler2D state;
uniform float resolution;
uniform float cellSize;
uniform float dt;
uniform float feed;
uniform float kill;
uniform vec2 diffusion;
uniform float touchRadius;
uniform float touchStrength;
uniform bool erase;
uniform int touchCount;
uniform vec4 touchStarts[MAX_TOUCHES];
uniform vec3 touchEnds[MAX_TOUCHES];
varying vec2 vUv;

// Distance to the minor great-circle segment. Endpoints are at most 0.6 rad apart.
float strokeDistance(vec3 n, vec3 a, vec3 b) {
	float cosine = clamp(dot(a, b), -1.0, 1.0);
	vec3 forward = b - cosine * a;
	float sine = length(forward);
	float closest = max(dot(n, a), dot(n, b));
	if (sine > 1e-5) {
		forward /= sine;
		float along = atan(dot(n, forward), dot(n, a));
		if (along > 0.0 && along < atan(sine, cosine)) {
			closest = max(closest, length(vec2(dot(n, a), dot(n, forward))));
		}
	}
	return acos(clamp(closest, -1.0, 1.0));
}

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	vec2 uv = sampleSphere(state, n, resolution).rg;
	vec3 x, y;
	tangentFrame(n, x, y);
	// Eight equally spaced directions on a geodesic circle of radius h.
	// sum(neighbours - centre) / (2 h²) approximates the surface Laplacian.
	// UI diffusion coefficients absorb h²; this laplacian therefore omits /h².
	vec3 d1 = (x + y) * 0.7071067811865476;
	vec3 d2 = (x - y) * 0.7071067811865476;
	vec2 sum = sampleSphere(state, sphereExp(n, x * cellSize), resolution).rg
		+ sampleSphere(state, sphereExp(n, -x * cellSize), resolution).rg
		+ sampleSphere(state, sphereExp(n, y * cellSize), resolution).rg
		+ sampleSphere(state, sphereExp(n, -y * cellSize), resolution).rg
		+ sampleSphere(state, sphereExp(n, d1 * cellSize), resolution).rg
		+ sampleSphere(state, sphereExp(n, -d1 * cellSize), resolution).rg
		+ sampleSphere(state, sphereExp(n, d2 * cellSize), resolution).rg
		+ sampleSphere(state, sphereExp(n, -d2 * cellSize), resolution).rg;
	vec2 laplacian = 0.5 * sum - 4.0 * uv;
	float reaction = uv.x * uv.y * uv.y;
	vec2 rate = diffusion * laplacian + vec2(-reaction + feed * (1.0 - uv.x), reaction - (feed + kill) * uv.y);
	uv = clamp(uv + dt * rate, 0.0, 1.0);
	float exposure = 0.0;
	for (int i = 0; i < MAX_TOUCHES; i++) {
		if (i >= touchCount) break;
		float distance = strokeDistance(n, touchStarts[i].xyz, touchEnds[i]);
		float weight = 1.0 - smoothstep(touchRadius * 0.25, touchRadius, distance);
		exposure += weight * touchStarts[i].w;
	}
	vec2 brush = erase ? vec2(1.0, 0.0) : vec2(0.35, 0.5);
	uv = mix(uv, brush, 1.0 - exp(-touchStrength * exposure));
	gl_FragColor = vec4(uv, 0.0, 1.0);
}
