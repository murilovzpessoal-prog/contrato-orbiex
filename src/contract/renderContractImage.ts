import {
  ALPINE_BRAND,
  SIGNATURE_FONTS,
  buildContractClauses,
  formatDateTimeBR,
  formatShortDateBR,
} from './contractConfig';
import { drawStrokesOnContext, resolveInkHex } from './SignaturePad';
import type { ContractTheme, SignedContractRecord } from './types';

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawAlpineVectorEmblem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  variant: 'dark-paper' | 'engraved-gold' | 'watermark-dark' | 'watermark-light'
) {
  ctx.save();
  ctx.translate(x, y);
  const scale = size / 100;
  ctx.scale(scale, scale);

  const fillPoly = (pts: [number, number][], fillStyle: string | CanvasGradient) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  };

  let leftBright: string | CanvasGradient;
  let leftBevel: string | CanvasGradient;
  let rightDark: string | CanvasGradient;
  let subLight: string | CanvasGradient;
  let subGold: string | CanvasGradient;

  if (variant === 'watermark-dark') {
    leftBright = 'rgba(255,255,255,0.022)';
    leftBevel = 'rgba(200,171,93,0.028)';
    rightDark = 'rgba(255,255,255,0.012)';
    subLight = 'rgba(255,255,255,0.018)';
    subGold = 'rgba(200,171,93,0.024)';
  } else if (variant === 'watermark-light') {
    leftBright = 'rgba(20,23,31,0.028)';
    leftBevel = 'rgba(143,114,43,0.036)';
    rightDark = 'rgba(20,23,31,0.015)';
    subLight = 'rgba(20,23,31,0.022)';
    subGold = 'rgba(143,114,43,0.03)';
  } else if (variant === 'engraved-gold') {
    const g1 = ctx.createLinearGradient(12, 84, 50, 19);
    g1.addColorStop(0, '#a8893c');
    g1.addColorStop(0.55, '#e8d49c');
    g1.addColorStop(1, '#faf2d8');
    leftBright = g1;
    leftBevel = '#997a2e';
    rightDark = '#6b5520';
    subLight = '#dfca8b';
    subGold = '#8e712a';
  } else {
    const g1 = ctx.createLinearGradient(12, 84, 50, 19);
    g1.addColorStop(0, '#1a1e28');
    g1.addColorStop(0.6, '#323847');
    g1.addColorStop(1, '#0e1016');
    leftBright = g1;
    leftBevel = '#9e8034';
    rightDark = '#4b5160';
    subLight = '#222734';
    subGold = '#96772c';
  }

  fillPoly(
    [
      [4, 86],
      [50, 18],
      [50, 36.5],
      [26, 68],
    ],
    leftBright
  );
  fillPoly(
    [
      [4, 86],
      [26, 68],
      [28.5, 71.5],
    ],
    leftBevel
  );
  fillPoly(
    [
      [50, 18],
      [67.5, 43],
      [61.5, 52.5],
      [50, 36.5],
    ],
    rightDark
  );
  fillPoly(
    [
      [26.5, 84],
      [50, 50],
      [50, 60.5],
    ],
    subLight
  );
  fillPoly(
    [
      [50, 50],
      [58.8, 61.5],
      [58, 73.5],
      [50, 60.5],
    ],
    subGold
  );
  fillPoly(
    [
      [58.8, 61.5],
      [71.5, 45],
      [71.5, 58.5],
      [58, 73.5],
    ],
    subLight
  );
  fillPoly(
    [
      [71.5, 45],
      [96.5, 85.5],
      [71.5, 58.5],
    ],
    rightDark
  );
  fillPoly(
    [
      [71.5, 58.5],
      [96.5, 85.5],
      [78, 71],
    ],
    subGold
  );

  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface RenderedContractImage {
  blob: Blob;
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
}

/**
 * High-DPI Swiss Editorial / Private-Banking Executive Contract Renderer (1600px wide)
 * Uses clean hairlines, editorial serif headings, formal 3-column term sheet ledger,
 * continuous legal typography (no bubbly SaaS cards), and an understated engraved Alpine seal.
 */
