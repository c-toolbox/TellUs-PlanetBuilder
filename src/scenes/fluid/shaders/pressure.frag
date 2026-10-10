uniform sampler2D pressure;
uniform sampler2D derivatives;
uniform float resolution;
uniform float cellSize;
varying vec2 vUv;

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	vec3 x, y;
	tangentFrame(n, x, y);
	float sum = sampleSphere(pressure, sphereExp(n, x * cellSize), resolution).r
		+ sampleSphere(pressure, sphereExp(n, -x * cellSize), resolution).r
		+ sampleSphere(pressure, sphereExp(n, y * cellSize), resolution).r
		+ sampleSphere(pressure, sphereExp(n, -y * cellSize), resolution).r;
	float divergence = sampleSphere(derivatives, n, resolution).r;
	float estimate = (sum - cellSize * cellSize * divergence) * 0.25;
	// Damped Jacobi tolerates the interpolation of the geodesic stencil.
	float previous = sampleSphere(pressure, n, resolution).r;
	gl_FragColor = vec4(mix(previous, estimate, 0.8), 0.0, 0.0, 0.0);
}
