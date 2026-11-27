import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Link2,
  MessageCircle,
  Moon,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';
import {
  ALPINE_BRAND,
  buildContractClauses,
  buildPrefillLink,
  buildSignedShareUrl,
  buildWhatsAppConfirmationUrl,
  computeVerificationHash,
  copyTextToClipboard,
  createProtocolCode,
  decodeSignedRecordFromHash,
  formatDateTimeBR,
  formatShortDateBR,
  getDefaultContractFields,
  loadIssuerPrefs,
  loadLocalContractHistory,
  saveIssuerPrefs,
  saveLocalContractHistory,
} from './contractConfig';
import { SignaturePad, SignaturePreview } from './SignaturePad';
import {
  renderContractToPng,
  triggerPngDownload,
  type RenderedContractImage,
} from './renderContractImage';
import type {
  ContractFields,
  ContractTheme,
  SignaturePayload,
  SignedContractRecord,
} from './types';

function AlpineVectorLogoSvg({
  className = 'h-9 w-9',
  darkInk = false,
}: {
  className?: string;
  darkInk?: boolean;
}) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="alpProLeft" x1="12" y1="84" x2="50" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={darkInk ? '#1a1e28' : '#cfd3da'} />
          <stop offset="55%" stopColor={darkInk ? '#323847' : '#f4f5f7'} />
          <stop offset="100%" stopColor={darkInk ? '#0e1016' : '#f7eccb'} />
        </linearGradient>
        <linearGradient id="alpProGold" x1="6" y1="85" x2="55" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8f722b" />
          <stop offset="55%" stopColor="#c8ab5d" />
          <stop offset="100%" stopColor="#efe0b1" />
        </linearGradient>
        <linearGradient id="alpProDark" x1="50" y1="19" x2="66" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={darkInk ? '#4b5160' : '#cdd1da'} />
          <stop offset="45%" stopColor={darkInk ? '#374151' : '#646b7a'} />
          <stop offset="100%" stopColor={darkInk ? '#1f2430' : '#353a46'} />
        </linearGradient>
      </defs>
      <polygon points="4,86 50,18 50,36.5 26,68" fill="url(#alpProLeft)" />
      <polygon points="4,86 26,68 28.5,71.5" fill="url(#alpProGold)" />
      <polygon points="50,18 67.5,43 61.5,52.5 50,36.5" fill="url(#alpProDark)" />
      <polygon points="26.5,84 50,50 50,60.5" fill="url(#alpProLeft)" />
      <polygon points="50,50 58.8,61.5 58,73.5 50,60.5" fill="url(#alpProGold)" />
      <polygon points="58.8,61.5 71.5,45 71.5,58.5 58,73.5" fill="url(#alpProLeft)" />
      <polygon points="71.5,45 96.5,85.5 71.5,58.5" fill="url(#alpProDark)" />
      <polygon points="71.5,58.5 96.5,85.5 78,71" fill="url(#alpProGold)" />
    </svg>
  );
}

function parseInitialParams(): {
  query: URLSearchParams;
  hashSignedRecord: SignedContractRecord | null;
  cloudId: string;
  isClientSignLink: boolean;
} {
  if (typeof window === 'undefined') {
    return {
      query: new URLSearchParams(),
      hashSignedRecord: null,
      cloudId: '',
      isClientSignLink: false,
    };
  }
  const query = new URLSearchParams(window.location.search);
  const hash = window.location.hash || '';
  let hashSignedRecord: SignedContractRecord | null = null;
  const match = hash.match(/assinado=([^&]+)/);
  if (match && match[1]) {
    hashSignedRecord = decodeSignedRecordFromHash(decodeURIComponent(match[1]));
  }
  const cloudId = (query.get('c') || '').trim();
  const isClientSignLink =
    query.get('assinar') === '1' ||
    Boolean(query.get('nome')) ||
    Boolean(query.get('cliente')) ||
    Boolean(hashSignedRecord) ||
    Boolean(cloudId);

  return { query, hashSignedRecord, cloudId, isClientSignLink };
}

function buildFieldsFromQuery(query: URLSearchParams, useSavedPrefs: boolean): ContractFields {
  const base = getDefaultContractFields();
  const saved = useSavedPrefs ? loadIssuerPrefs() : {};
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = query.get(k);
      if (v && v.trim()) return v.trim();
    }
    return '';
  };

  return {
    ...base,
    protocolCode: get('protocolo', 'proto') || base.protocolCode,
    clientName: get('nome', 'name', 'cliente') || '',
    durationLabel: get('prazo', 'meses', 'duracao') || base.durationLabel,
    revenueSharePercent: get('pct', 'porcentagem', 'comissao') || base.revenueSharePercent,
    representativeName:
      get('rep', 'representante') || saved.representativeName || base.representativeName,
    representativeRole:
      get('cargo') || saved.representativeRole || base.representativeRole,
    whatsappTarget:
      get('wa', 'retorno') || saved.whatsappTarget || base.whatsappTarget,
    customNotes: get('obs', 'notas') || '',
  };
}

