/**
 * GLSL programs. One fragment shader handles all three styles (uniform branch),
 * everything is derived from uniforms => identical composition at any resolution.
 * Coordinates are aspect-normalized; uPixelOffset makes tiled rendering seamless.
 */

export const VERT_SRC = /* glsl */ `#version 300 es
void main() {
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

out vec4 outColor;

uniform vec2 uResolution;   // full image size in px
uniform vec2 uPixelOffset;  // global px offset of current viewport (GL, bottom-left origin)
uniform int uStyle;         // 0 silk, 1 mesh, 2 aurora
uniform vec3 uBg;
uniform vec3 uColors[6];
uniform int uColorCount;
uniform float uColorShare;  // 0..1
uniform float uBlur;        // 0..1
uniform float uVignette;    // 0..1
uniform float uGrain;       // 0..1
uniform float uGrainSize;   // px
uniform float uPhase;       // loop phase, radians
uniform float uMotion;      // loop radius, 0 = static
uniform float uLayers;      // 3..8
uniform float uScale;
uniform float uWarp;
uniform float uStreaks;
uniform float uIntensity;
uniform float uRot;
uniform vec2 uShift;
uniform vec4 uBlobs[8];     // x, y, radius, phase

// ---------- hash / noise ----------

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// gradient noise, quintic interpolation, returns 0..1
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i), f);
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    s += a * gnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return s / 0.96875;
}

// point on a circle in noise-time => perfectly seamless loop
vec2 motion(float radius) {
  return uMotion * radius * vec2(cos(uPhase), sin(uPhase));
}

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// ---------- palette ----------

vec3 paletteAt(float t) {
  float n = float(uColorCount - 1);
  float x = clamp(t, 0.0, 1.0) * n;
  int i = int(min(floor(x), float(uColorCount - 2)));
  float f = x - float(i);
  return mix(uColors[i], uColors[i + 1], smoothstep(0.0, 1.0, f));
}

vec3 brighten(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(0.6)) * 1.35 + vec3(0.1);
}

// ---------- flow field (shared by silk & aurora) ----------

float coverageRamp(float v) {
  float th = mix(0.7, 0.28, uColorShare);
  float edge = mix(0.3, 0.16, uBlur);
  return smoothstep(th - edge, th + edge, v);
}

float palettePos(float v) {
  float th = mix(0.7, 0.28, uColorShare);
  return clamp((v - th) / max(1.0 - th, 0.001) * 1.3 - 0.05, 0.0, 1.0);
}

// ---------- styles ----------

vec3 sceneSilk(vec2 p) {
  vec2 q = rot2(uRot) * p;
  q *= vec2(1.0, 3.2);                        // strong anisotropy => sheets along flow
  q *= uScale * mix(1.6, 0.85, uBlur);        // blur lowers pattern frequency
  q += uShift;

  vec2 m1 = motion(0.5);
  vec2 m2 = motion(-0.35);
  float w1 = fbm(q * 0.7 + m1);
  float w2 = fbm(q * 0.7 + m2 + vec2(5.2, 1.3));
  q += uWarp * vec2(w1 - 0.5, w2 - 0.5) * 2.0;

  float v = fbm(q * 0.85 + m2 * 0.5);
  v = v * v * (3.0 - 2.0 * v);
  v = smoothstep(0.28, 0.9, v);               // stretch: clear separation of dark vs colored

  float cov = coverageRamp(v);
  // color varies inside the wash so sheets are not flat
  vec3 wash = paletteAt(clamp(palettePos(v) + (w2 - 0.5) * 0.25, 0.0, 1.0));
  vec3 col = mix(uBg, wash * uIntensity, cov);

  // silky streaks: families of parallel warped light bands
  if (uStreaks > 0.001) {
    float wf = fbm(q * 0.55 + m1 * 1.6);
    float freq1 = mix(2.5, 5.5, fract(uShift.x * 0.017));
    float s1 = sin(q.y * freq1 + wf * 8.0);
    float l1 = pow(clamp(1.0 - abs(s1), 0.0, 1.0), mix(20.0, 8.0, uBlur));
    float freq2 = mix(7.0, 13.0, fract(uShift.y * 0.019));
    float s2 = sin(q.y * freq2 + wf * 10.0 + 2.1);
    float l2 = pow(clamp(1.0 - abs(s2), 0.0, 1.0), mix(30.0, 12.0, uBlur)) * 0.55;
    vec3 f1 = brighten(paletteAt(0.8));
    vec3 f2 = brighten(paletteAt(0.35));
    float glow = mix(0.55, 0.22, uBlur);
    vec3 fil = f1 * (l1 + glow * pow(clamp(s1 * 0.5 + 0.5, 0.0, 1.0), 5.0)) * 1.0 + f2 * l2;
    fil *= uStreaks * (0.45 + 0.6 * cov);
    float bgLum = dot(uBg, vec3(0.299, 0.587, 0.114));
    col = mix(col, fil, clamp(fil * mix(1.0, 0.55, bgLum), 0.0, 1.0));
  }
  return col;
}

vec3 sceneAurora(vec2 p) {
  vec2 q = rot2(uRot) * p;
  q *= vec2(2.4, 1.0); // tall curtains
  q *= uScale * mix(1.5, 0.8, uBlur);
  q += uShift;

  vec2 m1 = motion(0.65);
  vec2 m2 = motion(-0.5);
  float w1 = fbm(q * 0.6 + m1);
  float w2 = fbm(q * 0.9 + m2 + vec2(9.1, 2.7));
  q += uWarp * vec2(w1 - 0.5, w2 - 0.5) * 2.4;

  float v = fbm(q * 1.0 + m1 * 0.7 + vec2(w2 * 0.4));
  v = v * v * (3.0 - 2.0 * v);
  v = smoothstep(0.3, 0.9, v);

  // atmospheric vertical falloff
  float sky = smoothstep(-0.75, 0.7, p.y + motion(0.2).x * 0.3);

  float cov = coverageRamp(v);
  float pos = clamp(palettePos(v) + (w2 - 0.5) * 0.25, 0.0, 1.0);
  vec3 col = mix(uBg, paletteAt(pos) * uIntensity, cov * mix(0.55, 1.0, sky));

  if (uStreaks > 0.001) {
    float wf = fbm(q * 0.5 + m1 * 1.8);
    float freq1 = mix(2.0, 4.5, fract(uShift.y * 0.017));
    float s1 = sin(q.x * freq1 + wf * 8.0);
    float l1 = pow(clamp(1.0 - abs(s1), 0.0, 1.0), mix(30.0, 11.0, uBlur));
    float freq2 = mix(6.0, 11.0, fract(uShift.x * 0.019));
    float s2 = sin(q.x * freq2 + wf * 10.0 + 1.3);
    float l2 = pow(clamp(1.0 - abs(s2), 0.0, 1.0), mix(42.0, 15.0, uBlur)) * 0.5;
    vec3 f1 = brighten(paletteAt(0.9));
    vec3 f2 = brighten(paletteAt(0.45));
    float glow = mix(0.5, 0.2, uBlur);
    vec3 fil = f1 * (l1 + glow * pow(clamp(s1 * 0.5 + 0.5, 0.0, 1.0), 6.0)) + f2 * l2;
    fil *= uStreaks * mix(0.35, 1.0, sky) * (0.45 + 0.6 * cov);
    float bgLum = dot(uBg, vec3(0.299, 0.587, 0.114));
    col = mix(col, fil, clamp(fil * mix(1.0, 0.55, bgLum), 0.0, 1.0));
  }
  return col;
}

vec3 sceneMesh(vec2 p) {
  float aspect = uResolution.x / uResolution.y;
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uLayers) break;
    vec4 b = uBlobs[i];
    vec2 drift = motion(0.35 + b.w * 0.3);
    vec2 pos = b.xy * vec2(aspect, 1.0) * 0.85 + drift * vec2(aspect, 1.0);
    vec2 d = (p - pos) / max(b.z, 0.05);
    float wgt = exp(-dot(d, d) * 1.7);
    acc += uColors[i % uColorCount] * wgt;
    total += wgt;
  }
  float density = total / max(uLayers, 1.0) * 3.0;
  float th = mix(0.5, 0.06, uColorShare);
  float cov = smoothstep(th, th + mix(0.3, 0.15, uBlur), density);
  vec3 avg = acc / max(total, 0.0001);
  // soft inner variation so blobs are not flat
  float detail = 0.9 + 0.2 * fbm(p * mix(3.0, 1.2, uBlur) * uScale + uShift + motion(0.25));
  return mix(uBg, avg * uIntensity * detail, cov);
}

// stacked flowing ridges: sky on top, bands colored by their palette slot
vec3 sceneDunes(vec2 p) {
  float aspect = uResolution.x / uResolution.y;
  vec2 q = vec2(p.x * aspect, p.y);
  vec3 col = uBg;
  float n = max(uLayers, 1.0);
  float top = mix(0.9, 0.45, uColorShare);
  float bottom = mix(-0.25, -0.75, uColorShare);
  for (int j = 0; j < 8; j++) {
    if (float(j) >= n) break;
    float fj = float(j);
    float t = n > 1.5 ? fj / (n - 1.0) : 0.5;
    // paint top curves first: lower bands stack over them, sky stays above
    float yc = mix(top, bottom, t);
    float w = fbm(vec2(
      q.x * uScale * (0.85 + 0.18 * fj) + uShift.x + fj * 17.3,
      uShift.y * 0.7 + fj * 7.9
    ) + motion(0.25 + 0.12 * fj));
    yc += uWarp * (w - 0.5) * 0.95;
    float d = q.y - yc; // >0 above the ridge line
    float soft = mix(0.2, 0.05, uBlur);
    float fill = 1.0 - smoothstep(-soft, soft, d);
    vec3 c = paletteAt(t) * uIntensity;
    // shading inside the band: brighter near the crest, darker at depth
    c *= 0.6 + 0.55 * clamp(1.0 - max(d, 0.0) * 2.0, 0.0, 1.0);
    c *= 0.72 + 0.5 * w;
    // crest rim light
    float crest = pow(clamp(1.0 - abs(d) * mix(10.0, 4.5, uBlur), 0.0, 1.0), 3.0);
    c += brighten(c) * crest * uStreaks * 0.7;
    col = mix(col, c, fill);
  }
  return col;
}

// deep turbulent clouds with a sparse star field
vec3 sceneNebula(vec2 p) {
  vec2 q = rot2(uRot) * p;
  q *= uScale * mix(1.3, 0.7, uBlur);
  q += uShift;
  vec2 m1 = motion(0.45);
  float w1 = fbm(q * 0.9 + m1);
  float w2 = fbm(q * 1.7 + m1 * 1.3 + vec2(4.7, 1.9));
  vec2 qq = q + uWarp * 1.6 * vec2(w1 - 0.5, w2 - 0.5);
  float v = fbm(qq * 1.1 + vec2(w2 * 0.5));
  v = v * v * (3.0 - 2.0 * v);
  v = smoothstep(0.28, 0.9, v); // stretch: full palette range from deep bg to bright cores
  float cov = coverageRamp(v);
  vec3 col = mix(uBg, paletteAt(palettePos(v)) * uIntensity, cov);
  // second color layer: darker deep tones for the shadow clouds
  float v2 = fbm(qq * 2.3 + m1 * 0.7 + vec2(9.1, 3.3));
  float cov2 = coverageRamp(v2) * 0.5;
  vec3 deep = paletteAt(clamp(palettePos(v2) * 0.45, 0.0, 1.0)) * uIntensity;
  col = mix(col, deep, cov2 * (1.0 - cov * 0.6));
  // sparse stars (grid in normalized coords => resolution independent)
  if (uStreaks > 0.001) {
    vec2 gp = p * mix(30.0, 55.0, fract(uShift.x * 0.013)) * uScale + motion(0.15) * 6.0;
    vec2 id = floor(gp);
    vec2 f = fract(gp) - 0.5;
    float rnd = hash12(id + floor(uShift));
    vec2 off = (hash22(id + floor(uShift) + vec2(3.1)) - 0.5) * 0.6;
    float ds = length(f - off);
    float tw = 0.75 + 0.25 * sin(uPhase * 3.0 + rnd * 40.0);
    float star = step(0.94, rnd) * pow(clamp(1.0 - ds * 3.0, 0.0, 1.0), 9.0);
    col += vec3(star * uStreaks * tw * 1.3 * (0.35 + 0.65 * (1.0 - cov)));
  }
  return col;
}

// wide soft light beams wandering across the frame
vec3 sceneRays(vec2 p) {
  vec2 q = rot2(uRot) * p;
  q.x *= mix(0.5, 0.85, uBlur);
  q *= uScale * mix(1.4, 0.8, uBlur);
  q += uShift;
  vec2 m1 = motion(0.5);
  float w = fbm(vec2(q.y * 0.5, q.x * 0.15) + m1);
  float beamCoord = q.x + uWarp * (w - 0.5) * 1.3;
  float v = fbm(q * 0.8 + m1 * 0.6 + vec2(7.7, 2.2));
  float cov = coverageRamp(smoothstep(0.25, 0.85, v));
  vec3 col = mix(uBg, paletteAt(palettePos(v)) * uIntensity, cov);
  // beams fade toward one side, like shafts from behind the horizon
  float fadeY = smoothstep(-0.75, 0.9, q.y + m1.x * 0.25);
  float s1 = 0.5 + 0.5 * sin(beamCoord * 18.0 + sin(beamCoord * 3.2) * 1.8);
  float b1 = pow(s1, mix(5.0, 2.2, uBlur));
  float s2 = 0.5 + 0.5 * sin(beamCoord * 36.0 + 2.0 + sin(beamCoord * 6.0) * 1.2);
  float b2 = pow(s2, mix(16.0, 7.0, uBlur));
  vec3 beamCol = brighten(paletteAt(0.75));
  vec3 thinCol = brighten(paletteAt(0.4));
  float k = uStreaks * (0.3 + 0.7 * cov);
  // break the beams into uneven glowing shafts
  float shaftVar = 0.3 + 0.9 * fbm(vec2(beamCoord * 1.3, q.y * 0.25 + 5.0) + m1 * 0.8);
  col = mix(col, beamCol, clamp(b1 * k * fadeY * shaftVar, 0.0, 1.0));
  col = mix(col, thinCol, clamp(b2 * uStreaks * fadeY * shaftVar * 0.7, 0.0, 1.0));
  return col;
}

// ---------- main ----------

void main() {
  vec2 fragPx = uPixelOffset + gl_FragCoord.xy;
  vec2 uv = fragPx / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  vec3 col;
  if (uStyle == 1) col = sceneMesh(p);
  else if (uStyle == 2) col = sceneAurora(p);
  else if (uStyle == 3) col = sceneDunes(p);
  else if (uStyle == 4) col = sceneNebula(p);
  else if (uStyle == 5) col = sceneRays(p);
  else col = sceneSilk(p);

  // vignette (radial, toward black — natural on any theme)
  float r = length((uv - 0.5) * vec2(aspect, 1.0)) / (0.5 * length(vec2(aspect, 1.0)));
  col *= 1.0 - uVignette * 0.6 * smoothstep(0.35, 1.2, r);

  // film grain (absolute pixel size => identical in preview and 16K)
  vec2 gp = floor(fragPx / max(uGrainSize, 1.0));
  float g = hash12(gp + floor(uShift)) - 0.5;
  col += g * uGrain * 0.24;

  // dithering against banding — critical for dark smooth gradients
  col += (hash12(fragPx + 7.77) - 0.5) * (1.6 / 255.0);

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
