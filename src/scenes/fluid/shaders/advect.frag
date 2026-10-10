uniform sampler2D velocity;
uniform sampler2D source;
uniform float resolution;
uniform float velocityResolution;
uniform float dt;
uniform float dissipation;
uniform bool isVelocity;
varying vec2 vUv;

void main() {
	vec3 n = atlasDirection(vUv, resolution);
	vec3 departure = backtrace(velocity, n, velocityResolution, dt);
	vec4 value = sampleSphere(source, departure, resolution);
	if (isVelocity) {
		value = vec4(limitVelocity(transport(value.xyz, departure, n), n), 0.0);
	}
	gl_FragColor = value * exp(-dissipation * dt);
}
