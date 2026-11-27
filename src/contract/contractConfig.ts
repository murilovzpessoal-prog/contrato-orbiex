import type {
  ContractClause,
  ContractFields,
  ContractTheme,
  SignatureFontId,
  SignaturePayload,
  SignedContractRecord,
  StrokePoint,
} from './types';

export const ALPINE_BRAND = {
  name: 'Alpine Project',
  tagline: 'Acompanhamento Individual & Parceria de Resultados',
  website: 'https://www.projectalpine.com.br',
  websiteDisplay: 'projectalpine.com.br',
  logoUrl: '/assets/login/alpine-logo.png',
  wordmarkUrl: '/assets/login/alpine-wordmark.png',
  faviconUrl: '/assets/selected/alpine-icon-transparent.png',
  defaultRepresentative: 'Murilo Vaz',
  defaultRepresentativeRole: 'Fundador • Alpine Project',
  defaultWhatsapp: 'https://www.contate.me/suportemvz',
};

export const SIGNATURE_FONTS: Record<
  SignatureFontId,
  { label: string; cssFamily: string; canvasFont: string }
> = {
  vibes: {
    label: 'Executiva',
    cssFamily: '"Great Vibes", cursive',
    canvasFont: '"Great Vibes", Georgia, serif',
  },
  allura: {
    label: 'Clássica',
    cssFamily: '"Allura", cursive',
    canvasFont: '"Allura", Georgia, serif',
  },
  dancing: {
    label: 'Moderna',
    cssFamily: '"Dancing Script", cursive',
    canvasFont: '"Dancing Script", Georgia, serif',
  },
};

export function createProtocolCode(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const suffix =
    letters[Math.floor(Math.random() * letters.length)] +
    letters[Math.floor(Math.random() * letters.length)];
  return `ALP-CTR-${digits}-${suffix}`;
}

export function getDefaultContractFields(): ContractFields {
  return {
    protocolCode: createProtocolCode(),
    clientName: '',
    durationLabel: '3 meses',
    revenueSharePercent: '20%',
    representativeName: ALPINE_BRAND.defaultRepresentative,
    representativeRole: ALPINE_BRAND.defaultRepresentativeRole,
    whatsappTarget: ALPINE_BRAND.defaultWhatsapp,
    customNotes: '',
  };
}

export function buildContractClauses(fields: ContractFields): ContractClause[] {
  const duration = fields.durationLabel.trim() || '3 meses';
  const share = fields.revenueSharePercent.trim() || '20%';

  return [
    {
      number: '01',
      title: 'DO OBJETO E ACOMPANHAMENTO INDIVIDUAL',
      body: `A Alpine Project prestará acompanhamento individual, orientação estratégica e suporte prático ao(à) PARCEIRO(A) durante o período de ${duration}, com foco na estruturação e geração de resultados no projeto, sem qualquer cobrança de investimento inicial ou mensalidade fixa.`,
    },
    {
      number: '02',
      title: `DA PARTICIPAÇÃO DE ${share.toUpperCase()} SOBRE OS RESULTADOS`,
      body: `Em contrapartida ao acompanhamento individual prestado sem custo inicial, o(a) PARCEIRO(A) compromete-se expressamente a repassar à Alpine Project o percentual fixo de ${share} sobre todos os resultados financeiros gerados por meio da operação acompanhada durante os ${duration} de vigência desta parceria.`,
    },
    {
      number: '03',
      title: 'DA TRANSPARÊNCIA E PRAZO DE REPASSE',
      body: `O(A) PARCEIRO(A) compromete-se a agir com total transparência, compartilhando os relatórios e comprovantes de resultados da operação sempre que solicitado e realizando o pagamento dos ${share} devidos ao final de cada ciclo mensal (ou a cada saque efetuado), conforme alinhado diretamente entre as partes.`,
    },
    {
      number: '04',
      title: 'DO COMPROMETIMENTO E CONFIDENCIALIDADE',
      body: `O(A) PARCEIRO(A) compromete-se a executar o direcionamento com dedicação e manter sigilo absoluto sobre os métodos, estratégias, criativos e ferramentas exclusivas da Alpine Project, sendo vedado o repasse ou compartilhamento do conteúdo com terceiros.`,
    },
    {
      number: '05',
      title: 'DO DESCUMPRIMENTO E VALIDADE DA ASSINATURA DIGITAL',
      body: `O não repasse do percentual de ${share} acordado sobre os resultados obtidos configura descumprimento contratual, resultando no encerramento imediato do acompanhamento e na exigibilidade integral dos valores pendentes. As partes reconhecem plena validade a este contrato firmado digitalmente, autenticado por protocolo único, data/hora e hash SHA-256.`,
    },
  ];
}

