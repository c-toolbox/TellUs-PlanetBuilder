precision highp float;
uniform samplerCube envMap;
varying vec3 vDirection;

void main() {
	// The globe's +Y pole matches the camera-local +Z axis.
	vec3 dir = vec3(vDirection.x, vDirection.z, vDirection.y);
	vec4 color = textureCube(envMap, dir);

	// Match the display gamma applied by azimuthal.frag.
	color.rgb = pow(color.rgb, vec3(1.0 / 1.9));
	gl_FragColor = color;
}
