import { supabase } from './supabase';
import { safeStorageFileName } from './storage';

export interface B2BAttachment {
  id: string;
  orderId: string;
  fileName: string;
  filePath: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
}

const BUCKET = 'b2b-attachments';

export async function listB2BAttachments(orderId: string): Promise<B2BAttachment[]> {
  const { data, error } = await supabase.from('v2_b2b_attachments').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => ({
    id: row.id,
    orderId: row.order_id,
    fileName: row.file_name,
    filePath: row.file_path,
    contentType: row.content_type ?? 'application/octet-stream',
    fileSize: Number(row.file_size),
    createdAt: row.created_at,
  }));
}

export async function addB2BAttachment(orderId: string, file: File): Promise<void> {
  const filePath = `${orderId}/${crypto.randomUUID()}-${safeStorageFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { error: metadataError } = await supabase.from('v2_b2b_attachments').insert({
    order_id: orderId,
    file_name: file.name,
    file_path: filePath,
    content_type: file.type || null,
    file_size: file.size,
  });
  if (metadataError) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    throw new Error(metadataError.message);
  }
}

export async function deleteB2BAttachment(id: string): Promise<void> {
  const { data, error } = await supabase.from('v2_b2b_attachments').select('file_path').eq('id', id).single();
  if (error) throw new Error(error.message);
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([data.file_path]);
  if (storageError) throw new Error(storageError.message);
  const { error: metadataError } = await supabase.from('v2_b2b_attachments').delete().eq('id', id);
  if (metadataError) throw new Error(metadataError.message);
}

export async function downloadB2BAttachment(attachment: B2BAttachment): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).download(attachment.filePath);
  if (error) throw new Error(error.message);
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
