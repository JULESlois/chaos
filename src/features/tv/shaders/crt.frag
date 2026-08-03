precision mediump float;

varying vec2 vUv;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uCurvature;     // barrel distortion amount
uniform float uScanline;      // scanline strength
uniform float uChroma;        // rgb separation, in uv units
uniform float uNoise;         // additive grain
uniform float uTear;          // horizontal desync, event driven
uniform float uTearY;         // vertical position of the tear band
uniform float uBand;          // rolling brightness band strength
uniform float uVignette;      // corner darkening
uniform float uBrightness;    // master output level, used for power on/off
uniform float uCollapse;      // 0 = normal, 1 = collapsed to a line

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Barrel distortion. Applied first so every later sample inherits it.
vec2 curveUv(vec2 uv, float amount) {
  vec2 centered = uv * 2.0 - 1.0;
  vec2 offset = centered.yx * centered.yx * amount;
  centered += centered * offset;
  return centered * 0.5 + 0.5;
}

void main() {
  vec2 uv = curveUv(vUv, uCurvature);

  // Power-off collapse: squeeze the image toward the middle scanline.
  if (uCollapse > 0.001) {
    float halfHeight = max(0.002, (1.0 - uCollapse) * 0.5);
    float dist = uv.y - 0.5;
    if (abs(dist) > halfHeight) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    uv.y = 0.5 + dist / max(halfHeight * 2.0, 0.0001);
  }

  // Horizontal desync: a band of the image slips sideways.
  float tearBand = smoothstep(0.06, 0.0, abs(uv.y - uTearY));
  uv.x += tearBand * uTear;

  // Outside the tube is always black — do this after the tear so the
  // displaced band clips correctly against the bezel.
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Chromatic separation — deliberately tiny.
  float r = texture2D(uTexture, vec2(uv.x + uChroma, uv.y)).r;
  float g = texture2D(uTexture, uv).g;
  float b = texture2D(uTexture, vec2(uv.x - uChroma, uv.y)).b;
  vec3 colour = vec3(r, g, b);

  // Scanlines.
  float scan = sin(uv.y * 620.0) * 0.5 + 0.5;
  colour *= 1.0 - uScanline * scan;

  // Slow rolling brightness band.
  float band = sin((uv.y + uTime * 0.08) * 6.2831);
  colour *= 1.0 + uBand * band * 0.5;

  // Grain.
  float grain = hash(uv * 512.0 + uTime * 60.0) - 0.5;
  colour += grain * uNoise;

  // Vignette.
  vec2 centered = uv * 2.0 - 1.0;
  float vig = 1.0 - dot(centered, centered) * uVignette * 0.36;
  colour *= clamp(vig, 0.0, 1.0);

  colour *= uBrightness;

  gl_FragColor = vec4(max(colour, vec3(0.0)), 1.0);
}