export async function renderContractToPng(
  record: SignedContractRecord,
  overrideTheme?: ContractTheme
): Promise<RenderedContractImage> {
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    /* ignore */
  }

  const theme: ContractTheme = overrideTheme || record.theme || 'dark';
  const isLight = theme === 'light';
  const { fields, signature, signedAtIso, verificationHash } = record;
  const clauses = buildContractClauses(fields);

  const [logoImg, wordmarkImg] = await Promise.all([
    loadImageSafe(ALPINE_BRAND.logoUrl),
    loadImageSafe(ALPINE_BRAND.wordmarkUrl),
  ]);

  const W = 1600;
  const PAD_X = 128;
  const INNER_W = W - PAD_X * 2;

  const p = isLight
    ? {
        bg: '#fbf9f4',
        frameOuter: 'rgba(20, 23, 31, 0.14)',
        frameInner: 'rgba(143, 114, 43, 0.24)',
        accent: '#8f722b',
        accentSoft: 'rgba(143, 114, 43, 0.06)',
        ink: '#12151d',
        body: '#3b404c',
        muted: '#747a87',
        rule: 'rgba(20, 23, 31, 0.12)',
        ruleStrong: 'rgba(20, 23, 31, 0.22)',
        subtleBand: 'rgba(20, 23, 31, 0.025)',
        verified: '#0f766e',
      }
    : {
        bg: '#09090d',
        frameOuter: 'rgba(255, 255, 255, 0.10)',
        frameInner: 'rgba(200, 171, 93, 0.22)',
        accent: '#c8ab5d',
        accentSoft: 'rgba(200, 171, 93, 0.055)',
        ink: '#f5f6f8',
        body: '#b4b9c5',
        muted: '#737988',
        rule: 'rgba(255, 255, 255, 0.09)',
        ruleStrong: 'rgba(200, 171, 93, 0.32)',
        subtleBand: 'rgba(255, 255, 255, 0.022)',
        verified: '#34d399',
      };

  // Pre-measure clauses using refined two-column legal layout
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;
  const clauseLeftColW = 132;
  const clauseBodyMaxW = INNER_W - clauseLeftColW;

  mctx.font = '400 21px "Plus Jakarta Sans", "Inter", sans-serif';
  const wrappedClauses = clauses.map((c) => ({
    ...c,
    lines: wrapText(mctx, c.body, clauseBodyMaxW),
  }));

  const clausesBlockHeight = wrappedClauses.reduce(
    (sum, c) => sum + 36 + c.lines.length * 33 + 38,
    0
  );

  const hasCustomNotes = Boolean(fields.customNotes.trim());
  const notesLines = hasCustomNotes
    ? wrapText(mctx, fields.customNotes.trim(), clauseBodyMaxW)
    : [];
  const notesHeight = hasCustomNotes ? 44 + notesLines.length * 32 + 40 : 0;

  // Dynamic height calculation
  const LETTERHEAD_H = 220;
  const TITLE_H = 195;
  const LEDGER_H = 152;
  const PARTIES_H = 128;
  const CLAUSES_HEADER_H = 56;
  const SIGNATURES_H = 345;
  const FOOTER_H = 155;

  const H =
    LETTERHEAD_H +
    TITLE_H +
    LEDGER_H +
    PARTIES_H +
    CLAUSES_HEADER_H +
    clausesBlockHeight +
    notesHeight +
    SIGNATURES_H +
    FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 1. Matte Architectural Surface
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle top editorial light wash
  const topWash = ctx.createRadialGradient(W / 2, 0, 50, W / 2, 0, 900);
  topWash.addColorStop(0, isLight ? 'rgba(143,114,43,0.055)' : 'rgba(200,171,93,0.07)');
  topWash.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topWash;
  ctx.fillRect(0, 0, W, 620);

  // 2. Crisp Architectural Double Hairline Frame (sharp luxury corners)
  ctx.strokeStyle = p.frameOuter;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  ctx.strokeStyle = p.frameInner;
  ctx.lineWidth = 1;
  ctx.strokeRect(60, 60, W - 120, H - 120);

  // 3. Whisper-quiet centered Alpine watermark
  drawAlpineVectorEmblem(
    ctx,
    W / 2 - 340,
    H * 0.44 - 340,
    680,
    isLight ? 'watermark-light' : 'watermark-dark'
  );

  // 4. OFFICIAL LETTERHEAD (PAPEL TIMBRADO)
  let y = 112;
  if (!isLight && logoImg) {
    const logoH = 62;
    const logoW = (logoImg.width / logoImg.height) * logoH;
    ctx.drawImage(logoImg, PAD_X, y, logoW, logoH);

    if (wordmarkImg) {
      const wmH = 31;
      const wmW = (wordmarkImg.width / wordmarkImg.height) * wmH;
      ctx.drawImage(wordmarkImg, PAD_X + logoW + 18, y + (logoH - wmH) / 2 + 2, wmW, wmH);
    }
  } else {
    drawAlpineVectorEmblem(ctx, PAD_X, y + 2, 60, isLight ? 'dark-paper' : 'engraved-gold');
    ctx.textAlign = 'left';
    ctx.fillStyle = p.ink;
    ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('ALPINE', PAD_X + 76, y + 34);
    ctx.fillStyle = p.accent;
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('P  R  O  J  E  C  T', PAD_X + 78, y + 55);
  }

  // Right Letterhead Metadata Block (Swiss alignment)
  ctx.textAlign = 'right';
  ctx.fillStyle = p.verified;
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillText('●  AUTENTICADO DIGITALMENTE', W - PAD_X, y + 18);

  ctx.fillStyle = p.ink;
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillText(`INSTRUMENTO Nº ${fields.protocolCode}`, W - PAD_X, y + 44);

  ctx.fillStyle = p.muted;
  ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(ALPINE_BRAND.websiteDisplay.toUpperCase(), W - PAD_X, y + 66);

  // Razor-thin top letterhead separator
  y += 96;
  ctx.strokeStyle = p.ruleStrong;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(PAD_X, y);
  ctx.lineTo(W - PAD_X, y);
  ctx.stroke();

  // 5. FORMAL EDITORIAL TITLE (Cormorant Garamond Serif)
  y += 62;
  ctx.textAlign = 'center';
  ctx.fillStyle = p.accent;
  ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('TERMO DE PARCERIA E ACOMPANHAMENTO INDIVIDUAL', W / 2, y);

  y += 58;
  ctx.fillStyle = p.ink;
  ctx.font = '600 54px "Cormorant Garamond", Georgia, serif';
  ctx.fillText('Contrato Digital — Alpine Project', W / 2, y);

  y += 38;
  ctx.fillStyle = p.muted;
  ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Celebrado e assinado eletronicamente em ${formatDateTimeBR(signedAtIso)}`,
    W / 2,
    y
  );

  // 6. ARCHITECTURAL 3-COLUMN TERM SHEET LEDGER (Zero bubble cards!)
  y += 46;
  const ledgerH = 114;
  ctx.fillStyle = p.subtleBand;
  ctx.fillRect(PAD_X, y, INNER_W, ledgerH);

  // Top & bottom crisp hairline rules
  ctx.strokeStyle = p.ruleStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_X, y);
  ctx.lineTo(W - PAD_X, y);
  ctx.moveTo(PAD_X, y + ledgerH);
  ctx.lineTo(W - PAD_X, y + ledgerH);
  ctx.stroke();

  // Vertical dividers
  const colW3 = INNER_W / 3;
  ctx.strokeStyle = p.rule;
  ctx.beginPath();
  ctx.moveTo(PAD_X + colW3, y + 20);
  ctx.lineTo(PAD_X + colW3, y + ledgerH - 20);
  ctx.moveTo(PAD_X + colW3 * 2, y + 20);
  ctx.lineTo(PAD_X + colW3 * 2, y + ledgerH - 20);
  ctx.stroke();

  const ledgerCols = [
    { label: 'INVESTIMENTO INICIAL', value: 'Isento (R$ 0,00)', sub: 'Sem taxa de adesão', accent: false },
    { label: 'VIGÊNCIA DO ACOMPANHAMENTO', value: fields.durationLabel || '3 meses', sub: 'Mentoria individual 1:1', accent: false },
    { label: 'PARTICIPAÇÃO ACORDADA', value: `${fields.revenueSharePercent || '20%'} dos resultados`, sub: 'Repasse sobre ganhos', accent: true },
  ];

  ledgerCols.forEach((col, i) => {
    const cx = PAD_X + colW3 * i + colW3 / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = col.accent ? p.accent : p.muted;
    ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(col.label, cx, y + 34);

    ctx.fillStyle = p.ink;
    ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(col.value, cx, y + 69, colW3 - 36);

    ctx.fillStyle = p.muted;
    ctx.font = '400 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(col.sub, cx, y + 95);
  });

  // 7. PARTIES IDENTIFICATION STRIP
  y += ledgerH + 34;
  const colW2 = INNER_W / 2;
  ctx.textAlign = 'left';

  ctx.fillStyle = p.accent;
  ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PARTE I — MENTORIA & OPERAÇÃO', PAD_X, y + 18);

  ctx.fillStyle = p.ink;
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Alpine Project', PAD_X, y + 52);

  ctx.fillStyle = p.muted;
  ctx.font = '400 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Representada por ${fields.representativeName || ALPINE_BRAND.defaultRepresentative}`,
    PAD_X,
    y + 78
  );

  // Right party
  const p2X = PAD_X + colW2 + 32;
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_X + colW2, y + 6);
  ctx.lineTo(PAD_X + colW2, y + 84);
  ctx.stroke();

  ctx.fillStyle = p.accent;
  ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PARTE II — PARCEIRO(A) ACOMPANHADO(A)', p2X, y + 18);

  ctx.fillStyle = p.ink;
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fields.clientName || 'Parceiro(a)', p2X, y + 52, colW2 - 40);

  ctx.fillStyle = p.muted;
  ctx.font = '400 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Acompanhamento Individual • Programa Alpine Project', p2X, y + 78);

  y += 108;
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_X, y);
  ctx.lineTo(W - PAD_X, y);
  ctx.stroke();

  // 8. CONTINUOUS EDITORIAL LEGAL CLAUSES (Swiss Two-Column Grid)
  y += 48;
  ctx.textAlign = 'left';
  ctx.fillStyle = p.accent;
  ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('DISPOSIÇÕES E CLÁUSULAS CONTRATUAIS', PAD_X, y);

  y += 42;
  for (let idx = 0; idx < wrappedClauses.length; idx++) {
    const clause = wrappedClauses[idx];

    // Left rail: Roman/numeric index
    ctx.fillStyle = p.accent;
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillText(`CLÁUSULA ${clause.number}`, PAD_X, y);

    // Right rail: Crisp title + legal body
    ctx.fillStyle = p.ink;
    ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(clause.title, PAD_X + clauseLeftColW, y);

    let ty = y + 30;
    ctx.fillStyle = p.body;
    ctx.font = '400 21px "Plus Jakarta Sans", "Inter", sans-serif';
    for (const line of clause.lines) {
      ctx.fillText(line, PAD_X + clauseLeftColW, ty);
      ty += 33;
    }

    y = ty + 14;
    if (idx < wrappedClauses.length - 1 || hasCustomNotes) {
      ctx.strokeStyle = p.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_X, y);
      ctx.lineTo(W - PAD_X, y);
      ctx.stroke();
      y += 28;
    }
  }

  // Optional custom clause
  if (hasCustomNotes) {
    ctx.fillStyle = p.accent;
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.fillText('ADITIVO', PAD_X, y);

    ctx.fillStyle = p.ink;
    ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('CONDIÇÕES ESPECÍFICAS ACORDADAS', PAD_X + clauseLeftColW, y);

    let ny = y + 30;
    ctx.fillStyle = p.body;
    ctx.font = '400 21px "Plus Jakarta Sans", "Inter", sans-serif';
    for (const line of notesLines) {
      ctx.fillText(line, PAD_X + clauseLeftColW, ny);
      ny += 32;
    }
    y = ny + 18;
  }

  // 9. SIGNATURES & UNDERSTATED ENGRAVED ALPINE CHANCELA SEAL
  y += 22;
  ctx.strokeStyle = p.ruleStrong;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(PAD_X, y);
  ctx.lineTo(W - PAD_X, y);
  ctx.stroke();

  const sigTop = y + 42;
  const sigBoxW = 460;
  const sigBoxH = 144;
  const leftX = PAD_X;
  const rightX = W - PAD_X - sigBoxW;

  // Left Signature: Murilo Vaz / Alpine Project
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = isLight ? '#14171f' : '#e8d49c';
  ctx.font = '400 60px "Great Vibes", Georgia, serif';
  ctx.fillText(
    fields.representativeName || ALPINE_BRAND.defaultRepresentative,
    leftX + sigBoxW / 2,
    sigTop + 98
  );
  ctx.restore();

  ctx.strokeStyle = p.ruleStrong;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(leftX + 20, sigTop + sigBoxH);
  ctx.lineTo(leftX + sigBoxW - 20, sigTop + sigBoxH);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = p.ink;
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    fields.representativeName || ALPINE_BRAND.defaultRepresentative,
    leftX + sigBoxW / 2,
    sigTop + sigBoxH + 32
  );
  ctx.fillStyle = p.muted;
  ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    fields.representativeRole || ALPINE_BRAND.defaultRepresentativeRole,
    leftX + sigBoxW / 2,
    sigTop + sigBoxH + 55
  );
  ctx.fillStyle = p.accent;
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillText('PARTE I • ASSINATURA OFICIAL', leftX + sigBoxW / 2, sigTop + sigBoxH + 80);

  // Center Seal: Understated Engraved Hairline Chancela (Ultra-refined, no bulky blob!)
  const sealCx = W / 2;
  const sealCy = sigTop + 114;
  const sealR = 76;

  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(sealCx, sealCy, sealR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = p.frameInner;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sealCx, sealCy, sealR - 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.setLineDash([2.5, 4]);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sealCx, sealCy, sealR - 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  drawAlpineVectorEmblem(
    ctx,
    sealCx - 24,
    sealCy - 40,
    48,
    isLight ? 'dark-paper' : 'engraved-gold'
  );

  ctx.textAlign = 'center';
  ctx.fillStyle = p.ink;
  ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ALPINE PROJECT', sealCx, sealCy + 24);
  ctx.fillStyle = p.accent;
  ctx.font = '600 9.5px "JetBrains Mono", monospace';
  ctx.fillText('CHANCELA DIGITAL', sealCx, sealCy + 40);

  // Right Signature: Client Signature
  const clientInk = resolveInkHex(theme);
  if (signature.mode === 'draw' && signature.strokes && signature.strokes.length > 0) {
    drawStrokesOnContext(
      ctx,
      signature.strokes,
      rightX + 16,
      sigTop + 4,
      sigBoxW - 32,
      sigBoxH - 10,
      clientInk,
      4.2
    );
  } else {
    const chosenFont = SIGNATURE_FONTS[signature.fontId || 'vibes'];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = clientInk;
    ctx.font = `400 60px ${chosenFont.canvasFont}`;
    const displaySig = signature.typedText?.trim() || fields.clientName || 'Assinatura';
    ctx.fillText(displaySig, rightX + sigBoxW / 2, sigTop + 98, sigBoxW - 32);
    ctx.restore();
  }

  ctx.strokeStyle = p.ruleStrong;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(rightX + 20, sigTop + sigBoxH);
  ctx.lineTo(rightX + sigBoxW - 20, sigTop + sigBoxH);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = p.ink;
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    fields.clientName || 'Parceiro(a)',
    rightX + sigBoxW / 2,
    sigTop + sigBoxH + 32
  );
  ctx.fillStyle = p.muted;
  ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    'Parceiro(a) • Alpine Project',
    rightX + sigBoxW / 2,
    sigTop + sigBoxH + 55
  );
  ctx.fillStyle = p.verified;
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillText(
    `PARTE II • ASSINADO EM ${formatShortDateBR(signedAtIso)}`,
    rightX + sigBoxW / 2,
    sigTop + sigBoxH + 80
  );

  // 10. AUDIT TRAIL FOOTER
  const footerY = H - FOOTER_H + 34;
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_X, footerY);
  ctx.lineTo(W - PAD_X, footerY);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = p.muted;
  ctx.font = '600 12.5px "JetBrains Mono", monospace';
  ctx.fillText(`SHA-256  ${verificationHash}`, PAD_X, footerY + 34);
  ctx.font = '400 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    'Documento eletrônico validado com integridade criptográfica e carimbo de data/hora.',
    PAD_X,
    footerY + 58
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = p.ink;
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillText(fields.protocolCode, W - PAD_X, footerY + 34);
  ctx.fillStyle = p.muted;
  ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(ALPINE_BRAND.websiteDisplay, W - PAD_X, footerY + 58);

  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem PNG.'))),
      'image/png',
      1.0
    );
  });

  const safeClient = (fields.clientName || 'parceiro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  const fileName = `Contrato-Alpine-Project-${safeClient || 'assinado'}-${fields.protocolCode}.png`;

  return {
    blob,
    dataUrl,
    fileName,
    width: W,
    height: H,
  };
}

export function triggerPngDownload(rendered: RenderedContractImage) {
  const url = URL.createObjectURL(rendered.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = rendered.fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