export function formatDateTimeBR(iso: string): string {
  try {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} às ${timePart}`;
  } catch {
    return iso;
  }
}

export function formatShortDateBR(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export async function computeVerificationHash(
  fields: ContractFields,
  signedAtIso: string,
  signature: SignaturePayload
): Promise<string> {
  const raw = JSON.stringify({
    p: fields.protocolCode,
    n: fields.clientName,
    dur: fields.durationLabel,
    pct: fields.revenueSharePercent,
    t: signedAtIso,
    m: signature.mode,
    s: signature.mode === 'type' ? signature.typedText : (signature.strokes?.length || 0),
  });

  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoded = new TextEncoder().encode(raw);
      const buf = await crypto.subtle.digest('SHA-256', encoded);
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      return `${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;
    }
  } catch {
    /* fallback below */
  }

  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  return `${part1}-${part2}-ALPINE26`;
}

// ── Compact URL Serialization for Shareable Signed Contracts ──
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function packStrokes(strokes: StrokePoint[][]): string {
  const totalPoints = strokes.reduce((acc, s) => acc + s.length, 0);
  const stride = totalPoints > 180 ? Math.ceil(totalPoints / 180) : 1;

  return strokes
    .map((stroke) => {
      const kept: StrokePoint[] = [];
      for (let i = 0; i < stroke.length; i++) {
        if (i === 0 || i === stroke.length - 1 || i % stride === 0) {
          kept.push(stroke[i]);
        }
      }
      return kept
        .map((pt) => {
          const qx = Math.max(0, Math.min(250, Math.round(pt.x * 250)));
          const qy = Math.max(0, Math.min(100, Math.round(pt.y * 100)));
          return `${qx.toString(36)}.${qy.toString(36)}`;
        })
        .join(',');
    })
    .filter(Boolean)
    .join(';');
}

function unpackStrokes(packed: string): StrokePoint[][] {
  if (!packed) return [];
  return packed
    .split(';')
    .map((segment) =>
      segment
        .split(',')
        .map((pair) => {
          const [xs, ys] = pair.split('.');
          const qx = parseInt(xs, 36);
          const qy = parseInt(ys, 36);
          if (Number.isNaN(qx) || Number.isNaN(qy)) return null;
          return { x: qx / 250, y: qy / 100 };
        })
        .filter((p): p is StrokePoint => p !== null)
    )
    .filter((s) => s.length > 0);
}

interface CompactWireRecord {
  v: 2;
  pr: string;
  cn: string;
  du: string;
  pc: string;
  rn: string;
  rr: string;
  wa: string;
  nt: string;
  sm: 'd' | 't';
  st?: string;
  tt?: string;
  sf?: SignatureFontId;
  th: ContractTheme;
  dt: string;
  hs: string;
}

export function encodeSignedRecordToHash(record: SignedContractRecord): string {
  const wire: CompactWireRecord = {
    v: 2,
    pr: record.fields.protocolCode,
    cn: record.fields.clientName,
    du: record.fields.durationLabel,
    pc: record.fields.revenueSharePercent,
    rn: record.fields.representativeName,
    rr: record.fields.representativeRole,
    wa: record.fields.whatsappTarget,
    nt: record.fields.customNotes,
    sm: record.signature.mode === 'draw' ? 'd' : 't',
    st: record.signature.strokes ? packStrokes(record.signature.strokes) : undefined,
    tt: record.signature.typedText,
    sf: record.signature.fontId,
    th: record.theme,
    dt: record.signedAtIso,
    hs: record.verificationHash,
  };
  return toBase64Url(JSON.stringify(wire));
}

export function decodeSignedRecordFromHash(encoded: string): SignedContractRecord | null {
  try {
    const raw = fromBase64Url(encoded.trim());
    const wire = JSON.parse(raw) as Partial<CompactWireRecord>;
    if (!wire || !wire.pr || !wire.cn) return null;

    const defaults = getDefaultContractFields();
    return {
      version: 2,
      fields: {
        protocolCode: wire.pr,
        clientName: wire.cn,
        durationLabel: wire.du || defaults.durationLabel,
        revenueSharePercent: wire.pc || defaults.revenueSharePercent,
        representativeName: wire.rn || defaults.representativeName,
        representativeRole: wire.rr || defaults.representativeRole,
        whatsappTarget: wire.wa || defaults.whatsappTarget,
        customNotes: wire.nt || '',
      },
      signature: {
        mode: wire.sm === 'd' ? 'draw' : 'type',
        strokes: wire.st ? unpackStrokes(wire.st) : undefined,
        typedText: wire.tt,
        fontId: wire.sf || 'vibes',
      },
      theme: wire.th === 'light' ? 'light' : 'dark',
      signedAtIso: wire.dt || new Date().toISOString(),
      verificationHash: wire.hs || 'ALPINE-VERIFIED',
    };
  } catch {
    return null;
  }
}

