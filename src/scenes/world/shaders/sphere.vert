// Fragment direction is the object-space position of the shell around the viewer.
varying vec3 vDirection;

void main() {
	vDirection = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
