import { ArrowRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";

function DitheringCanvas({ speed }: { speed: number; isHovered: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tRef = useRef<number>(0);
  const speedRef = useRef<number>(speed);

  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false });
    if (!gl) return;

    const ro = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    });
    ro.observe(canvas);

    const vert = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;

    const frag = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_res;

      float hash(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = rot * p * 2.0 + shift;
          a *= 0.5;
        }
        return v;
      }

      // 4x4 Bayer matrix
      float bayer4x4(vec2 pos) {
        int x = int(mod(pos.x, 4.0));
        int y = int(mod(pos.y, 4.0));
        float m[16];
        m[0]  =  0.0; m[1]  =  8.0; m[2]  =  2.0; m[3]  = 10.0;
        m[4]  = 12.0; m[5]  =  4.0; m[6]  = 14.0; m[7]  =  6.0;
        m[8]  =  3.0; m[9]  = 11.0; m[10] =  1.0; m[11] =  9.0;
        m[12] = 15.0; m[13] =  7.0; m[14] = 13.0; m[15] =  5.0;
        int idx = y * 4 + x;
        float val = 0.0;
        if (idx == 0) val = m[0];
        else if (idx == 1) val = m[1];
        else if (idx == 2) val = m[2];
        else if (idx == 3) val = m[3];
        else if (idx == 4) val = m[4];
        else if (idx == 5) val = m[5];
        else if (idx == 6) val = m[6];
        else if (idx == 7) val = m[7];
        else if (idx == 8) val = m[8];
        else if (idx == 9) val = m[9];
        else if (idx == 10) val = m[10];
        else if (idx == 11) val = m[11];
        else if (idx == 12) val = m[12];
        else if (idx == 13) val = m[13];
        else if (idx == 14) val = m[14];
        else val = m[15];
        return val / 16.0;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_res;
        vec2 p = uv * 3.0;

        float t = u_time * 0.3;
        vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, t + 1.3)));
        vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, t * 0.5)), fbm(p + 4.0 * q + vec2(9.2, t * 0.5 + 2.8)));
        float f = fbm(p + 4.0 * r);

        // Accent color: EC4E02 -> (0.925, 0.306, 0.008)
        vec3 accent = vec3(0.925, 0.306, 0.008);
        vec3 col = mix(vec3(0.0), accent, clamp(f * 1.5 - 0.1, 0.0, 1.0));

        // Warp: apply radial fade so center is stronger
        float dist = length(uv - 0.5) * 1.8;
        col *= smoothstep(1.0, 0.2, dist);

        // Dithering
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        float threshold = bayer4x4(gl_FragCoord.xy);
        vec3 dithered = step(vec3(threshold), col);

        // Blend dithered with smooth for softer look
        vec3 result = mix(col, dithered * accent, 0.65);

        gl_FragColor = vec4(result, luma * 0.9);
      }
    `;

    function compileShader(type: number, src: string) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");

    let last = 0;
    function draw(ts: number) {
      const dt = (ts - last) / 1000;
      last = ts;
      tRef.current += dt * speedRef.current;

      const w = canvas!.width;
      const h = canvas!.height;
      if (w === 0 || h === 0) { animRef.current = requestAnimationFrame(draw); return; }

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, tRef.current);
      gl.uniform2f(uRes, w, h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animRef.current = requestAnimationFrame(draw);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    animRef.current = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block" }}
    />
  );
}

export function CTASection() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="w-full flex justify-center items-center h-full">
      <div
        className="w-full h-full relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative overflow-hidden bg-[#f5f4f0] h-full w-full flex flex-col items-center justify-center duration-500">
          {/* Dithering background */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-55">
            <DitheringCanvas speed={isHovered ? 0.6 : 0.2} isHovered={isHovered} />
          </div>

          {/* Warm radial glow */}
          <div
            className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700"
            style={{
              background: "radial-gradient(ellipse 80% 60% at 50% 65%, rgba(236,78,2,0.15) 0%, transparent 70%)",
              opacity: isHovered ? 1 : 0.7,
            }}
          />

          <div className="relative z-10 px-10 max-w-sm mx-auto text-center flex flex-col items-center gap-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/5 px-4 py-1.5 text-xs font-medium text-black/60 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
              </span>
              Live Operations
            </div>

            {/* Headline */}
            <h2 className="font-serif text-4xl font-medium tracking-tight text-black leading-[1.1]">
              Your orders,<br />
              <span className="text-black/50">delivered precisely.</span>
            </h2>

            {/* Description */}
            <p className="text-black/45 text-sm leading-relaxed">
              Real-time intelligence across every order, product, and courier — all in one place.
            </p>

            {/* CTA */}
            <button
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black text-white border border-black/10 px-7 text-sm font-medium transition-all duration-300 hover:bg-black/80 active:scale-95"
              onClick={() => window.scrollTo({ top: 0 })}
            >
              <span>Get Started</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
