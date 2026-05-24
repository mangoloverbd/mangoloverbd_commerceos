"use client";

import { useEffect, useRef } from "react";

function DitheringCanvas({
  colorBack = "hsl(0, 0%, 0%)",
  colorFront = "hsl(320, 100%, 70%)",
  pxSize = 3,
  speed = 0.1,
}: {
  colorBack?: string;
  colorFront?: string;
  pxSize?: number;
  speed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  function parseHsl(hsl: string): [number, number, number] {
    const m = hsl.match(/hsl\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    if (!m) return [0, 0, 0];
    return [parseFloat(m[1]) / 360, parseFloat(m[2]) / 100, parseFloat(m[3]) / 100];
  }
  function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if      (h < 1/6) { r=c; g=x; b=0; }
    else if (h < 2/6) { r=x; g=c; b=0; }
    else if (h < 3/6) { r=0; g=c; b=x; }
    else if (h < 4/6) { r=0; g=x; b=c; }
    else if (h < 5/6) { r=x; g=0; b=c; }
    else               { r=c; g=0; b=x; }
    return [r+m, g+m, b+m];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return;

    const [bR, bG, bB] = hsl2rgb(...parseHsl(colorBack));
    const [fR, fG, fB] = hsl2rgb(...parseHsl(colorFront));

    const vert = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const frag = `
      precision mediump float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec2  u_res;
      uniform float u_px;

      vec3 cBack  = vec3(${bR.toFixed(4)}, ${bG.toFixed(4)}, ${bB.toFixed(4)});
      vec3 cFront = vec3(${fR.toFixed(4)}, ${fG.toFixed(4)}, ${fB.toFixed(4)});

      // 4x4 Bayer dither
      float bayer4(vec2 fc) {
        int x = int(mod(fc.x, 4.0));
        int y = int(mod(fc.y, 4.0));
        int i = y * 4 + x;
        float v = 0.0;
        if      (i== 0) v= 0.0; else if (i== 1) v= 8.0;
        else if (i== 2) v= 2.0; else if (i== 3) v=10.0;
        else if (i== 4) v=12.0; else if (i== 5) v= 4.0;
        else if (i== 6) v=14.0; else if (i== 7) v= 6.0;
        else if (i== 8) v= 3.0; else if (i== 9) v=11.0;
        else if (i==10) v= 1.0; else if (i==11) v= 9.0;
        else if (i==12) v=15.0; else if (i==13) v= 7.0;
        else if (i==14) v=13.0; else             v= 5.0;
        return v / 16.0;
      }

      // Layered wave surface — slow, gentle
      float waveSurface(float x, float t) {
        float w = 0.0;
        w += 0.022 * sin(x * 4.2  + t * 0.4);
        w += 0.015 * sin(x * 7.1  - t * 0.6);
        w += 0.010 * sin(x * 11.0 + t * 0.3);
        w += 0.006 * sin(x * 17.0 - t * 0.5);
        return w;
      }

      void main() {
        // Snap to px block
        vec2 block = floor(gl_FragCoord.xy / u_px) * u_px + u_px * 0.5;
        vec2 uv = block / u_res;
        // y=0 bottom, y=1 top
        float x = uv.x;
        float y = uv.y;

        float t = u_time;

        // Fill level breathes slowly from bottom to center (0.0 → 0.5)
        float breathe = 0.25 + 0.22 * sin(t * 0.38);

        // Wave surface — gentle, slow
        float surface = breathe + waveSurface(x, t);

        // Minimal secondary ripple
        surface += 0.008 * sin(x * 5.0 + t * 0.5) * sin(t * 0.3);

        // Brightness: below surface = filled (front color), above = empty (back color)
        // Add a gradient so the top of the fill is slightly dimmer (depth feel)
        float depth = clamp((surface - y) / 0.18, 0.0, 1.0); // how deep below surface
        float brightness = smoothstep(-0.01, 0.04, surface - y);

        // Subtle inner texture — FBM-like via layered sines
        float inner = 0.5
          + 0.12 * sin(x * 8.0  + t * 0.6)
          + 0.08 * sin(y * 11.0 - t * 0.9)
          + 0.05 * sin((x + y) * 14.0 + t * 1.2);
        inner = clamp(inner, 0.0, 1.0);

        // Blend: filled region = bright front with inner texture variation
        float fill = brightness * (0.78 + inner * 0.22);

        // Dither
        float threshold = bayer4(gl_FragCoord.xy / u_px);
        float bit = step(threshold, fill);

        gl_FragColor = vec4(mix(cBack, cFront, bit), 1.0);
      }
    `;

    function compile(type: number, src: string) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error(gl.getShaderInfoLog(s));
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes  = gl.getUniformLocation(prog, "u_res");
    const uPx   = gl.getUniformLocation(prog, "u_px");

    const ro = new ResizeObserver(() => {
      const w = Math.floor(canvas.clientWidth  * devicePixelRatio);
      const h = Math.floor(canvas.clientHeight * devicePixelRatio);
      if (w > 0 && h > 0) { canvas.width = w; canvas.height = h; gl.viewport(0,0,w,h); }
    });
    ro.observe(canvas);

    let t0 = 0;
    function draw(ts: number) {
      if (!t0) t0 = ts;
      gl.uniform1f(uTime, (ts - t0) / 1000 * speed * 10.0);
      gl.uniform2f(uRes, canvas!.width, canvas!.height);
      gl.uniform1f(uPx, pxSize * devicePixelRatio);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animRef.current = requestAnimationFrame(draw);
    }
    animRef.current = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

export default function Wrapper() {
  return (
    <div className="relative w-full h-full bg-black">
      <div className="absolute inset-0">
        <DitheringCanvas
          colorBack="hsl(0, 0%, 0%)"
          colorFront="hsl(320, 100%, 70%)"
          pxSize={3}
          speed={0.1}
        />
      </div>
    </div>
  );
}