export default function AlpineContractApp() {
  const initial = useMemo(() => parseInitialParams(), []);
  const topAnchorRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<ContractTheme>(
    initial.hashSignedRecord?.theme || 'dark'
  );
  const [fields, setFields] = useState<ContractFields>(() =>
    initial.hashSignedRecord
      ? initial.hashSignedRecord.fields
      : buildFieldsFromQuery(initial.query, !initial.isClientSignLink)
  );

  // Studio Sidebar (Emissor mode) is active when opened directly; hidden on client sign links (?assinar=1)
  const [studioOpen, setStudioOpen] = useState<boolean>(!initial.isClientSignLink);
  const [studioTab, setStudioTab] = useState<'config' | 'signed'>('config');

  const [signature, setSignature] = useState<SignaturePayload>(() =>
    initial.hashSignedRecord
      ? initial.hashSignedRecord.signature
      : {
          mode: 'draw',
          strokes: [],
          typedText: '',
          fontId: 'vibes',
        }
  );

  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(
    Boolean(initial.hashSignedRecord)
  );
  const [signedRecord, setSignedRecord] = useState<SignedContractRecord | null>(
    initial.hashSignedRecord
  );
  const [cloudSyncedId, setCloudSyncedId] = useState<string>(initial.cloudId);
  const [isLoadingCloud, setIsLoadingCloud] = useState<boolean>(
    Boolean(initial.cloudId && !initial.hashSignedRecord)
  );

  const [signing, setSigning] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [previewModal, setPreviewModal] = useState<RenderedContractImage | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedClientLink, setCopiedClientLink] = useState(false);

  const [pasteSignedUrl, setPasteSignedUrl] = useState('');
  const [historyList, setHistoryList] = useState<SignedContractRecord[]>(() =>
    loadLocalContractHistory()
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3000);
  }, []);

  // Auto-save representative & WhatsApp defaults
  useEffect(() => {
    if (!studioOpen) return;
    saveIssuerPrefs({
      representativeName: fields.representativeName,
      representativeRole: fields.representativeRole,
      whatsappTarget: fields.whatsappTarget,
    });
  }, [studioOpen, fields.representativeName, fields.representativeRole, fields.whatsappTarget]);

  // Inject luxury serif + cursive + sans fonts & official Alpine favicon
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Contrato Digital • Alpine Project';

    const fontLinkId = 'alpine-contract-fonts-pro';
    if (!document.getElementById(fontLinkId)) {
      const link = document.createElement('link');
      link.id = fontLinkId;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Allura&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Dancing+Script:wght@500;600;700&family=Great+Vibes&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(link);
    }

    const existingIcons = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]')
    );
    const savedIcons = existingIcons.map((el) => ({
      rel: el.getAttribute('rel') || 'icon',
      type: el.getAttribute('type'),
      href: el.getAttribute('href') || '',
    }));
    existingIcons.forEach((el) => el.remove());

    const freshIcon = document.createElement('link');
    freshIcon.rel = 'icon';
    freshIcon.type = 'image/png';
    freshIcon.href = ALPINE_BRAND.faviconUrl;
    document.head.appendChild(freshIcon);

    return () => {
      document.title = prevTitle;
      freshIcon.remove();
      savedIcons.forEach(({ rel, type, href }) => {
        const el = document.createElement('link');
        el.rel = rel;
        if (type) el.type = type;
        el.href = href;
        document.head.appendChild(el);
      });
    };
  }, []);

  useEffect(() => {
    if (!initial.cloudId || initial.hashSignedRecord) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/contracts?id=${encodeURIComponent(initial.cloudId)}`);
        if (res.ok) {
          const data = await res.json();
          if (active && data?.success && data?.record) {
            const rec = data.record as SignedContractRecord;
            setSignedRecord(rec);
            setFields(rec.fields);
            setSignature(rec.signature);
            setTheme(rec.theme || 'dark');
            setAcceptedTerms(true);
            setCloudSyncedId(rec.fields.protocolCode);
          }
        }
      } catch {
        /* fallback silently */
      } finally {
        if (active) setIsLoadingCloud(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [initial.cloudId, initial.hashSignedRecord]);

  const refreshHistory = useCallback(async () => {
    const localItems = loadLocalContractHistory();
    setHistoryList(localItems);
    try {
      const res = await fetch('/api/contracts?list=1');
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data.records)) {
          const merged = new Map<string, SignedContractRecord>();
          for (const rec of data.records as SignedContractRecord[]) {
            if (rec?.fields?.protocolCode) merged.set(rec.fields.protocolCode, rec);
          }
          for (const rec of localItems) {
            if (rec?.fields?.protocolCode && !merged.has(rec.fields.protocolCode)) {
              merged.set(rec.fields.protocolCode, rec);
            }
          }
          setHistoryList(
            Array.from(merged.values()).sort(
              (a, b) =>
                new Date(b.signedAtIso).getTime() - new Date(a.signedAtIso).getTime()
            )
          );
        }
      }
    } catch {
      /* local history shown */
    }
  }, []);

  useEffect(() => {
    if (studioOpen && studioTab === 'signed') {
      refreshHistory();
    }
  }, [studioOpen, studioTab, refreshHistory]);

  const clauses = useMemo(() => buildContractClauses(fields), [fields]);
  const isSigned = Boolean(signedRecord);
  const isLight = theme === 'light';
  const showStudioSidebar = studioOpen && !isSigned;

  const hasValidSignature = useMemo(() => {
    if (signature.mode === 'draw') {
      return (signature.strokes?.length || 0) > 0;
    }
    return Boolean(signature.typedText && signature.typedText.trim().length >= 2);
  }, [signature]);

  const clientSignUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const base = `${window.location.origin}${window.location.pathname}`;
    return buildPrefillLink(base, fields);
  }, [fields]);

  const shareUrl = useMemo(() => {
    if (!signedRecord) return '';
    return buildSignedShareUrl(signedRecord, cloudSyncedId || undefined);
  }, [signedRecord, cloudSyncedId]);

  const handleFieldChange = <K extends keyof ContractFields>(
    key: K,
    val: ContractFields[K]
  ) => {
    setFormError(null);
    setFields((prev) => ({ ...prev, [key]: val }));
  };

  const handleCopyClientLink = async () => {
    const ok = await copyTextToClipboard(clientSignUrl);
    if (ok) {
      setCopiedClientLink(true);
      showToast('Link de assinatura copiado.');
      window.setTimeout(() => setCopiedClientLink(false), 2400);
    }
  };

  const handleSignContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (fields.clientName.trim().length < 2) {
      setFormError('Informe seu nome completo na seção Parte II antes de assinar.');
      return;
    }

    if (!hasValidSignature) {
      setFormError(
        signature.mode === 'draw'
          ? 'Realize sua assinatura manuscrita no campo indicado (ou selecione "Tipográfica").'
          : 'Digite seu nome para gerar a assinatura tipográfica.'
      );
      return;
    }

    if (!acceptedTerms) {
      setFormError('Confirme a leitura e concordância com as cláusulas antes de finalizar.');
      return;
    }

    setSigning(true);
    try {
      const signedAtIso = new Date().toISOString();
      const cleanedFields: ContractFields = {
        ...fields,
        clientName: fields.clientName.trim(),
      };

      const verificationHash = await computeVerificationHash(
        cleanedFields,
        signedAtIso,
        signature
      );

      const record: SignedContractRecord = {
        version: 2,
        fields: cleanedFields,
        signature,
        theme,
        signedAtIso,
        verificationHash,
      };

      setFields(cleanedFields);
      setSignedRecord(record);
      setStudioOpen(false);
      setHistoryList(saveLocalContractHistory(record));

      try {
        window.history.replaceState(null, '', buildSignedShareUrl(record));
      } catch {}

      try {
        const res = await fetch('/api/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.id) setCloudSyncedId(data.id);
        }
      } catch {
        /* 100% functional via URL hash */
      }

      showToast('Documento assinado e autenticado.');
      window.setTimeout(() => {
        topAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } finally {
      setSigning(false);
    }
  };

  const handleDownloadImage = async (
    targetRecord?: SignedContractRecord,
    targetTheme?: ContractTheme
  ) => {
    const rec = targetRecord || signedRecord;
    if (!rec) return;
    setDownloadingPng(true);
    try {
      const rendered = await renderContractToPng(rec, targetTheme || theme);
      triggerPngDownload(rendered);
      showToast('Imagem PNG HD salva com sucesso.');
    } catch (err) {
      console.error(err);
      showToast('Não foi possível gerar a imagem.');
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleOpenImagePreview = async () => {
    if (!signedRecord) return;
    setDownloadingPng(true);
    try {
      const rendered = await renderContractToPng(signedRecord, theme);
      setPreviewModal(rendered);
    } catch (err) {
      console.error(err);
      showToast('Erro ao gerar visualização.');
    } finally {
      setDownloadingPng(false);
    }
  };

  const handleCopySignedLink = async () => {
    if (!shareUrl) return;
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      setCopiedShareLink(true);
      showToast('Link permanente copiado.');
      window.setTimeout(() => setCopiedShareLink(false), 2400);
    }
  };

  const handleStartNewContract = (openStudio: boolean) => {
    setSignedRecord(null);
    setCloudSyncedId('');
    setAcceptedTerms(false);
    setFormError(null);
    setStudioOpen(openStudio);
    setStudioTab('config');
    setSignature({
      mode: 'draw',
      strokes: [],
      typedText: '',
      fontId: 'vibes',
    });
    setFields((prev) => ({
      ...prev,
      protocolCode: createProtocolCode(),
      clientName: '',
    }));
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoadFromPastedLink = () => {
    const raw = pasteSignedUrl.trim();
    if (!raw) return;
    const match = raw.match(/assinado=([^&\s]+)/);
    if (match && match[1]) {
      const decoded = decodeSignedRecordFromHash(decodeURIComponent(match[1]));
      if (decoded) {
        setSignedRecord(decoded);
        setFields(decoded.fields);
        setSignature(decoded.signature);
        setTheme(decoded.theme || 'dark');
        setAcceptedTerms(true);
        setStudioOpen(false);
        setHistoryList(saveLocalContractHistory(decoded));
        setPasteSignedUrl('');
        showToast(`Contrato de ${decoded.fields.clientName} carregado.`);
        return;
      }
    }
    showToast('Link inválido. Cole o link completo enviado pelo cliente.');
  };

  const whatsappClientInviteUrl = `https://wa.me/?text=${encodeURIComponent(
    `Olá${
      fields.clientName.trim() ? `, ${fields.clientName.trim()}` : ''
    }! Segue o link oficial do nosso *Termo de Parceria — Alpine Project* (${fields.durationLabel} de acompanhamento individual • ${fields.revenueSharePercent} sobre resultados, isento de investimento inicial). Basta assinar digitalmente e baixar a via em imagem:\n\n${clientSignUrl}`
  )}`;

  return (
    <div
      ref={topAnchorRef}
      className={`min-h-screen w-full font-sans antialiased transition-colors duration-300 selection:bg-[#c8ab5d]/30 ${
        isLight ? 'bg-[#ebe7df] text-[#12151d]' : 'bg-[#050507] text-[#f4f5f7]'
      }`}
    >
      {/* Subtle Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 rounded-lg border border-white/15 bg-[#111116]/95 px-4 py-2.5 text-[12.5px] font-medium text-white shadow-[0_20px_50px_rgba(0,0,0,0.75)] backdrop-blur-xl">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c8ab5d]" />
          <span>{toast}</span>
        </div>
      )}

      {/* ── WORKSPACE SHELL (Split-Screen Studio for Emissor | Centered Stage for Client) ── */}
      <div
        className={
          showStudioSidebar
            ? 'min-h-screen lg:grid lg:grid-cols-[356px_1fr]'
            : 'min-h-screen flex flex-col'
        }
      >
        {/* ═══════════════════════════════════════════════════════
            LEFT STUDIO RAIL (Emissor — Visível apenas ao criar/editar)
        ═══════════════════════════════════════════════════════ */}
        {showStudioSidebar && (
          <aside className="flex flex-col border-b lg:border-b-0 lg:border-r border-white/[0.07] bg-[#0a0a0e] text-white lg:sticky lg:top-0 lg:h-screen">
            {/* Brand Header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <img
                  src={ALPINE_BRAND.logoUrl}
                  alt="Alpine Project"
                  className="h-7 w-auto object-contain"
                />
                <div className="leading-tight">
                  <span className="block text-[12.5px] font-bold tracking-wide text-white">
                    Alpine Sign
                  </span>
                  <span className="block text-[10.5px] text-zinc-500">
                    Emissor de Contratos
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStudioOpen(false)}
                title="Visualizar em tela cheia como o cliente"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.09] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.08] hover:text-white transition cursor-pointer"
              >
                <Eye size={12} />
                <span>Prévia</span>
              </button>
            </div>

            {/* Segmented Tabs */}
            <div className="border-b border-white/[0.07] px-5 py-3">
              <div className="grid grid-cols-2 rounded-lg bg-white/[0.04] p-0.5 border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setStudioTab('config')}
                  className={`rounded-md py-1.5 text-[11.5px] font-semibold transition cursor-pointer ${
                    studioTab === 'config'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Configurar
                </button>
                <button
                  type="button"
                  onClick={() => setStudioTab('signed')}
                  className={`rounded-md py-1.5 text-[11.5px] font-semibold transition cursor-pointer ${
                    studioTab === 'signed'
                      ? 'bg-white text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Assinados ({historyList.length})
                </button>
              </div>
            </div>

            {/* Sidebar Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {studioTab === 'config' ? (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
                        Nome do Parceiro <span className="text-zinc-600 normal-case tracking-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={fields.clientName}
                        onChange={(e) => handleFieldChange('clientName', e.target.value)}
                        placeholder="Deixe vazio para o cliente preencher"
                        className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#060608] px-3 text-[13px] text-white placeholder-zinc-600 focus:border-[#c8ab5d]/60 focus:outline-none transition"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
                          Vigência
                        </label>
                        <input
                          type="text"
                          value={fields.durationLabel}
                          onChange={(e) => handleFieldChange('durationLabel', e.target.value)}
                          placeholder="3 meses"
                          className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#060608] px-3 text-[13px] text-white focus:border-[#c8ab5d]/60 focus:outline-none transition"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
                          Participação
                        </label>
                        <input
                          type="text"
                          value={fields.revenueSharePercent}
                          onChange={(e) =>
                            handleFieldChange('revenueSharePercent', e.target.value)
                          }
                          placeholder="20%"
                          className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#060608] px-3 text-[13px] text-white focus:border-[#c8ab5d]/60 focus:outline-none transition"
                        />
                      </div>
                    </div>

                    <div className="h-[1px] bg-white/[0.06]" />

                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
                        Representante (Assinatura)
                      </label>
                      <input
                        type="text"
                        value={fields.representativeName}
                        onChange={(e) =>
                          handleFieldChange('representativeName', e.target.value)
                        }
                        placeholder="Murilo Vaz"
                        className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#060608] px-3 text-[13px] text-white focus:border-[#c8ab5d]/60 focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
                        WhatsApp de Retorno
                      </label>
                      <input
                        type="text"
                        value={fields.whatsappTarget}
                        onChange={(e) => handleFieldChange('whatsappTarget', e.target.value)}
                        placeholder="5511999999999 ou link"
                        className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#060608] px-3 text-[13px] text-white placeholder-zinc-600 focus:border-[#c8ab5d]/60 focus:outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
                        Cláusula Adicional <span className="text-zinc-600 normal-case tracking-normal">(opcional)</span>
                      </label>
                      <textarea
                        rows={2}
                        value={fields.customNotes}
                        onChange={(e) => handleFieldChange('customNotes', e.target.value)}
                        placeholder="Ex: Repasse via PIX até o 5º dia útil."
                        className="w-full rounded-lg border border-white/[0.1] bg-[#060608] p-3 text-[12.5px] text-white placeholder-zinc-600 focus:border-[#c8ab5d]/60 focus:outline-none transition resize-none"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* SIGNED CONTRACTS TAB */
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
                      Carregar Link Assinado
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={pasteSignedUrl}
                        onChange={(e) => setPasteSignedUrl(e.target.value)}
                        placeholder="Cole o link enviado pelo cliente..."
                        className="h-9 flex-1 rounded-lg border border-white/[0.1] bg-[#060608] px-3 text-[12px] text-white placeholder-zinc-600 focus:border-[#c8ab5d]/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleLoadFromPastedLink}
                        className="rounded-lg bg-white px-3 text-[11.5px] font-semibold text-black hover:bg-zinc-200 transition cursor-pointer"
                      >
                        Abrir
                      </button>
                    </div>
                  </div>

                  <div className="h-[1px] bg-white/[0.06]" />

                  {historyList.length === 0 ? (
                    <p className="py-8 text-center text-[12px] text-zinc-500">
                      Nenhum contrato assinado registrado neste dispositivo.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {historyList.map((rec) => (
                        <div
                          key={rec.fields.protocolCode}
                          className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold text-white">
                                {rec.fields.clientName}
                              </div>
                              <div className="mt-0.5 font-mono text-[10.5px] text-zinc-500">
                                {rec.fields.protocolCode} • {formatShortDateBR(rec.signedAtIso)}
                              </div>
                            </div>
                            <span className="shrink-0 font-mono text-[10.5px] text-[#c8ab5d]">
                              {rec.fields.revenueSharePercent}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSignedRecord(rec);
                                setFields(rec.fields);
                                setSignature(rec.signature);
                                setTheme(rec.theme || 'dark');
                                setAcceptedTerms(true);
                                setStudioOpen(false);
                              }}
                              className="flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] py-1.5 text-[11.5px] font-medium text-zinc-200 hover:bg-white/[0.08] transition cursor-pointer"
                            >
                              <Eye size={12} />
                              <span>Abrir</span>
                            </button>

                            <button
                              type="button"
                              disabled={downloadingPng}
                              onClick={() => handleDownloadImage(rec, rec.theme || 'dark')}
                              className="flex items-center justify-center gap-1.5 rounded-md bg-white py-1.5 text-[11.5px] font-semibold text-black hover:bg-zinc-200 transition cursor-pointer disabled:opacity-60"
                            >
                              <Download size={12} />
                              <span>Baixar PNG</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sticky Studio Footer CTAs */}
            {studioTab === 'config' && (
              <div className="border-t border-white/[0.07] bg-[#08080b] p-5 space-y-2.5">
                <button
                  type="button"
                  onClick={handleCopyClientLink}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-[12.5px] font-semibold text-black hover:bg-zinc-200 active:scale-[0.99] transition cursor-pointer"
                >
                  {copiedClientLink ? <Check size={14} /> : <Copy size={14} />}
                  <span>
                    {copiedClientLink
                      ? 'Link de Assinatura Copiado'
                      : 'Copiar Link de Assinatura'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={whatsappClientInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.03] text-[12px] font-medium text-zinc-200 hover:bg-white/[0.07] hover:text-white transition"
                  >
                    <Send size={12} />
                    <span>WhatsApp</span>
                  </a>

                  <a
                    href={clientSignUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.03] text-[12px] font-medium text-zinc-200 hover:bg-white/[0.07] hover:text-white transition"
                  >
                    <ExternalLink size={12} />
                    <span>Abrir Link</span>
                  </a>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* ═══════════════════════════════════════════════════════
            DOCUMENT STAGE (Papel Timbrado Oficial Alpine Project)
        ═══════════════════════════════════════════════════════ */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Minimalist Top Bar */}
          <header
            className={`sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-8 backdrop-blur-xl transition-colors ${
              isLight
                ? 'border-stone-300/75 bg-[#f2efe8]/90'
                : 'border-white/[0.06] bg-[#060608]/85'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {!showStudioSidebar && (
                <div className="flex items-center gap-2.5">
                  {isLight ? (
                    <>
                      <AlpineVectorLogoSvg className="h-6 w-6 shrink-0" darkInk />
                      <span className="text-[13px] font-bold tracking-[0.18em] text-[#12151d]">
                        ALPINE PROJECT
                      </span>
                    </>
                  ) : (
                    <>
                      <img
                        src={ALPINE_BRAND.logoUrl}
                        alt="Alpine Project"
                        className="h-6 w-auto object-contain"
                      />
                      <img
                        src={ALPINE_BRAND.wordmarkUrl}
                        alt="Alpine Project"
                        className="h-3.5 w-auto object-contain opacity-90 hidden sm:block"
                      />
                    </>
                  )}
                </div>
              )}

              {showStudioSidebar && (
                <span
                  className={`text-[11.5px] font-medium ${
                    isLight ? 'text-stone-500' : 'text-zinc-500'
                  }`}
                >
                  Pré-visualização em tempo real do documento
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!showStudioSidebar && !initial.isClientSignLink && !isSigned && (
                <button
                  type="button"
                  onClick={() => setStudioOpen(true)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium transition cursor-pointer ${
                    isLight
                      ? 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                      : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]'
                  }`}
                >
                  <ArrowLeft size={12} />
                  <span>Editar Dados</span>
                </button>
              )}

              {/* Subtle Paper / Obsidian Switch */}
              <div
                className={`inline-flex items-center rounded-md border p-0.5 ${
                  isLight
                    ? 'border-stone-300 bg-stone-200/70'
                    : 'border-white/[0.09] bg-white/[0.03]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                    !isLight ? 'bg-white text-black' : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Moon size={11} />
                  <span className="hidden sm:inline">Obsidian</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                    isLight ? 'bg-[#12151d] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sun size={11} />
                  <span className="hidden sm:inline">Papel</span>
                </button>
              </div>

              {isSigned && (
                <button
                  type="button"
                  disabled={downloadingPng}
                  onClick={() => handleDownloadImage()}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition cursor-pointer disabled:opacity-60 ${
                    isLight
                      ? 'bg-[#12151d] text-white hover:bg-[#1e2330]'
                      : 'bg-white text-black hover:bg-zinc-200'
                  }`}
                >
                  <Download size={12} />
                  <span>{downloadingPng ? 'Gerando...' : 'Baixar PNG'}</span>
                </button>
              )}
            </div>
          </header>

          {/* Main Centered Legal Stage */}
          <main className="mx-auto w-full max-w-[820px] flex-1 px-4 py-8 sm:px-8 sm:py-12">
            {isLoadingCloud ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#c8ab5d] border-t-transparent" />
                <p className="mt-4 text-[13px] text-zinc-500">
                  Carregando documento autenticado...
                </p>
              </div>
            ) : (
              <>
                {/* ── BARRA EXECUTIVA PÓS-ASSINATURA (Sóbria, elegante, sem caixote verde gritante) ── */}
                {isSigned && signedRecord && (
                  <section
                    className={`alp-rise mb-6 rounded-xl border p-4 sm:p-5 ${
                      isLight
                        ? 'border-stone-300 bg-white shadow-sm'
                        : 'border-white/[0.1] bg-[#0c0c11]'
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span
                            className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                              isLight ? 'text-emerald-800' : 'text-emerald-400'
                            }`}
                          >
                            Documento Assinado e Autenticado
                          </span>
                        </div>
                        <p
                          className={`text-[13px] ${
                            isLight ? 'text-stone-600' : 'text-zinc-400'
                          }`}
                        >
                          Via oficial pronta para download em alta definição ou envio pelo WhatsApp.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={downloadingPng}
                          onClick={() => handleDownloadImage()}
                          className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[12.5px] font-semibold transition cursor-pointer disabled:opacity-60 ${
                            isLight
                              ? 'bg-[#12151d] text-white hover:bg-[#1e2330]'
                              : 'bg-white text-black hover:bg-zinc-200'
                          }`}
                        >
                          <Download size={14} />
                          <span>
                            {downloadingPng ? 'Gerando...' : 'Baixar Imagem (PNG)'}
                          </span>
                        </button>

                        <a
                          href={buildWhatsAppConfirmationUrl(signedRecord, shareUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-[12.5px] font-medium transition ${
                            isLight
                              ? 'border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100'
                              : 'border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.09]'
                          }`}
                        >
                          <MessageCircle size={14} />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    </div>

                    <div
                      className={`mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[11.5px] ${
                        isLight
                          ? 'border-stone-200 text-stone-500'
                          : 'border-white/[0.07] text-zinc-400'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-4">
                        <button
                          type="button"
                          onClick={handleCopySignedLink}
                          className="inline-flex items-center gap-1.5 hover:opacity-100 opacity-80 transition cursor-pointer"
                        >
                          {copiedShareLink ? (
                            <Check size={12} className="text-emerald-500" />
                          ) : (
                            <Link2 size={12} />
                          )}
                          <span>
                            {copiedShareLink ? 'Link copiado' : 'Copiar link assinado'}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={downloadingPng}
                          onClick={handleOpenImagePreview}
                          className="inline-flex items-center gap-1.5 hover:opacity-100 opacity-80 transition cursor-pointer"
                        >
                          <Eye size={12} />
                          <span>Visualizar PNG</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-3.5">
                        <button
                          type="button"
                          onClick={() => handleStartNewContract(true)}
                          className="inline-flex items-center gap-1 hover:opacity-100 opacity-85 transition cursor-pointer"
                        >
                          <Plus size={12} />
                          <span>Novo contrato</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartNewContract(false)}
                          className="inline-flex items-center gap-1 hover:opacity-100 opacity-70 transition cursor-pointer"
                        >
                          <RotateCcw size={11} />
                          <span>Reassinar</span>
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {/* ═══════════════════════════════════════════════════
                    FOLHA TIMBRADA OFICIAL — PADRÃO SWISS EDITORIAL
                ═══════════════════════════════════════════════════ */}
                <form
                  onSubmit={handleSignContract}
                  className={`alp-rise relative overflow-hidden rounded-lg border px-6 py-9 sm:px-14 sm:py-14 transition-colors ${
                    isLight
                      ? 'border-stone-300/90 bg-[#fbf9f4] text-[#12151d] shadow-[0_24px_70px_rgba(20,16,8,0.09)]'
                      : 'border-white/[0.1] bg-[#0a0a0e] text-[#f4f5f7] shadow-[0_36px_110px_rgba(0,0,0,0.85)]'
                  }`}
                >
                  {/* Fine Recessed Architectural Inner Hairline Frame */}
                  <div
                    className={`pointer-events-none absolute inset-3 sm:inset-4 rounded-sm border ${
                      isLight ? 'border-[#8f722b]/20' : 'border-[#c8ab5d]/[0.16]'
                    }`}
                  />

                  {/* Whisper-quiet Alpine Peak Watermark */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.025]">
                    <AlpineVectorLogoSvg
                      className="h-[360px] w-[360px] sm:h-[440px] sm:w-[440px]"
                      darkInk={isLight}
                    />
                  </div>

                  <div className="relative z-10">
                    {/* 1. PAPEL TIMBRADO (LETTERHEAD) */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <div className="flex items-center gap-3.5">
                        {isLight ? (
                          <>
                            <AlpineVectorLogoSvg className="h-10 w-10 shrink-0" darkInk />
                            <div className="leading-none">
                              <span className="block text-[18px] font-bold tracking-[0.2em] text-[#12151d]">
                                ALPINE
                              </span>
                              <span className="mt-1 block text-[9px] font-semibold tracking-[0.42em] text-[#8f722b]">
                                PROJECT
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <img
                              src={ALPINE_BRAND.logoUrl}
                              alt="Símbolo Alpine Project"
                              className="h-10 sm:h-11 w-auto object-contain"
                            />
                            <img
                              src={ALPINE_BRAND.wordmarkUrl}
                              alt="Alpine Project"
                              className="h-4 sm:h-[18px] w-auto object-contain opacity-95"
                            />
                          </>
                        )}
                      </div>

                      <div className="text-left sm:text-right font-mono text-[10.5px] leading-relaxed">
                        <div
                          className={`inline-flex items-center gap-1.5 font-semibold tracking-[0.12em] uppercase ${
                            isSigned
                              ? isLight
                                ? 'text-emerald-700'
                                : 'text-emerald-400'
                              : isLight
                              ? 'text-[#8f722b]'
                              : 'text-[#c8ab5d]'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSigned ? 'bg-emerald-500' : 'bg-[#c8ab5d]'
                            }`}
                          />
                          <span>
                            {isSigned ? 'Autenticado Digitalmente' : 'Aguardando Assinatura'}
                          </span>
                        </div>
                        <div className={isLight ? 'text-stone-700 font-medium' : 'text-zinc-300 font-medium'}>
                          INSTRUMENTO Nº {fields.protocolCode}
                        </div>
                        <div className={isLight ? 'text-stone-400' : 'text-zinc-500'}>
                          {ALPINE_BRAND.websiteDisplay.toUpperCase()}
                        </div>
                      </div>
                    </div>

                    {/* Crisp Letterhead Rule */}
                    <div
                      className={`my-7 h-[1px] w-full ${
                        isLight ? 'bg-stone-900/15' : 'bg-[#c8ab5d]/25'
                      }`}
                    />

                    {/* 2. EDITORIAL SERIF TITLE */}
                    <div className="text-center py-2">
                      <span
                        className={`block text-[10px] font-semibold uppercase tracking-[0.3em] ${
                          isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                        }`}
                      >
                        Termo de Parceria e Acompanhamento Individual
                      </span>

                      <h1
                        className="mt-2.5 text-[32px] sm:text-[42px] font-semibold tracking-[-0.01em] leading-[1.1]"
                        style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
                      >
                        Contrato Digital — Alpine Project
                      </h1>

                      <p
                        className={`mt-2.5 text-[12.5px] ${
                          isLight ? 'text-stone-500' : 'text-zinc-400'
                        }`}
                      >
                        {isSigned && signedRecord
                          ? `Celebrado e assinado eletronicamente em ${formatDateTimeBR(
                              signedRecord.signedAtIso
                            )}`
                          : 'Revise as condições acordadas, informe seu nome completo e registre sua assinatura digital.'}
                      </p>
                    </div>

                    {/* 3. ARCHITECTURAL 3-COLUMN TERM SHEET LEDGER */}
                    <div
                      className={`mt-8 grid grid-cols-1 sm:grid-cols-3 border-y divide-y sm:divide-y-0 sm:divide-x ${
                        isLight
                          ? 'border-stone-900/15 divide-stone-900/10 bg-stone-900/[0.02]'
                          : 'border-[#c8ab5d]/25 divide-white/[0.08] bg-white/[0.015]'
                      }`}
                    >
                      <div className="px-4 py-5 text-center">
                        <span
                          className={`block text-[9.5px] font-semibold uppercase tracking-[0.18em] ${
                            isLight ? 'text-stone-500' : 'text-zinc-500'
                          }`}
                        >
                          Investimento Inicial
                        </span>
                        <span className="mt-1.5 block text-[19px] font-bold tracking-tight">
                          Isento (R$ 0,00)
                        </span>
                        <span
                          className={`mt-0.5 block text-[11px] ${
                            isLight ? 'text-stone-500' : 'text-zinc-500'
                          }`}
                        >
                          Sem taxa de adesão
                        </span>
                      </div>

                      <div className="px-4 py-5 text-center">
                        <span
                          className={`block text-[9.5px] font-semibold uppercase tracking-[0.18em] ${
                            isLight ? 'text-stone-500' : 'text-zinc-500'
                          }`}
                        >
                          Vigência do Acompanhamento
                        </span>
                        <span className="mt-1.5 block text-[19px] font-bold tracking-tight">
                          {fields.durationLabel || '3 meses'}
                        </span>
                        <span
                          className={`mt-0.5 block text-[11px] ${
                            isLight ? 'text-stone-500' : 'text-zinc-500'
                          }`}
                        >
                          Mentoria individual 1:1
                        </span>
                      </div>

                      <div className="px-4 py-5 text-center">
                        <span
                          className={`block text-[9.5px] font-semibold uppercase tracking-[0.18em] ${
                            isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                          }`}
                        >
                          Participação Acordada
                        </span>
                        <span className="mt-1.5 block text-[19px] font-bold tracking-tight">
                          {fields.revenueSharePercent || '20%'} dos resultados
                        </span>
                        <span
                          className={`mt-0.5 block text-[11px] ${
                            isLight ? 'text-stone-500' : 'text-zinc-500'
                          }`}
                        >
                          Repasse sobre ganhos
                        </span>
                      </div>
                    </div>

                    {/* 4. PARTES CONTRATANTES (Inline Editorial Layout) */}
                    <div
                      className={`mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 border-b pb-7 ${
                        isLight ? 'border-stone-900/10' : 'border-white/[0.08]'
                      }`}
                    >
                      {/* Parte I */}
                      <div>
                        <span
                          className={`block text-[9.5px] font-semibold uppercase tracking-[0.18em] ${
                            isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                          }`}
                        >
                          Parte I — Mentoria & Operação
                        </span>
                        <p className="mt-2 text-[17px] font-bold tracking-tight">
                          Alpine Project
                        </p>
                        <p
                          className={`mt-0.5 text-[12.5px] ${
                            isLight ? 'text-stone-500' : 'text-zinc-400'
                          }`}
                        >
                          Representada por{' '}
                          <span className={isLight ? 'text-stone-800 font-medium' : 'text-zinc-200 font-medium'}>
                            {fields.representativeName || ALPINE_BRAND.defaultRepresentative}
                          </span>
                        </p>
                      </div>

                      {/* Parte II */}
                      <div>
                        <label
                          htmlFor="ctr-name"
                          className={`block text-[9.5px] font-semibold uppercase tracking-[0.18em] ${
                            isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                          }`}
                        >
                          Parte II — Parceiro(a) Acompanhado(a)
                        </label>

                        {isSigned ? (
                          <>
                            <p className="mt-2 text-[17px] font-bold tracking-tight">
                              {fields.clientName}
                            </p>
                            <p
                              className={`mt-0.5 text-[12.5px] ${
                                isLight ? 'text-stone-500' : 'text-zinc-400'
                              }`}
                            >
                              Acompanhamento Individual • Programa Alpine Project
                            </p>
                          </>
                        ) : (
                          <div className="mt-1.5">
                            <input
                              id="ctr-name"
                              type="text"
                              required
                              value={fields.clientName}
                              onChange={(e) => handleFieldChange('clientName', e.target.value)}
                              placeholder="Digite seu nome completo"
                              className={`w-full border-b bg-transparent py-1.5 text-[16px] font-semibold transition focus:outline-none ${
                                isLight
                                  ? 'border-stone-400 text-[#12151d] placeholder-stone-400 focus:border-[#8f722b]'
                                  : 'border-white/25 text-white placeholder-zinc-600 focus:border-[#c8ab5d]'
                              }`}
                            />
                            <span
                              className={`mt-1 block text-[11px] ${
                                isLight ? 'text-stone-400' : 'text-zinc-500'
                              }`}
                            >
                              Nome completo do(a) signatário(a)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5. DISPOSIÇÕES E CLÁUSULAS CONTRATUAIS (Editorial Contínuo — Sem caixas de FAQ!) */}
                    <div className="mt-8">
                      <span
                        className={`block text-[10px] font-semibold uppercase tracking-[0.22em] mb-6 ${
                          isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                        }`}
                      >
                        Disposições e Cláusulas Contratuais
                      </span>

                      <div
                        className={`divide-y ${
                          isLight ? 'divide-stone-900/[0.08]' : 'divide-white/[0.06]'
                        }`}
                      >
                        {clauses.map((clause) => (
                          <article
                            key={clause.number}
                            className="py-5 first:pt-0 grid grid-cols-1 gap-1.5 sm:grid-cols-[108px_1fr] sm:gap-5"
                          >
                            <div
                              className={`font-mono text-[11px] font-semibold tracking-[0.08em] pt-0.5 ${
                                isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                              }`}
                            >
                              CLÁUSULA {clause.number}
                            </div>
                            <div>
                              <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em]">
                                {clause.title}
                              </h3>
                              <p
                                className={`mt-1.5 text-[13.5px] leading-[1.72] ${
                                  isLight ? 'text-stone-600' : 'text-zinc-400'
                                }`}
                              >
                                {clause.body}
                              </p>
                            </div>
                          </article>
                        ))}

                        {fields.customNotes.trim() && (
                          <article className="py-5 grid grid-cols-1 gap-1.5 sm:grid-cols-[108px_1fr] sm:gap-5">
                            <div
                              className={`font-mono text-[11px] font-semibold tracking-[0.08em] pt-0.5 ${
                                isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                              }`}
                            >
                              ADITIVO
                            </div>
                            <div>
                              <h3 className="text-[12.5px] font-bold uppercase tracking-[0.05em]">
                                CONDIÇÕES ESPECÍFICAS ACORDADAS
                              </h3>
                              <p
                                className={`mt-1.5 text-[13.5px] leading-[1.72] whitespace-pre-line ${
                                  isLight ? 'text-stone-700' : 'text-zinc-300'
                                }`}
                              >
                                {fields.customNotes.trim()}
                              </p>
                            </div>
                          </article>
                        )}
                      </div>
                    </div>

                    {/* 6. ASSINATURAS & CHANCELA DIGITAL */}
                    <div
                      className={`mt-8 border-t pt-9 ${
                        isLight ? 'border-stone-900/15' : 'border-[#c8ab5d]/25'
                      }`}
                    >
                      {isSigned && signedRecord ? (
                        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[1fr_auto_1fr]">
                          {/* Parte I */}
                          <div className="text-center order-2 md:order-1">
                            <div className="flex h-24 items-center justify-center">
                              <span
                                className="text-[40px] leading-none select-none"
                                style={{
                                  fontFamily: '"Great Vibes", Georgia, serif',
                                  color: isLight ? '#14171f' : '#e8d49c',
                                }}
                              >
                                {signedRecord.fields.representativeName}
                              </span>
                            </div>
                            <div
                              className={`mx-auto h-[1px] w-48 ${
                                isLight ? 'bg-stone-900/25' : 'bg-[#c8ab5d]/35'
                              }`}
                            />
                            <p className="mt-2.5 text-[13px] font-bold">
                              {signedRecord.fields.representativeName}
                            </p>
                            <p
                              className={`text-[11px] ${
                                isLight ? 'text-stone-500' : 'text-zinc-500'
                              }`}
                            >
                              {signedRecord.fields.representativeRole}
                            </p>
                            <span
                              className={`mt-1 block font-mono text-[9.5px] uppercase tracking-[0.12em] ${
                                isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                              }`}
                            >
                              Parte I • Oficial
                            </span>
                          </div>

                          {/* Chancela Hairline Minimalista */}
                          <div className="flex flex-col items-center justify-center order-1 md:order-2">
                            <div
                              className={`relative flex h-24 w-24 items-center justify-center rounded-full border ${
                                isLight
                                  ? 'border-[#8f722b]/70 bg-[#fbf9f4]'
                                  : 'border-[#c8ab5d]/65 bg-[#0a0a0e]'
                              }`}
                            >
                              <div
                                className={`absolute inset-1.5 rounded-full border border-dashed ${
                                  isLight ? 'border-[#8f722b]/45' : 'border-[#c8ab5d]/40'
                                }`}
                              />
                              <div className="flex flex-col items-center text-center px-2">
                                <AlpineVectorLogoSvg
                                  className="h-8 w-8 mb-0.5"
                                  darkInk={isLight}
                                />
                                <span
                                  className={`text-[7px] font-bold uppercase tracking-[0.18em] ${
                                    isLight ? 'text-[#12151d]' : 'text-white'
                                  }`}
                                >
                                  Alpine Project
                                </span>
                                <span
                                  className={`text-[6.5px] font-mono uppercase tracking-[0.14em] ${
                                    isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                                  }`}
                                >
                                  Chancela
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Parte II */}
                          <div className="text-center order-3">
                            <SignaturePreview
                              signature={signedRecord.signature}
                              theme={theme}
                              className="h-24 w-full max-w-[240px] mx-auto"
                            />
                            <div
                              className={`mx-auto h-[1px] w-48 ${
                                isLight ? 'bg-stone-900/25' : 'bg-[#c8ab5d]/35'
                              }`}
                            />
                            <p className="mt-2.5 text-[13px] font-bold">
                              {signedRecord.fields.clientName}
                            </p>
                            <p
                              className={`text-[11px] ${
                                isLight ? 'text-stone-500' : 'text-zinc-500'
                              }`}
                            >
                              Parceiro(a) • Alpine Project
                            </p>
                            <span
                              className={`mt-1 block font-mono text-[9.5px] uppercase tracking-[0.12em] ${
                                isLight ? 'text-emerald-700' : 'text-emerald-400'
                              }`}
                            >
                              Assinado em {formatShortDateBR(signedRecord.signedAtIso)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-7">
                          <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.78fr_1.22fr] md:items-end">
                            {/* Parte I Pré-assinada */}
                            <div className="text-center pb-2">
                              <span
                                className={`block font-mono text-[9.5px] uppercase tracking-[0.16em] ${
                                  isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                                }`}
                              >
                                Parte I • Pré-assinado
                              </span>

                              <div className="mt-4 flex h-20 items-center justify-center">
                                <span
                                  className="text-[40px] leading-none select-none"
                                  style={{
                                    fontFamily: '"Great Vibes", Georgia, serif',
                                    color: isLight ? '#14171f' : '#e8d49c',
                                  }}
                                >
                                  {fields.representativeName || ALPINE_BRAND.defaultRepresentative}
                                </span>
                              </div>

                              <div
                                className={`mx-auto h-[1px] w-44 ${
                                  isLight ? 'bg-stone-900/25' : 'bg-white/20'
                                }`}
                              />
                              <p className="mt-2.5 text-[13px] font-bold">
                                {fields.representativeName || ALPINE_BRAND.defaultRepresentative}
                              </p>
                              <p
                                className={`text-[11px] ${
                                  isLight ? 'text-stone-500' : 'text-zinc-500'
                                }`}
                              >
                                {fields.representativeRole}
                              </p>
                            </div>

                            {/* Parte II Interativa */}
                            <div>
                              <span
                                className={`block font-mono text-[9.5px] uppercase tracking-[0.16em] mb-2.5 ${
                                  isLight ? 'text-[#8f722b]' : 'text-[#c8ab5d]'
                                }`}
                              >
                                Parte II • Assinatura do(a) Parceiro(a)
                              </span>

                              <SignaturePad
                                value={signature}
                                onChange={(next) => {
                                  setFormError(null);
                                  setSignature(next);
                                }}
                                theme={theme}
                                defaultTypedName={fields.clientName}
                              />
                            </div>
                          </div>

                          {/* Aceite + Botão Executivo */}
                          <div className="space-y-4 pt-2">
                            <label className="flex cursor-pointer items-start gap-3 text-[12.5px] leading-relaxed">
                              <input
                                type="checkbox"
                                checked={acceptedTerms}
                                onChange={(e) => {
                                  setFormError(null);
                                  setAcceptedTerms(e.target.checked);
                                }}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#c8ab5d] cursor-pointer"
                              />
                              <span className={isLight ? 'text-stone-600' : 'text-zinc-400'}>
                                Declaro que li e concordo integralmente com este Termo de Parceria de{' '}
                                <strong className={isLight ? 'text-stone-900' : 'text-white'}>
                                  {fields.durationLabel || '3 meses'}
                                </strong>{' '}
                                e participação de{' '}
                                <strong className={isLight ? 'text-stone-900' : 'text-white'}>
                                  {fields.revenueSharePercent || '20%'} sobre resultados
                                </strong>{' '}
                                junto à Alpine Project.
                              </span>
                            </label>

                            {formError && (
                              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[12px] font-medium text-red-400">
                                {formError}
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={signing}
                              className={`flex h-12 w-full items-center justify-center gap-2 rounded-lg text-[12.5px] font-semibold uppercase tracking-[0.16em] transition active:scale-[0.99] cursor-pointer disabled:opacity-60 ${
                                isLight
                                  ? 'bg-[#12151d] text-white hover:bg-[#1e2330]'
                                  : 'bg-white text-black hover:bg-zinc-200'
                              }`}
                            >
                              <ShieldCheck size={16} />
                              <span>
                                {signing
                                  ? 'Autenticando Assinatura...'
                                  : 'Confirmar e Assinar Documento'}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 7. AUDIT TRAIL FOOTER */}
                    <div
                      className={`mt-9 flex flex-col gap-1 border-t pt-4 font-mono text-[10px] sm:flex-row sm:items-center sm:justify-between ${
                        isLight
                          ? 'border-stone-900/10 text-stone-400'
                          : 'border-white/[0.07] text-zinc-500'
                      }`}
                    >
                      <span className="truncate">
                        {isSigned && signedRecord
                          ? `SHA-256  ${signedRecord.verificationHash}`
                          : `PROTOCOLO  ${fields.protocolCode}`}
                      </span>
                      <span className="shrink-0">
                        {ALPINE_BRAND.name.toUpperCase()} • {ALPINE_BRAND.websiteDisplay.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </form>

                {/* Quiet Footer */}
                <footer
                  className={`mt-8 flex flex-col items-center justify-between gap-2 text-[11px] sm:flex-row ${
                    isLight ? 'text-stone-500' : 'text-zinc-600'
                  }`}
                >
                  <span>
                    © {new Date().getFullYear()} Alpine Project. Documento digital com registro de integridade.
                  </span>

                  {!showStudioSidebar && (
                    <button
                      type="button"
                      onClick={() => {
                        setStudioOpen(true);
                        if (isSigned) {
                          setSignedRecord(null);
                          setStudioTab('signed');
                        }
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1.5 opacity-75 hover:opacity-100 transition cursor-pointer"
                    >
                      <SlidersHorizontal size={11} />
                      <span>{isSigned ? 'Acessar Emissor' : 'Modo Emissor'}</span>
                    </button>
                  )}
                </footer>
              </>
            )}
          </main>
        </div>
      </div>

      {/* ── MODAL DE VISUALIZAÇÃO DA IMAGEM PNG HD ── */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-xl"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/12 bg-[#0b0b0f] shadow-[0_30px_100px_rgba(0,0,0,0.95)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
              <div>
                <h3 className="text-[13.5px] font-semibold text-white">
                  Via Oficial em Imagem (PNG HD)
                </h3>
                <p className="text-[11px] text-zinc-500">
                  {previewModal.width} × {previewModal.height}px • Alta resolução
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerPngDownload(previewModal)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-[12px] font-semibold text-black hover:bg-zinc-200 transition cursor-pointer"
                >
                  <Download size={13} />
                  <span>Baixar PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModal(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition cursor-pointer"
                  aria-label="Fechar"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#050507] p-4 sm:p-6">
              <img
                src={previewModal.dataUrl}
                alt="Via Oficial do Contrato Alpine Project"
                className="mx-auto w-full max-w-[660px] rounded border border-white/10 shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
