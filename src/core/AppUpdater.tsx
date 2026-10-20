import { useSilentAppUpdate } from '../services/appUpdate';

/** Ничего не рисует: тихо подтягивает новую версию CRM после долгого перерыва. */
export default function AppUpdater() {
  useSilentAppUpdate();
  return null;
}
