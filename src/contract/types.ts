export type ContractTheme = 'dark' | 'light';

export type SignatureMode = 'draw' | 'type';

export type SignatureFontId = 'vibes' | 'allura' | 'dancing';

export interface StrokePoint {
  x: number; // Normalized 0..1 relative to signature box width
  y: number; // Normalized 0..1 relative to signature box height
}

export interface SignaturePayload {
  mode: SignatureMode;
  /** Normalized strokes (0..1) when mode === 'draw' */
  strokes?: StrokePoint[][];
  /** Typed display text when mode === 'type' */
  typedText?: string;
  /** Font choice when mode === 'type' */
  fontId?: SignatureFontId;
}

export interface ContractFields {
  protocolCode: string;
  clientName: string;
  durationLabel: string; // ex: "3 meses"
  revenueSharePercent: string; // ex: "20%"
  representativeName: string;
  representativeRole: string;
  whatsappTarget: string;
  customNotes: string;
}

export interface SignedContractRecord {
  version: 2;
  fields: ContractFields;
  signature: SignaturePayload;
  theme: ContractTheme;
  signedAtIso: string;
  verificationHash: string;
}

export interface ContractClause {
  number: string;
  title: string;
  body: string;
}
