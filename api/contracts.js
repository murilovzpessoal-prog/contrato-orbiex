/**
 * Alpine Project — Contratos Digitais (Persistência em Nuvem no Supabase - ESM)
 * GET  /api/contracts?id=ALP-CTR-XXXX  -> retorna { success, record }
 * GET  /api/contracts?list=1           -> retorna { success, records: [...] }
 * POST /api/contracts { record }       -> salva contrato assinado no Supabase
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://ywmhjdcuztfwhlatvlzp.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_yOFFvnPP5ZH2-SwMHF_JLw_tM9VRGXS';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const CONTRACT_PREFIX = 'alpine_contract::';

function contractRowKey(protocolCode) {
  return `${CONTRACT_PREFIX}${String(protocolCode || '')
    .trim()
    .toUpperCase()}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (req.query?.list === '1') {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_email, name, avatar_url, updated_at')
          .like('user_email', `${CONTRACT_PREFIX}%`)
          .order('updated_at', { ascending: false })
          .limit(50);

        if (error) {
          return res.status(500).json({ success: false, error: error.message });
        }

        const records = [];
        for (const row of data || []) {
          try {
            const parsed = JSON.parse(row.avatar_url || '{}');
            if (parsed && parsed.fields && parsed.fields.protocolCode) {
              records.push(parsed);
            }
          } catch {
            /* skip malformed row */
          }
        }
        return res.status(200).json({ success: true, records });
      }

      const id = String(req.query?.id || '').trim().toUpperCase();
      if (!id) {
        return res.status(400).json({ success: false, error: 'Protocolo inválido' });
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_email', contractRowKey(id))
        .maybeSingle();

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      if (!data || !data.avatar_url) {
        return res.status(404).json({ success: false, error: 'Contrato não encontrado' });
      }

      const record = JSON.parse(data.avatar_url);
      return res.status(200).json({ success: true, record });
    }

    if (req.method === 'POST') {
      const record = req.body?.record;
      const protocol = String(record?.fields?.protocolCode || '').trim().toUpperCase();
      const clientName = String(record?.fields?.clientName || '').trim();

      if (!protocol || !clientName) {
        return res.status(400).json({
          success: false,
          error: 'Dados do contrato incompletos',
        });
      }

      const nowIso = new Date().toISOString();
      const { error } = await supabase.from('profiles').upsert(
        {
          user_email: contractRowKey(protocol),
          name: clientName.slice(0, 120),
          avatar_url: JSON.stringify(record),
          updated_at: nowIso,
        },
        { onConflict: 'user_email' }
      );

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({
        success: true,
        id: protocol,
        updatedAt: nowIso,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro interno ao processar contrato',
    });
  }
}
