import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/use-media-query';
import { useTheme } from '../../state/theme-context';
import styles from './ambient-background.module.css';

const VERTEX_SHADER = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_base;
uniform vec3 u_glow;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.25;
  float n1 = noise(p * 2.5 + vec2(t * 0.3, t * 0.1));
  float n2 = noise(p * 5.0 - vec2(t * 0.2, t * 0.4) + n1);
  float value = mix(n1, n2, 0.5);
  float dist = length(p);
  float glow = 0.08 / (dist * dist + 0.35);
  vec2 grid = abs(fract(p * 6.0 - 0.5) - 0.5) / fwidth(p * 6.0);
  float gridPattern = 1.0 - min(min(grid.x, grid.y), 1.0);
  float shade = value * 0.12 + glow * 0.35 + gridPattern * 0.03;
  gl_FragColor = vec4(mix(u_base, u_glow, clamp(shade * 4.0, 0.0, 1.0)), 1.0);
}`;

type Rgb = [number, number, number];

interface ShaderProgram {
  gl: WebGLRenderingContext;
  timeLocation: WebGLUniformLocation | null;
  resolutionLocation: WebGLUniformLocation | null;
  baseLocation: WebGLUniformLocation | null;
  glowLocation: WebGLUniformLocation | null;
}

function readThemeColor(property: string, fallback: Rgb): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(getComputedStyle(document.documentElement).getPropertyValue(property).trim());
  return match ? [parseInt(match[1]!, 16) / 255, parseInt(match[2]!, 16) / 255, parseInt(match[3]!, 16) / 255] : fallback;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function createProgram(canvas: HTMLCanvasElement): ShaderProgram | null {
  const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false });
  if (!gl) {
    return null;
  }
  gl.getExtension('OES_standard_derivatives');
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  return {
    gl,
    timeLocation: gl.getUniformLocation(program, 'u_time'),
    resolutionLocation: gl.getUniformLocation(program, 'u_resolution'),
    baseLocation: gl.getUniformLocation(program, 'u_base'),
    glowLocation: gl.getUniformLocation(program, 'u_glow'),
  };
}

export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const shader = canvas ? createProgram(canvas) : null;
    if (!canvas || !shader) {
      return;
    }
    shader.gl.uniform3fv(shader.baseLocation, readThemeColor('--ambient-base', [0.07, 0.07, 0.09]));
    shader.gl.uniform3fv(shader.glowLocation, readThemeColor('--ambient-glow', [0.23, 0.19, 0.49]));
    let frame = 0;
    const draw = (milliseconds: number) => {
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      shader.gl.viewport(0, 0, width, height);
      shader.gl.uniform1f(shader.timeLocation, milliseconds / 1000);
      shader.gl.uniform2f(shader.resolutionLocation, width, height);
      shader.gl.drawArrays(shader.gl.TRIANGLE_STRIP, 0, 4);
    };
    const loop = (milliseconds: number) => {
      if (!document.hidden) {
        draw(milliseconds);
      }
      frame = window.requestAnimationFrame(loop);
    };
    if (reducedMotion) {
      draw(0);
    } else {
      frame = window.requestAnimationFrame(loop);
    }
    const resizeObserver = new ResizeObserver(() => reducedMotion && draw(0));
    resizeObserver.observe(canvas);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [reducedMotion, theme]);

  return (
    <div className={styles.background} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
