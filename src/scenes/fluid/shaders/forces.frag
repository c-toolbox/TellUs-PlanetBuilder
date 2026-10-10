uniform sampler2D velocity;
uniform sampler2D derivatives;
uniform float resolution;
uniform float cellSize;
uniform float dt;
uniform float time;
uniform float ambient;
uniform float swirl;
uniform float touchRadius;
uniform float touchForce;
uniform int touchCount;
uniform vec4 touchDirections[MAX_TOUCHES];
uniform vec3 touchImpulses[MAX_TOUCHES];
varying vec2 vUv;

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	vec3 v = sampleVelocity(velocity, n, resolution);
	vec3 x, y;
	tangentFrame(n, x, y);
	float xp = abs(sampleSphere(derivatives, sphereExp(n, x * cellSize), resolution).g);
	float xm = abs(sampleSphere(derivatives, sphereExp(n, -x * cellSize), resolution).g);
	float yp = abs(sampleSphere(derivatives, sphereExp(n, y * cellSize), resolution).g);
	float ym = abs(sampleSphere(derivatives, sphereExp(n, -y * cellSize), resolution).g);
	vec3 curlGradient = (x * (xp - xm) + y * (yp - ym)) / (2.0 * cellSize);
	float curl = sampleSphere(derivatives, n, resolution).g;
	vec3 confinement = cross(curlGradient / max(length(curlGradient), 1e-5), n) * curl;
	v += dt * (ambient * ambientFlow(n, time) + swirl * cellSize * confinement);
	float radiusSquared = touchRadius * touchRadius;
	for (int i = 0; i < MAX_TOUCHES; i++) {
		if (i >= touchCount) break;
		vec3 center = touchDirections[i].xyz;
		// Chord distance approximates geodesic distance for the small brush.
		float distanceSquared = 2.0 * (1.0 - clamp(dot(n, center), -1.0, 1.0));
		float weight = exp(-distanceSquared / (0.5 * radiusSquared));
		if (weight > 0.001) {
			v += touchForce * weight * transport(touchImpulses[i], center, n);
		}
	}
	gl_FragColor = vec4(limitVelocity(v, n), 0.0);
}
