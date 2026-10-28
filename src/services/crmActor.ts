// Кто сейчас работает в CRM. Id сотрудника уходит в базу заголовком
// x-crm-employee, чтобы автоматические записи истории (например, «Отправлен
// в трансфер Х») знали автора. Только подпись в истории, не проверка прав.
let currentEmployeeId: string | null = null;

export function setCrmActor(employeeId: string | null | undefined): void {
  currentEmployeeId = employeeId || null;
}

export function getCrmActor(): string | null {
  return currentEmployeeId;
}
