precision mediump float;

varying vec2 vUv;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uCurvature;     // barrel distortion amount
uniform float uScanline;      // scanline strength
uniform float uDispersion;    // same-hue smear along the scan direction, 0-1
uniform float uNoise;         // additive grain
uniform float uTear;          // horizontal desync, event driven
uniform float uTearY;         // vertical position of the tear band
uniform float uBand;          // rolling brightness band strength
uniform float uVignette;      // corner darkening
uniform float uBrightness;    // master output level, used for power on/off
uniform float uCollapse;      // 0 = normal, 1 = collapsed to a line

// The single hue this piece is allowed to use, at three points on its ramp.
// There is no second hue anywhere in the shader: a red/green/blue split would
// introduce colours the rest of the site does not contain, and one frame of
// green is enough to break a monochrome image.
const vec3 PINK_DELAYED = vec3(0.196, 0.063, 0.086);  // #321016
const vec3 PINK_HIGH    = vec3(1.000, 0.753, 0.788);  // #ffc0c9

/** Maximum smear distance in uv units at full dispersion. */
const float SMEAR = 0.0022;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
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

  vec3 colour = texture2D(uTexture, uv).rgb;

  // Same-hue dispersion.
  //
  // A real tube smears the beam along the scan direction; the phosphor is
  // still one colour. So instead of separating channels, sample either side,
  // take the *luminance* difference, and add it back tinted with the dark and
  // bright ends of the same ramp: the trailing edge lags into dark pink, the
  // leading edge overshoots into highlight pink. The hue never moves.
  if (uDispersion > 0.001) {
    float offset = uDispersion * SMEAR;
    float here = luma(colour);
    float delayed = luma(texture2D(uTexture, vec2(uv.x + offset, uv.y)).rgb);
    float leading = luma(texture2D(uTexture, vec2(uv.x - offset, uv.y)).rgb);

    colour += PINK_DELAYED * max(delayed - here, 0.0) * 1.6;
    colour += PINK_HIGH * max(leading - here, 0.0) * 0.55;
  }

  // Scanlines.
  float scan = sin(uv.y * 620.0) * 0.5 + 0.5;
  colour *= 1.0 - uScanline * scan;

  // Slow rolling brightness band.
  float band = sin((uv.y + uTime * 0.08) * 6.2831);
  colour *= 1.0 + uBand * band * 0.5;

  // Grain, tinted to the same hue so noise cannot desaturate the picture.
  float grain = hash(uv * 512.0 + uTime * 60.0) - 0.5;
  colour += grain * uNoise * vec3(1.0, 0.56, 0.62);

  // Vignette.
  vec2 centered = uv * 2.0 - 1.0;
  float vig = 1.0 - dot(centered, centered) * uVignette * 0.36;
  colour *= clamp(vig, 0.0, 1.0);

  colour *= uBrightness;

  gl_FragColor = vec4(max(colour, vec3(0.0)), 1.0);
}