export function buildPrefillLink(baseOriginAndPath: string, fields: Partial<ContractFields>): string {
  const url = new URL(baseOriginAndPath);
  const p = url.searchParams;
  const defaults = getDefaultContractFields();
  p.set('assinar', '1');
  if (fields.clientName?.trim()) p.set('nome', fields.clientName.trim());
  if (fields.durationLabel?.trim() && fields.durationLabel.trim() !== defaults.durationLabel) {
    p.set('prazo', fields.durationLabel.trim());
  }
  if (
    fields.revenueSharePercent?.trim() &&
    fields.revenueSharePercent.trim() !== defaults.revenueSharePercent
  ) {
    p.set('pct', fields.revenueSharePercent.trim());
  }
  if (
    fields.representativeName?.trim() &&
    fields.representativeName.trim() !== defaults.representativeName
  ) {
    p.set('rep', fields.representativeName.trim());
  }
  if (
    fields.representativeRole?.trim() &&
    fields.representativeRole.trim() !== defaults.representativeRole
  ) {
    p.set('cargo', fields.representativeRole.trim());
  }
  if (
    fields.whatsappTarget?.trim() &&
    fields.whatsappTarget.trim() !== defaults.whatsappTarget
  ) {
    p.set('wa', fields.whatsappTarget.trim());
  }
  if (fields.customNotes?.trim()) p.set('obs', fields.customNotes.trim());
  return url.toString();
}

const ISSUER_PREFS_KEY = 'alpine_contract_issuer_prefs_v1';

export interface IssuerPrefs {
  representativeName?: string;
  representativeRole?: string;
  whatsappTarget?: string;
}

export function loadIssuerPrefs(): IssuerPrefs {
  try {
    const raw = localStorage.getItem(ISSUER_PREFS_KEY);
    return raw ? (JSON.parse(raw) as IssuerPrefs) : {};
  } catch {
    return {};
  }
}

export function saveIssuerPrefs(prefs: IssuerPrefs): void {
  try {
    localStorage.setItem(ISSUER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function buildSignedShareUrl(
  record: SignedContractRecord,
  cloudProtocolId?: string
): string {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}${window.location.pathname}`;
  const encoded = encodeSignedRecordToHash(record);
  const query = cloudProtocolId ? `?c=${encodeURIComponent(cloudProtocolId)}` : '';
  return `${base}${query}#assinado=${encoded}`;
}

export function buildWhatsAppConfirmationUrl(
  record: SignedContractRecord,
  shareUrl: string
): string {
  const rawTarget = (record.fields.whatsappTarget || ALPINE_BRAND.defaultWhatsapp).trim();
  const message =
    `Fala! Acabei de assinar o *Contrato de Parceria — Alpine Project* ✅\n\n` +
    `• *Parceiro(a):* ${record.fields.clientName}\n` +
    `• *Acordo:* Acompanhamento de ${record.fields.durationLabel} • ${record.fields.revenueSharePercent} dos resultados\n` +
    `• *Protocolo:* ${record.fields.protocolCode}\n\n` +
    `Link para você abrir e baixar a imagem do contrato assinado:\n${shareUrl}`;

  if (/^https?:\/\//i.test(rawTarget)) {
    if (rawTarget.includes('wa.me') || rawTarget.includes('api.whatsapp.com')) {
      const sep = rawTarget.includes('?') ? '&' : '?';
      return `${rawTarget}${sep}text=${encodeURIComponent(message)}`;
    }
    return rawTarget;
  }

  const digits = rawTarget.replace(/\D/g, '');
  if (digits.length >= 10) {
    const withDdi = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${withDdi}?text=${encodeURIComponent(message)}`;
  }

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

const LOCAL_HISTORY_KEY = 'alpine_signed_contracts_history_v2';

export function loadLocalContractHistory(): SignedContractRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SignedContractRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalContractHistory(record: SignedContractRecord): SignedContractRecord[] {
  try {
    const existing = loadLocalContractHistory().filter(
      (item) => item.fields.protocolCode !== record.fields.protocolCode
    );
    const updated = [record, ...existing].slice(0, 40);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [record];
  }
}

export function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
