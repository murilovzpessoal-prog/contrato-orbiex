import React, { useCallback, useEffect, useRef } from 'react';
import { PenTool, Type, Undo2, RotateCcw } from 'lucide-react';
import { SIGNATURE_FONTS } from './contractConfig';
import type {
  ContractTheme,
  SignatureFontId,
  SignatureMode,
  SignaturePayload,
  StrokePoint,
} from './types';

export function resolveInkHex(theme: ContractTheme): string {
  return theme === 'light' ? '#14171f' : '#e8d49c';
}

/**
 * Draws smooth fountain-pen strokes with subtle natural taper at stroke ends
 * and velocity-like thickness variation based on segment spacing.
 */
export function drawStrokesOnContext(
  ctx: CanvasRenderingContext2D,
  strokes: StrokePoint[][],
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  color: string,
  baseWidth: number
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;

    if (stroke.length === 1) {
      const p = stroke[0];
      ctx.beginPath();
      ctx.arc(boxX + p.x * boxW, boxY + p.y * boxH, baseWidth * 0.6, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    if (stroke.length === 2) {
      ctx.lineWidth = baseWidth * 0.9;
      ctx.beginPath();
      ctx.moveTo(boxX + stroke[0].x * boxW, boxY + stroke[0].y * boxH);
      ctx.lineTo(boxX + stroke[1].x * boxW, boxY + stroke[1].y * boxH);
      ctx.stroke();
      continue;
    }

    let prevWidth = baseWidth * 0.85;
    for (let i = 1; i < stroke.length - 1; i++) {
      const pPrev = stroke[i - 1];
      const pCurr = stroke[i];
      const pNext = stroke[i + 1];

      const x0 = boxX + ((pPrev.x + pCurr.x) / 2) * boxW;
      const y0 = boxY + ((pPrev.y + pCurr.y) / 2) * boxH;
      const cx = boxX + pCurr.x * boxW;
      const cy = boxY + pCurr.y * boxH;
      const x1 = boxX + ((pCurr.x + pNext.x) / 2) * boxW;
      const y1 = boxY + ((pCurr.y + pNext.y) / 2) * boxH;

      const dist = Math.hypot((pNext.x - pPrev.x) * boxW, (pNext.y - pPrev.y) * boxH);
      const speedFactor = Math.max(0.62, Math.min(1.18, 1.22 - dist / 46));
      const edgeTaper =
        i < 3 ? 0.72 + i * 0.1 : i > stroke.length - 4 ? 0.75 : 1;
      const targetWidth = baseWidth * speedFactor * edgeTaper;
      const smoothW = prevWidth * 0.6 + targetWidth * 0.4;
      prevWidth = smoothW;

      ctx.lineWidth = smoothW;
      ctx.beginPath();
      if (i === 1) {
        ctx.moveTo(boxX + pPrev.x * boxW, boxY + pPrev.y * boxH);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
      } else {
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
      }
      ctx.stroke();
    }

    // Smooth ending tail
    const penult = stroke[stroke.length - 2];
    const last = stroke[stroke.length - 1];
    ctx.lineWidth = Math.max(baseWidth * 0.55, prevWidth * 0.78);
    ctx.beginPath();
    ctx.moveTo(
      boxX + ((penult.x + last.x) / 2) * boxW,
      boxY + ((penult.y + last.y) / 2) * boxH
    );
    ctx.lineTo(boxX + last.x * boxW, boxY + last.y * boxH);
    ctx.stroke();
  }

  ctx.restore();
}

interface SignaturePadProps {
  value: SignaturePayload;
  onChange: (next: SignaturePayload) => void;
  theme: ContractTheme;
  defaultTypedName?: string;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  theme,
  defaultTypedName = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<StrokePoint[]>([]);
  const strokesRef = useRef<StrokePoint[][]>(value.strokes || []);

  useEffect(() => {
    strokesRef.current = value.strokes || [];
  }, [value.strokes]);

  const isLight = theme === 'light';
  const inkHex = resolveInkHex(theme);

  const redrawCanvas = useCallback(
    (overrideStrokes?: StrokePoint[][]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const list = overrideStrokes ?? strokesRef.current;
      drawStrokesOnContext(ctx, list, 0, 0, rect.width, rect.height, inkHex, 2.4);
      ctx.restore();
    },
    [inkHex]
  );

  useEffect(() => {
    if (value.mode !== 'draw') return;
    redrawCanvas();
    const handleResize = () => redrawCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [value.mode, value.strokes, inkHex, theme, redrawCanvas]);

  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (value.mode !== 'draw') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pt = getNormalizedPoint(e);
    activeStrokeRef.current = [pt];
    redrawCanvas([...strokesRef.current, activeStrokeRef.current]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || value.mode !== 'draw') return;
    e.preventDefault();
    const pt = getNormalizedPoint(e);
    const current = activeStrokeRef.current;
    const prev = current[current.length - 1];
    if (prev) {
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      if (dx * dx + dy * dy < 0.000016) return;
    }
    current.push(pt);
    redrawCanvas([...strokesRef.current, current]);
  };

  const finishStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (activeStrokeRef.current.length > 0) {
      const nextStrokes = [...strokesRef.current, activeStrokeRef.current];
      strokesRef.current = nextStrokes;
      activeStrokeRef.current = [];
      onChange({
        ...value,
        mode: 'draw',
        strokes: nextStrokes,
      });
    }
  };

  const handleUndo = () => {
    const nextStrokes = (value.strokes || []).slice(0, -1);
    strokesRef.current = nextStrokes;
    onChange({ ...value, strokes: nextStrokes });
  };

  const handleClear = () => {
    strokesRef.current = [];
    activeStrokeRef.current = [];
    if (value.mode === 'draw') {
      onChange({ ...value, strokes: [] });
    } else {
      onChange({ ...value, typedText: '' });
    }
  };

  const setMode = (mode: SignatureMode) => {
    onChange({
      ...value,
      mode,
      typedText:
        mode === 'type' && !value.typedText?.trim() && defaultTypedName.trim()
          ? defaultTypedName.trim()
          : value.typedText,
      fontId: value.fontId || 'vibes',
    });
  };

  const hasDrawn = (value.strokes?.length || 0) > 0;
  const activeFont = SIGNATURE_FONTS[value.fontId || 'vibes'];

  return (
    <div className="space-y-3">
      {/* Minimal editorial control bar */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={`inline-flex rounded-lg p-0.5 border ${
            isLight
              ? 'border-stone-300/90 bg-stone-100/80'
              : 'border-white/[0.09] bg-white/[0.03]'
          }`}
        >
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11.5px] font-medium transition cursor-pointer ${
              value.mode === 'draw'
                ? isLight
                  ? 'bg-[#14171f] text-white'
                  : 'bg-white text-black'
                : isLight
                ? 'text-stone-600 hover:text-stone-900'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <PenTool size={11} />
            <span>Manuscrita</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('type')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[11.5px] font-medium transition cursor-pointer ${
              value.mode === 'type'
                ? isLight
                  ? 'bg-[#14171f] text-white'
                  : 'bg-white text-black'
                : isLight
                ? 'text-stone-600 hover:text-stone-900'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Type size={11} />
            <span>Tipográfica</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {value.mode === 'draw' && hasDrawn && (
            <button
              type="button"
              onClick={handleUndo}
              className={`inline-flex items-center gap-1 text-[11px] font-medium transition cursor-pointer ${
                isLight
                  ? 'text-stone-500 hover:text-stone-900'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Undo2 size={11} />
              <span>Desfazer</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClear}
            className={`inline-flex items-center gap-1 text-[11px] font-medium transition cursor-pointer ${
              isLight
                ? 'text-stone-500 hover:text-stone-900'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <RotateCcw size={11} />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Draw Surface OR Typed Calligraphy */}
      {value.mode === 'draw' ? (
        <div
          className={`relative h-[156px] sm:h-[168px] w-full overflow-hidden rounded-xl border transition ${
            isLight
              ? 'border-stone-300 bg-[#fdfcf9]'
              : 'border-white/[0.11] bg-[#070709]'
          }`}
        >
          {/* Baseline hairline */}
          <div
            className={`pointer-events-none absolute bottom-7 left-7 right-7 flex items-end gap-2 border-b ${
              isLight ? 'border-stone-300/90' : 'border-white/[0.12]'
            }`}
          >
            <span
              className={`pb-0.5 text-[11px] font-serif italic select-none ${
                isLight ? 'text-stone-400' : 'text-white/25'
              }`}
            >
              ×
            </span>
          </div>

          {!hasDrawn && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center select-none">
              <span
                className={`text-[12.5px] font-normal ${
                  isLight ? 'text-stone-400' : 'text-zinc-500'
                }`}
              >
                Assine sobre a linha utilizando o dedo ou mouse
              </span>
            </div>
          )}

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            style={{ touchAction: 'none' }}
            className="relative z-10 h-full w-full cursor-crosshair block"
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          <input
            type="text"
            value={value.typedText || ''}
            onChange={(e) => onChange({ ...value, typedText: e.target.value })}
            placeholder="Digite seu nome para assinar..."
            className={`h-10 w-full rounded-lg border px-3.5 text-[13.5px] transition focus:outline-none ${
              isLight
                ? 'border-stone-300 bg-white text-stone-900 placeholder-stone-400 focus:border-[#8f722b]'
                : 'border-white/12 bg-black/50 text-white placeholder-zinc-500 focus:border-[#c8ab5d]/70'
            }`}
          />

          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(SIGNATURE_FONTS) as SignatureFontId[]).map((fid) => {
              const font = SIGNATURE_FONTS[fid];
              const isSelected = (value.fontId || 'vibes') === fid;
              return (
                <button
                  key={fid}
                  type="button"
                  onClick={() => onChange({ ...value, fontId: fid })}
                  className={`rounded-lg border px-2 py-2 text-center transition cursor-pointer ${
                    isSelected
                      ? isLight
                        ? 'border-[#8f722b] bg-[#8f722b]/[0.07] text-stone-900'
                        : 'border-[#c8ab5d]/70 bg-[#c8ab5d]/[0.08] text-white'
                      : isLight
                      ? 'border-stone-200 bg-stone-50/70 text-stone-600 hover:border-stone-300'
                      : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <span
                    className="block truncate text-[21px] leading-none"
                    style={{ fontFamily: font.cssFamily, color: inkHex }}
                  >
                    {value.typedText?.trim() || defaultTypedName.trim() || 'Assinatura'}
                  </span>
                  <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.14em] opacity-60">
                    {font.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={`relative flex h-[92px] w-full items-center justify-center rounded-xl border px-4 ${
              isLight
                ? 'border-stone-300 bg-[#fdfcf9]'
                : 'border-white/[0.11] bg-[#070709]'
            }`}
          >
            <div
              className={`pointer-events-none absolute bottom-4 left-7 right-7 border-b ${
                isLight ? 'border-stone-300/90' : 'border-white/[0.12]'
              }`}
            />
            <span
              className="relative z-10 max-w-full truncate text-[36px] sm:text-[42px] leading-none"
              style={{ fontFamily: activeFont.cssFamily, color: inkHex }}
            >
              {value.typedText?.trim() || 'Prévia da assinatura'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

interface SignaturePreviewProps {
  signature: SignaturePayload;
  theme: ContractTheme;
  className?: string;
}

export const SignaturePreview: React.FC<SignaturePreviewProps> = ({
  signature,
  theme,
  className = 'h-24 w-full',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkHex = resolveInkHex(theme);

  useEffect(() => {
    if (signature.mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    drawStrokesOnContext(
      ctx,
      signature.strokes || [],
      0,
      0,
      rect.width,
      rect.height,
      inkHex,
      2.35
    );
  }, [signature, inkHex, theme]);

  if (signature.mode === 'type') {
    const font = SIGNATURE_FONTS[signature.fontId || 'vibes'];
    return (
      <div className={`flex items-center justify-center overflow-hidden px-2 ${className}`}>
        <span
          className="max-w-full truncate text-[36px] sm:text-[42px] leading-none"
          style={{ fontFamily: font.cssFamily, color: inkHex }}
        >
          {signature.typedText}
        </span>
      </div>
    );
  }

  return <canvas ref={canvasRef} className={`block ${className}`} />;
};
