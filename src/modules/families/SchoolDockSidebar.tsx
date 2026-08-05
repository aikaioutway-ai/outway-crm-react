/**
 * Compatibility types for callers that still provide school-navigation data.
 *
 * The school dock was intentionally removed from every CRM module. Keeping the
 * zero-width component for now lets the surrounding module APIs stay stable
 * while ensuring no sidebar, reveal handle, or reserved gutter is rendered.
 */
export type SchoolDockItem = {
  key: string;
  label: string;
  color: string;
  logo?: string;
  disabled?: boolean;
  active?: boolean;
};

interface SchoolDockSidebarProps {
  items: SchoolDockItem[];
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  onSelect: (key: string) => void;
  ariaLabel?: string;
}

export const SCHOOL_DOCK_WIDTH = 0;
export const SCHOOL_DOCK_HIDDEN_WIDTH = 0;

export default function SchoolDockSidebar(_props: SchoolDockSidebarProps) {
  return null;
}
