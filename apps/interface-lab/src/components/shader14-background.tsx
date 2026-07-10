import { cn } from '@workspace/ui/lib/utils';
import { useEffect, useRef, useState } from 'react';

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 vUv;

void main() {
  vUv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FIRST_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 vUv;
out vec4 fragColor;

uniform float u_time;
uniform vec3 u_resolution;
uniform vec3 u_backgroundColor;
uniform vec3 u_color;

#define TWOPI 6.28318530718

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 10.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = vec3(1.0) - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);

  vec4 p = permute(
    permute(
      permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y
        + vec4(0.0, i1.y, i2.y, 1.0)
    )
      + i.x
      + vec4(0.0, i1.x, i2.x, 1.0)
  );

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = vec4(1.0) - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(
    dot(p0, p0),
    dot(p1, p1),
    dot(p2, p2),
    dot(p3, p3)
  ));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(
    0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)),
    0.0
  );
  m = m * m;

  return 55.0 * dot(m * m, vec4(
    dot(p0, x0),
    dot(p1, x1),
    dot(p2, x2),
    dot(p3, x3)
  ));
}

void main() {
  vec3 c;
  float l;
  float z = u_time;
  vec2 resolution = u_resolution.xy;
  vec2 uv0 = vUv;
  float noiseStrength = 0.16;
  float noiseScale = 0.001;
  float noise = snoise(vec3(
    (gl_FragCoord.x - resolution.x / 2.0) * noiseScale,
    (gl_FragCoord.y - resolution.y / 2.0) * noiseScale,
    u_time * 0.1
  ));

  uv0.x = fract(uv0).x + noiseStrength * sin(noise * TWOPI);
  uv0.y = fract(uv0).y + noiseStrength * cos(noise * TWOPI);

  for (int i = 0; i < 3; i++) {
    vec2 uv = uv0;
    vec2 p = uv;
    p -= 0.5;
    p.x *= resolution.x / resolution.y;
    z += 0.03;
    l = length(p);
    uv += p / l * (sin(z) + 1.0) * abs(sin(l * 9.0 - z - z));
    c[i] = 0.05 / length(mod(uv, 1.0) - 0.5);
  }

  vec3 pattern = (c / l) * u_color;
  fragColor = vec4(mix(u_backgroundColor, pattern, 0.72), 1.0);
}
`;

const SECOND_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform vec3 u_resolution;
uniform sampler2D u_channel0;

float character(int n, vec2 p) {
  p = floor(p * vec2(-4.0, 4.0) + 2.5);
  if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y) {
    int a = int(round(p.x) + 5.0 * round(p.y));
    if (((n >> a) & 1) == 1) return 1.0;
  }
  return 0.0;
}

void main() {
  vec2 pix = gl_FragCoord.xy;
  vec3 col = texture(
    u_channel0,
    floor(pix / 16.0) * 16.0 / u_resolution.xy
  ).rgb;
  float gray = 0.3 * col.r + 0.59 * col.g + 0.11 * col.b;
  int glyph = 4096;

  if (gray > 0.1) glyph = 4096;
  if (gray > 0.1064) glyph = 131200;
  if (gray > 0.1096) glyph = 4329476;
  if (gray > 0.1130) glyph = 459200;
  if (gray > 0.1263) glyph = 4591748;
  if (gray > 0.1395) glyph = 12652620;
  if (gray > 0.1628) glyph = 14749828;
  if (gray > 0.1860) glyph = 18393220;
  if (gray > 0.2093) glyph = 15239300;
  if (gray > 0.2326) glyph = 17318431;
  if (gray > 0.2558) glyph = 32641156;
  if (gray > 0.2791) glyph = 18393412;
  if (gray > 0.3023) glyph = 18157905;
  if (gray > 0.3256) glyph = 17463428;
  if (gray > 0.3488) glyph = 14954572;
  if (gray > 0.3721) glyph = 13177118;
  if (gray > 0.3953) glyph = 6566222;
  if (gray > 0.4186) glyph = 16269839;
  if (gray > 0.4419) glyph = 18444881;
  if (gray > 0.4651) glyph = 18400814;
  if (gray > 0.4884) glyph = 33061392;
  if (gray > 0.5116) glyph = 15255086;
  if (gray > 0.5349) glyph = 32045584;
  if (gray > 0.5581) glyph = 18405034;
  if (gray > 0.5814) glyph = 15022158;
  if (gray > 0.6047) glyph = 15018318;
  if (gray > 0.6279) glyph = 16272942;
  if (gray > 0.6512) glyph = 18415153;
  if (gray > 0.6744) glyph = 32641183;
  if (gray > 0.6977) glyph = 32540207;
  if (gray > 0.7209) glyph = 18732593;
  if (gray > 0.7442) glyph = 18667121;
  if (gray > 0.7674) glyph = 16267326;
  if (gray > 0.7907) glyph = 32575775;
  if (gray > 0.8140) glyph = 15022414;
  if (gray > 0.8372) glyph = 15255537;
  if (gray > 0.8605) glyph = 32032318;
  if (gray > 0.8837) glyph = 32045617;
  if (gray > 0.9070) glyph = 33081316;
  if (gray > 0.9302) glyph = 32045630;
  if (gray > 0.9535) glyph = 33061407;
  if (gray > 0.9767) glyph = 11512810;

  vec2 p = mod(pix / 8.0, 2.0) - vec2(1.0);
  fragColor = vec4(col * character(glyph, p), 1.0);
}
`;

