uniform sampler2D tDiffuse;
varying vec2 vUv;
uniform float phi1;
uniform float lambda0;

#define PI 3.1415926535897932384626433832795
#define TAU 6.283185307179586

void main() {
    // Convert UV to spherical coordinates
    vec2 uv = vUv * 2.0 - 1.0;
    float r = length(uv);
    float theta = atan(uv.y, uv.x);
    
    // Apply azimuthal equidistant projection
    float phi = asin(cos(r) * sin(phi1) + (uv.y * sin(r) * cos(phi1)) / r);
    float lambda = lambda0 + atan(
        uv.x * sin(r),
        (r * cos(phi1) * cos(r) - uv.y * sin(phi1) * sin(r))
    );
    
    // Convert back to UV coordinates
    vec2 projUv = vec2(
        mod(lambda / TAU + 0.5, 1.0),
        phi / PI + 0.5
    );
    
    gl_FragColor = texture2D(tDiffuse, projUv);
}