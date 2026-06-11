import { School, SchoolCode } from '../types';

export const SCHOOLS: School[] = [
  { code: 'KINGS',   name: 'Kings',          zones: 3 },
  { code: 'LIGHT',   name: 'Light Academy',  zones: 3 },
  { code: 'BILIM',   name: 'Bilim KG',       zones: 3 },
  { code: 'AES',     name: 'AES',            zones: 3 },
  { code: 'KAS',     name: 'KAS',            zones: 3 },
  { code: 'EPSILON', name: 'Epsilon',         zones: 3 },
  { code: 'GENIUS',  name: 'Genius',          zones: 3 },
  { code: 'GENIUS4', name: 'Genius 4',        zones: 3 },
  { code: 'NOVA',    name: 'Nova',            zones: 3 },
  { code: 'INDIGO',  name: 'Indigo',          zones: 3 },
  { code: 'ERUDIT',  name: 'Erudit',          zones: 2 },
  { code: 'TENSAY',  name: 'Tensay',          zones: 2 },
  { code: 'EDISON',  name: 'Edison',          zones: 2 },
];

export function schoolByCode(code: SchoolCode): School | undefined {
  return SCHOOLS.find(s => s.code === code);
}
