precision highp float;
uniform sampler2D projectionMap;
uniform float globeFovDegrees;
varying vec3 vDirection;

void main() {
	vec3 dir = normalize(vDirection);
	float pitch = acos(clamp(dir.y, -1.0, 1.0));
	float maxPitch = 3.141592653589793 * (globeFovDegrees / 360.0);
	if (pitch > maxPitch) {
		gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}

	// Inverse of azimuthal.frag, with the globe's +Y pole matching cube +Z.
	vec2 radial = vec2(-dir.x, dir.z);
	vec2 uv = 0.5 + 0.5 * (pitch / maxPitch)
		* radial / max(length(radial), 0.000001);
	gl_FragColor = texture2D(projectionMap, uv);
}
