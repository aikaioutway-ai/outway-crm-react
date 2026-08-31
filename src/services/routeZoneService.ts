import { supabase } from './supabase';

export type RouteZoneShape = 'polygon' | 'rectangle';
export type RouteZoneCoordinates = number[][][];

export interface RouteZone {
  id: string;
  schoolKey: string;
  name: string;
  shapeType: RouteZoneShape;
  coordinates: RouteZoneCoordinates;
  fillColor: string;
  strokeColor: string;
  fillOpacity: number;
  transferNumber: number | null;
  comment: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveRouteZoneInput {
  schoolKey: string;
  name: string;
  shapeType: RouteZoneShape;
  coordinates: RouteZoneCoordinates;
  fillColor: string;
  strokeColor: string;
  fillOpacity: number;
  transferNumber?: number | null;
  comment?: string;
  createdBy?: string;
}

function mapRouteZone(row: any): RouteZone {
  return {
    id: String(row.id),
    schoolKey: String(row.school_key),
    name: String(row.name),
    shapeType: row.shape_type === 'rectangle' ? 'rectangle' : 'polygon',
    coordinates: Array.isArray(row.coordinates) ? row.coordinates : [],
    fillColor: String(row.fill_color ?? '#2AA5A5'),
    strokeColor: String(row.stroke_color ?? '#167C80'),
    fillOpacity: Number(row.fill_opacity ?? 0.28),
    transferNumber: row.transfer_number == null ? null : Number(row.transfer_number),
    comment: String(row.comment ?? ''),
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function toRow(input: SaveRouteZoneInput) {
  return {
    school_key: input.schoolKey,
    name: input.name.trim(),
    shape_type: input.shapeType,
    coordinates: input.coordinates,
    fill_color: input.fillColor,
    stroke_color: input.strokeColor,
    fill_opacity: input.fillOpacity,
    transfer_number: input.transferNumber ?? null,
    comment: input.comment?.trim() || null,
    created_by: input.createdBy?.trim() || null,
  };
}

export async function fetchRouteZones(schoolKey: string): Promise<RouteZone[]> {
  const { data, error } = await supabase
    .from('v2_route_zones')
    .select('*')
    .eq('school_key', schoolKey)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRouteZone);
}

export async function createRouteZone(input: SaveRouteZoneInput): Promise<RouteZone> {
  const { data, error } = await supabase
    .from('v2_route_zones')
    .insert(toRow(input))
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapRouteZone(data);
}

export async function updateRouteZone(id: string, input: SaveRouteZoneInput): Promise<RouteZone> {
  const { data, error } = await supabase
    .from('v2_route_zones')
    .update(toRow(input))
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapRouteZone(data);
}

export async function deleteRouteZone(id: string): Promise<void> {
  const { error } = await supabase.from('v2_route_zones').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
