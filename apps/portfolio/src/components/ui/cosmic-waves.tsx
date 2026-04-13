import type React from 'react';
import { forwardRef } from 'react';
import { Shader } from 'react-shaders';
import { cn } from '#/lib/utils';

export interface CosmicWavesShadersProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Wave flow animation speed
   * @default 1.0
   */
  speed?: number;

  /**
   * Wave height and intensity
   * @default 1.0
   */
  amplitude?: number;

  /**
   * Wave density and pattern scale
   * @default 1.0
   */
  frequency?: number;

  /**
   * Color cycling speed
   * @default 1.0
   */
  colorShift?: number;
}

const fragmentShader = `
// Hash function for pseudo-random values
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth noise function
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal noise
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for(int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Tiny dithering grain to reduce color banding in dark gradients
float dither(vec2 fragCoord, float time) {
  vec2 grid = fragCoord + vec2(time * 31.0, time * 17.0);
  return hash(grid) - 0.5;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
  vec2 uv = fragCoord.xy / iResolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= iResolution.x / iResolution.y;

  float time = iTime * u_speed;
  // Ease time progression slightly to avoid harsh motion
  float smoothTime = time + sin(time * 0.35) * 0.2;

  // Create flowing wave patterns
  vec2 wavePos = p * u_frequency;
  wavePos.y += smoothTime * 0.26;

  // Multiple wave layers
  float wave1 = sin(wavePos.x + cos(wavePos.y + smoothTime) * 0.5) * u_amplitude;
  float wave2 = sin(wavePos.x * 1.3 - wavePos.y * 0.7 + smoothTime * 0.95) * u_amplitude * 0.7;
  float wave3 = sin(wavePos.x * 0.8 + wavePos.y * 1.1 - smoothTime * 0.65) * u_amplitude * 0.5;

  // Combine waves
  float waves = (wave1 + wave2 + wave3) * 0.3;

  // Add fractal noise for organic texture
  vec2 noisePos = p * 1.5 + vec2(smoothTime * 0.08, smoothTime * 0.04);
  float noiseValue = fbm(noisePos) * 0.4;

  // Combine waves and noise
  float pattern = mix(waves, waves + noiseValue, 0.7);
  pattern = smoothstep(-0.8, 0.8, pattern) * 2.0 - 1.0;

  // Create flowing cosmic gradient
  float gradient = length(p) * 0.8;
  gradient += pattern;

  // Dark neutral palette (charcoal/slate/steel tones)
  vec3 color1 = vec3(0.05, 0.06, 0.07); // Charcoal
  vec3 color2 = vec3(0.11, 0.13, 0.15); // Slate
  vec3 color3 = vec3(0.16, 0.18, 0.20); // Steel gray
  vec3 color4 = vec3(0.08, 0.10, 0.12); // Graphite

  // Color interpolation based on pattern and time
  float colorTime = smoothTime * u_colorShift * 0.6 + pattern * 1.4;
  float t = fract(colorTime * 0.18);
  float t2 = fract(t + 0.25);
  float t3 = fract(t + 0.5);
  float t4 = fract(t + 0.75);
  vec3 finalColor =
    color1 * smoothstep(0.0, 1.0, 1.0 - abs(t * 2.0 - 1.0)) +
    color2 * smoothstep(0.0, 1.0, 1.0 - abs(t2 * 2.0 - 1.0)) +
    color3 * smoothstep(0.0, 1.0, 1.0 - abs(t3 * 2.0 - 1.0)) +
    color4 * smoothstep(0.0, 1.0, 1.0 - abs(t4 * 2.0 - 1.0));

  // Keep contrast restrained for a darker, more neutral look
  finalColor *= (0.36 + pattern * 0.45);

  // Add subtle glow effect
  float glow = exp(-length(p) * 0.55) * 0.16;
  finalColor += glow * vec3(0.15, 0.16, 0.18);

  // Vignette effect
  float vignette = 1.0 - length(uv - 0.5) * 1.2;
  vignette = smoothstep(0.0, 1.0, vignette);

  finalColor *= vignette;

  // Smoothly fade in shader on initial render (~2s)
  float introFade = smoothstep(0.0, 2.0, iTime);
  finalColor *= introFade;

  // Apply subtle, animated dithering to hide quantization bands
  float grain = dither(fragCoord.xy, smoothTime) / 255.0;
  finalColor += vec3(grain);
  finalColor = clamp(finalColor, 0.0, 1.0);

  fragColor = vec4(finalColor, 1.0);
}
`;

export const CosmicWavesShaders = forwardRef<
  HTMLDivElement,
  CosmicWavesShadersProps
>(
  (
    {
      className,
      speed = 1.0,
      amplitude = 1.0,
      frequency = 1.0,
      colorShift = 1.0,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        className={cn('w-full h-full', className)}
        ref={ref}
        {...(props as any)}
      >
        <Shader
          fs={fragmentShader}
          style={{ width: '100%', height: '100%' } as CSSStyleDeclaration}
          uniforms={{
            u_speed: { type: '1f', value: speed },
            u_amplitude: { type: '1f', value: amplitude },
            u_frequency: { type: '1f', value: frequency },
            u_colorShift: { type: '1f', value: colorShift },
          }}
        />
      </div>
    );
  },
);

CosmicWavesShaders.displayName = 'CosmicWavesShaders';

export default CosmicWavesShaders;

