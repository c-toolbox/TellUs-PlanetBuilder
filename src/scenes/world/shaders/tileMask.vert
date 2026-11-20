attribute vec4 weightsA;
attribute vec4 weightsB;
uniform float weightSet;
varying vec4 vWeights;

void main() {
	vWeights = weightSet < 0.5 ? weightsA : weightsB;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
