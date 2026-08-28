import { supabase } from './supabase';

export interface FamilyDocument {
  id?: string;
  familyId?: string;
  documentKey: string;
  title: string;
  number: string;
  issuedAt: string;
  scanUrl: string;
  scanFile: File | null;
  sortOrder: number;
  isDefault: boolean;
}

const DEFAULT_DOCUMENTS: FamilyDocument[] = [
  { documentKey: 'contract', title: 'Договор', number: '', issuedAt: '', scanUrl: '', scanFile: null, sortOrder: 0, isDefault: true },
  { documentKey: 'additional_agreement', title: 'Дополнительное соглашение', number: '', issuedAt: '', scanUrl: '', scanFile: null, sortOrder: 1, isDefault: true },
];

export function createDefaultFamilyDocuments(): FamilyDocument[] {
  return DEFAULT_DOCUMENTS.map(document => ({ ...document }));
}

export function createCustomFamilyDocument(sortOrder: number): FamilyDocument {
  return {
    documentKey: `custom_${crypto.randomUUID()}`,
    title: 'Новый документ',
    number: '',
    issuedAt: '',
    scanUrl: '',
    scanFile: null,
    sortOrder,
    isDefault: false,
  };
}

function mapDocument(row: any): FamilyDocument {
  return {
    id: String(row.id),
    familyId: String(row.family_id),
    documentKey: String(row.document_key),
    title: String(row.title ?? 'Документ'),
    number: String(row.document_number ?? ''),
    issuedAt: String(row.issued_at ?? ''),
    scanUrl: String(row.scan_url ?? ''),
    scanFile: null,
    sortOrder: Number(row.sort_order ?? 0),
    isDefault: row.document_key === 'contract' || row.document_key === 'additional_agreement',
  };
}

export async function fetchFamilyDocuments(familyId: string): Promise<FamilyDocument[]> {
  const { data, error } = await supabase
    .from('v2_family_documents')
    .select('*')
    .eq('family_id', familyId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map(mapDocument);
  const byKey = new Map(rows.map(document => [document.documentKey, document]));
  const defaults = createDefaultFamilyDocuments().map(document => byKey.get(document.documentKey) ?? document);
  const custom = rows.filter(document => !document.isDefault);
  return [...defaults, ...custom].map((document, index) => ({ ...document, sortOrder: index }));
}

function safeFileName(name: string): string {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';
}

async function uploadFamilyDocument(familyId: string, document: FamilyDocument): Promise<string> {
  if (!document.scanFile) return document.scanUrl;
  const path = `${familyId}/${document.documentKey}/${Date.now()}_${safeFileName(document.scanFile.name)}`;
  const { error } = await supabase.storage.from('family-documents').upload(path, document.scanFile, { upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from('family-documents').getPublicUrl(path).data.publicUrl;
}

export async function saveFamilyDocuments(familyId: string, documents: FamilyDocument[]): Promise<FamilyDocument[]> {
  const normalized = documents.map((document, index) => ({ ...document, sortOrder: index }));
  const { data: currentRows, error: currentError } = await supabase
    .from('v2_family_documents')
    .select('id, document_key')
    .eq('family_id', familyId);
  if (currentError) throw new Error(currentError.message);

  const activeKeys = new Set(normalized.map(document => document.documentKey));
  const removedIds = (currentRows ?? []).filter(row => !activeKeys.has(String(row.document_key))).map(row => String(row.id));
  if (removedIds.length) {
    const { error } = await supabase.from('v2_family_documents').delete().in('id', removedIds);
    if (error) throw new Error(error.message);
  }

  const rows = await Promise.all(normalized.map(async document => ({
    family_id: familyId,
    document_key: document.documentKey,
    title: document.title.trim() || 'Документ',
    document_number: document.number.trim() || null,
    issued_at: document.issuedAt || null,
    scan_url: (await uploadFamilyDocument(familyId, document)) || null,
    sort_order: document.sortOrder,
  })));
  const { error } = await supabase.from('v2_family_documents').upsert(rows, { onConflict: 'family_id,document_key' });
  if (error) throw new Error(error.message);
  return fetchFamilyDocuments(familyId);
}
