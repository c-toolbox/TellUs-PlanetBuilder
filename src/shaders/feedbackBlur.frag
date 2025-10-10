precision highp float;
uniform sampler2D textureNew;
uniform sampler2D textureOld;
uniform float blur;
varying vec2 vUv;

void main() {
	vec4 oldColor =
		0.25 * texture2D(textureOld, vUv + vec2( blur,  blur)) +
		0.25 * texture2D(textureOld, vUv + vec2(-blur,  blur)) +
		0.25 * texture2D(textureOld, vUv + vec2( blur, -blur)) +
		0.25 * texture2D(textureOld, vUv + vec2(-blur, -blur));
	vec4 newColor = texture2D(textureNew, vUv);

	vec4 composed = 0.998 * max(oldColor, newColor);
	gl_FragColor = composed;
}