type ShaderProgram = {
  program: WebGLProgram;
  positionLocation: number;
};

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader.');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
};

const createShaderProgram = (
  gl: WebGL2RenderingContext,
  fragmentShaderSource: string,
): ShaderProgram => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create shader program.');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown shader link error.';
    gl.deleteProgram(program);
    throw new Error(log);
  }

  return {
    program,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
  };
};

const drawFullscreenQuad = (
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  shader: ShaderProgram,
) => {
  gl.useProgram(shader.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(shader.positionLocation);
  gl.vertexAttribPointer(shader.positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

export function Shader14Background({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      setHasError(true);
      return;
    }

    let firstPass: ShaderProgram;
    let secondPass: ShaderProgram;
    const positionBuffer = gl.createBuffer();
    const framebuffer = gl.createFramebuffer();
    const renderTexture = gl.createTexture();
    if (!positionBuffer || !framebuffer || !renderTexture) {
      setHasError(true);
      return;
    }

    try {
      firstPass = createShaderProgram(gl, FIRST_FRAGMENT_SHADER);
      secondPass = createShaderProgram(gl, SECOND_FRAGMENT_SHADER);
    } catch {
      setHasError(true);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.bindTexture(gl.TEXTURE_2D, renderTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const firstTimeLocation = gl.getUniformLocation(firstPass.program, 'u_time');
    const firstResolutionLocation = gl.getUniformLocation(firstPass.program, 'u_resolution');
    const firstBackgroundLocation = gl.getUniformLocation(firstPass.program, 'u_backgroundColor');
    const firstColorLocation = gl.getUniformLocation(firstPass.program, 'u_color');
    const secondResolutionLocation = gl.getUniformLocation(secondPass.program, 'u_resolution');
    const secondChannelLocation = gl.getUniformLocation(secondPass.program, 'u_channel0');

    let width = 0;
    let height = 0;
    const resize = () => {
      const bounds = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(bounds.width));
      const nextHeight = Math.max(1, Math.floor(bounds.height));
      if (nextWidth === width && nextHeight === height) return;

      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;

      gl.bindTexture(gl.TEXTURE_2D, renderTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        renderTexture,
        0,
      );
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Unable to create shader render target.');
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    try {
      resize();
    } catch {
      setHasError(true);
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      try {
        resize();
      } catch {
        setHasError(true);
      }
    });
    resizeObserver.observe(container);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startTime = performance.now();
    let frameId = 0;

    const render = (time: number) => {
      const elapsed = (time - startTime) / 1000;

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      gl.useProgram(firstPass.program);
      gl.uniform1f(firstTimeLocation, elapsed);
      gl.uniform3f(firstResolutionLocation, width, height, 1);
      gl.uniform3f(firstBackgroundLocation, 0, 0, 0);
      gl.uniform3f(firstColorLocation, 0.94, 0.96, 1);
      drawFullscreenQuad(gl, positionBuffer, firstPass);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, renderTexture);
      gl.useProgram(secondPass.program);
      gl.uniform3f(secondResolutionLocation, width, height, 1);
      gl.uniform1i(secondChannelLocation, 0);
      drawFullscreenQuad(gl, positionBuffer, secondPass);

      if (!prefersReducedMotion) frameId = requestAnimationFrame(render);
    };

    render(startTime);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      gl.deleteTexture(renderTexture);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(firstPass.program);
      gl.deleteProgram(secondPass.program);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden='true'
      className={cn('fixed inset-0 overflow-hidden bg-background', className)}
      data-testid='animated-gradient-background'
      style={
        hasError
          ? {
              background:
                'radial-gradient(circle at 50% 45%, rgba(96, 111, 126, 0.22), transparent 42%), #050507',
            }
          : undefined
      }
    >
      <canvas ref={canvasRef} className='block size-full' />
    </div>
  );
}
