/** Shaders de la carte : tout le style « explorateur » est calculé au pixel, sur le GPU. */

export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uView;     // taille de la vue en pixels écran
uniform vec2 uCenter;   // centre de la caméra, en cellules
uniform float uZoom;    // pixels écran par cellule
uniform vec2 uWorld;    // taille du monde en cellules
uniform sampler2D uElevation;
uniform sampler2D uBiome;
uniform sampler2D uRiver;
uniform sampler2D uFog;
uniform sampler2D uTerritory;
uniform sampler2D uRivals;
uniform vec3 uPalette[10];
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uPlayerInk;
uniform vec3 uRivalInk;
uniform float uRevealAll; // 1 : ignore le brouillard (mesures, débogage)

out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

vec3 landOf(ivec2 cell) {
  int b = int(texelFetch(uBiome, clamp(cell, ivec2(0), ivec2(uWorld) - 1), 0).r * 255.0 + 0.5);
  // Une cellule marine sous une côte déformée prend la couleur de la plaine.
  return b < 2 ? uPalette[2] : uPalette[b];
}

// Couleurs des quatre cellules voisines, fondues avec une transition resserrée :
// les biomes ont des bords nets mais sans marches d'escalier.
vec3 biomeColor(vec2 p) {
  vec2 q = p - 0.5;
  ivec2 i = ivec2(floor(q));
  vec2 f = smoothstep(0.25, 0.75, fract(q));
  return mix(
    mix(landOf(i), landOf(i + ivec2(1, 0)), f.x),
    mix(landOf(i + ivec2(0, 1)), landOf(i + ivec2(1, 1)), f.x),
    f.y
  );
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  vec2 w = uCenter + (frag - uView * 0.5) / uZoom;

  vec3 paper = uPaper - valueNoise(frag * 0.7) * 0.035 - fbm(w * 0.12) * 0.07;
  if (w.x < 0.0 || w.y < 0.0 || w.x > uWorld.x || w.y > uWorld.y) {
    outColor = vec4(paper * 0.8, 1.0);
    return;
  }

  // Déformation douce : les limites de la grille disparaissent, les formes deviennent organiques.
  vec2 warp = (vec2(fbm(w * 0.35), fbm(w * 0.35 + 17.3)) - 0.5) * 1.6;
  vec2 wp = clamp(w + warp, vec2(0.0), uWorld - 0.001);

  // Le détail fin n'apparaît qu'en zoom rapproché : de loin il ne ferait que du bruit.
  float detail = smoothstep(1.5, 5.0, uZoom);
  float base = texture(uElevation, wp / uWorld).r * 2.0 - 1.0;
  float e = base + (fbm(w * 1.3) - 0.5) * 0.025 * detail;
  vec3 landColor = biomeColor(wp);
  vec3 color;
  if (e < 0.0) {
    float depth = clamp(-e * 6.0, 0.0, 1.0);
    color = mix(uPalette[1], uPalette[0], depth);
    // Quelques lignes de rivage parallèles à la côte, comme sur les cartes anciennes.
    float ripples = smoothstep(0.85, 1.0, sin(-base * 160.0) * 0.5 + 0.5) * smoothstep(0.08, 0.0, -base);
    color -= ripples * 0.07;
  } else {
    color = landColor;
    // Courbes de niveau à l'encre légère.
    float level = e / 0.12;
    float d = min(fract(level), 1.0 - fract(level));
    float contour = 1.0 - smoothstep(0.0, max(fwidth(level), 1e-4) * 1.2, d);
    color = mix(color, color * 0.75, contour * 0.55 * step(0.12, e));
    // Fleuves : un trait d'eau dont la largeur suit le débit, cerné d'encre.
    float r = texture(uRiver, wp / uWorld).r;
    float aa = max(fwidth(r), 1e-4);
    float water = smoothstep(0.45 - aa, 0.45 + aa, r);
    float bank = smoothstep(0.37 - aa, 0.37 + aa, r) - water;
    color = mix(color, uInk * 0.9 + uPalette[1] * 0.1, bank * 0.5 * smoothstep(1.0, 3.0, uZoom));
    color = mix(color, mix(uPalette[1], uPalette[0], 0.35), water);
  }
  // Lavis d'aquarelle : variations lentes de pigment.
  color *= 0.92 + 0.16 * fbm(w * 0.07 + 3.1);

  // Brouillard : papier vierge, terres déjà vues en sépia, terres visibles en couleur.
  float fog = max(uRevealAll, texture(uFog, clamp(w + warp * 2.0, vec2(0.0), uWorld) / uWorld).r);
  float seen = smoothstep(0.12, 0.42, fog);
  float visible = smoothstep(0.62, 0.92, fog);
  float grey = dot(color, vec3(0.3, 0.59, 0.11));
  vec3 sepia = mix(paper, vec3(grey) * vec3(1.04, 0.97, 0.85), 0.6);
  vec3 c = mix(paper, sepia, seen);
  c = mix(c, color, visible);

  // Trait de côte à l'encre.
  float coast = 1.0 - smoothstep(0.0, max(fwidth(e), 1e-4) * 1.4, abs(e));
  c = mix(c, uInk, coast * seen * 0.85);

  // Territoire du joueur : lavis et frontière tracée au pixel.
  // Même déformation que le relief : la frontière épouse la côte au lieu de déborder en mer.
  float t = texture(uTerritory, wp / uWorld).r;
  float onLand = smoothstep(-0.002, 0.002, e);
  float inside = smoothstep(0.45, 0.55, t) * onLand;
  float border = (1.0 - smoothstep(0.0, max(fwidth(t), 1e-4) * 1.6, abs(t - 0.5))) * onLand;
  c = mix(c, mix(c, uPlayerInk, 0.14), inside * seen);
  c = mix(c, uPlayerInk, border * seen * 0.9);

  // Peuples voisins : même trait, à l'encre d'ardoise, plus discret.
  float rv = texture(uRivals, wp / uWorld).r;
  float rInside = smoothstep(0.45, 0.55, rv) * onLand;
  float rBorder = (1.0 - smoothstep(0.0, max(fwidth(rv), 1e-4) * 1.6, abs(rv - 0.5))) * onLand;
  c = mix(c, mix(c, uRivalInk, 0.12), rInside * seen);
  c = mix(c, uRivalInk, rBorder * seen * 0.75);

  outColor = vec4(c, 1.0);
}
`
