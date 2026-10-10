uniform sampler2D velocity;
uniform float resolution;
uniform float cellSize;
varying vec2 vUv;

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	vec3 x, y;
	tangentFrame(n, x, y);
	vec3 xp = sphereExp(n, x * cellSize);
	vec3 xm = sphereExp(n, -x * cellSize);
	vec3 yp = sphereExp(n, y * cellSize);
	vec3 ym = sphereExp(n, -y * cellSize);
	vec3 dx = (transport(sampleVelocity(velocity, xp, resolution), xp, n)
		- transport(sampleVelocity(velocity, xm, resolution), xm, n)) / (2.0 * cellSize);
	vec3 dy = (transport(sampleVelocity(velocity, yp, resolution), yp, n)
		- transport(sampleVelocity(velocity, ym, resolution), ym, n)) / (2.0 * cellSize);
	float divergence = dot(dx, x) + dot(dy, y);
	float curl = dot(dx, y) - dot(dy, x);
	gl_FragColor = vec4(divergence, curl, 0.0, 0.0);
}
