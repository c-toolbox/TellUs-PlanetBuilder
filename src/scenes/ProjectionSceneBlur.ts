import * as THREE from "three";

const aepVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const aepFragmentShader = `
precision highp float;
uniform samplerCube envMap;
varying vec2 vUv;

void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float c = r * 3.141592653589793;
    float theta = atan(p.y, p.x);
    float sin_c = sin(c);
    float cos_c = cos(c);
    vec3 dir = vec3(
        -sin_c * cos(theta),
         sin_c * sin(theta),
         cos_c
    );

    gl_FragColor = textureCube(envMap, dir);
}
`;

const feedbackVertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const feedbackFragmentShader = `
precision highp float;
uniform sampler2D tNew;
uniform sampler2D tOld;
uniform float blur;
uniform float persistence;
varying vec2 vUv;

void main() {
    // Slight blur of the old frame
    vec4 oldColor =
        0.25 * texture2D(tOld, vUv + vec2( blur,  blur)) +
        0.25 * texture2D(tOld, vUv + vec2(-blur,  blur)) +
        0.25 * texture2D(tOld, vUv + vec2( blur, -blur)) +
        0.25 * texture2D(tOld, vUv + vec2(-blur, -blur));

    vec4 newColor = texture2D(tNew, vUv);

    // Composite new frame over the old, preserving hue
    // vec4 composed = mix(oldColor, newColor, newColor.a);
    vec4 composed = oldColor + newColor;
    // composed.rgb = 0.99 * min(newColor.rgb, oldColor.rgb + newColor.rgb);

    // Persistence fade
    composed.rgb = 0.995 * mix(oldColor.rgb, composed.rgb, 1.0 - persistence);

    gl_FragColor = composed;
}
`;

export class ProjectionScene extends THREE.Scene {
    public cubeCamera: THREE.CubeCamera;
    public screenCamera: THREE.OrthographicCamera;
    public projectionQuad: THREE.Mesh;
    public feedbackQuad: THREE.Mesh;
    public feedbackMaterial: THREE.ShaderMaterial;
    public aepTarget: THREE.WebGLRenderTarget;
    public feedbackA: THREE.WebGLRenderTarget;
    public feedbackB: THREE.WebGLRenderTarget;
    public useA: boolean = true;

    constructor(width: number, height: number) {
        super();

        // Cube render target + cube camera for AEP sampling
        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(1024, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter,
        });
        this.cubeCamera = new THREE.CubeCamera(0.01, 1000, cubeRenderTarget);

        // Orthographic screen camera
        this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Render target for AEP result
        this.aepTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
        });

        // Azimuthal Equidistant Projection material
        const aepMaterial = new THREE.ShaderMaterial({
            uniforms: { envMap: { value: cubeRenderTarget.texture } },
            vertexShader: aepVertexShader,
            fragmentShader: aepFragmentShader,
            depthTest: false,
            depthWrite: false,
        });
        this.projectionQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aepMaterial);
        this.add(this.projectionQuad);

        // Feedback render targets
        this.feedbackA = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
        });
        this.feedbackB = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
        });

        // Feedback material
        this.feedbackMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tNew: { value: this.aepTarget.texture },
                tOld: { value: this.feedbackA.texture },
                blur: { value: 0.0015 },
                persistence: { value: 0.96 },
            },
            vertexShader: feedbackVertexShader,
            fragmentShader: feedbackFragmentShader,
            depthTest: false,
            depthWrite: false,
            transparent: true,
        });

        this.feedbackQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.feedbackMaterial);
    }
}
