#ifdef GL_ES
precision highp float;
#endif

#define PI  3.1415926535897931
#define TAU 6.2831853071795862

varying vec2 vUv;
uniform sampler2D texture1;

// phi1 = latitude, lambda0 = longitude of the center of the map
uniform float phi1;
uniform float lambda0;

void main(void) {
    float x = TAU*(vUv.s - 0.5);
    float y = TAU*(vUv.t - 0.5);

    float c = sqrt(x*x + y*y);
    float phi = asin( cos(c)*sin(phi1) + y*sin(c)*cos(phi1)/c );
    float lambda = lambda0 +
        atan( x*sin(c), (c*cos(phi1)*cos(c) - y*sin(phi1)*sin(c)));

    float s = (lambda/TAU) + 0.5; // -pi,pi -> 0,1
    float t = (phi/PI) + 0.5;     // -pi/2,pi/2 -> 0,1

    gl_FragColor = texture2D(texture1, vec2(s,t)) +
        vec4(smoothstep(PI-.05,PI,c));
}
