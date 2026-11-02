uniform sampler2D stroke;
varying vec2 vUv;

void main() {
	// Preserve the resolved, premultiplied edge coverage for source-over.
	gl_FragColor = texture2D(stroke, vUv);
}
