import { School, SchoolCode } from '../types';

export const SCHOOLS: School[] = [
  { code: 'KINGS',   name: 'Kings',         short: 'KNG',    zones: 3 },
  { code: 'LIGHT',   name: 'Light Academy', short: 'LA',     zones: 3 },
  { code: 'BILIM',   name: 'Bilim KG',      short: 'BKG',    zones: 3 },
  { code: 'AES',     name: 'AES',           short: 'AES',    zones: 3 },
  { code: 'KAS',     name: 'KAS',           short: 'KAS',    zones: 3 },
  { code: 'EPSILON', name: 'Epsilon',        short: 'EPS',    zones: 3 },
  { code: 'GENIUS',  name: 'Genius',         short: 'GEN #2', zones: 3 },
  { code: 'GENIUS4', name: 'Genius 4',       short: 'GEN #4', zones: 3 },
  { code: 'NOVA',    name: 'Nova',           short: 'NOVA',   zones: 3 },
  { code: 'INDIGO',  name: 'Indigo',         short: 'ING',    zones: 3 },
  { code: 'ERUDIT',  name: 'Erudit',         short: 'ERU',    zones: 2 },
  { code: 'TENSAY',  name: 'Tensay',         short: 'TIS',    zones: 2 },
  { code: 'EDISON',  name: 'Edison',         short: 'EDI',    zones: 2 },
];

export function schoolByCode(code: SchoolCode): School | undefined {
  return SCHOOLS.find(s => s.code === code);
}
