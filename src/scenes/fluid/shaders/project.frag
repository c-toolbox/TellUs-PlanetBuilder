uniform sampler2D velocity;
uniform sampler2D pressure;
uniform float resolution;
uniform float cellSize;
varying vec2 vUv;

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	vec3 x, y;
	tangentFrame(n, x, y);
	float xp = sampleSphere(pressure, sphereExp(n, x * cellSize), resolution).r;
	float xm = sampleSphere(pressure, sphereExp(n, -x * cellSize), resolution).r;
	float yp = sampleSphere(pressure, sphereExp(n, y * cellSize), resolution).r;
	float ym = sampleSphere(pressure, sphereExp(n, -y * cellSize), resolution).r;
	vec3 gradient = (x * (xp - xm) + y * (yp - ym)) / (2.0 * cellSize);
	vec3 v = sampleVelocity(velocity, n, resolution) - gradient;
	gl_FragColor = vec4(limitVelocity(v, n), 0.0);
}
