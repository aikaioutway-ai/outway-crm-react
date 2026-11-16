export const SCHOOLS = [
  { code: "LIGHT", label: "LIGHT" },
  { code: "BILIM", label: "BILIM" },
  { code: "AES", label: "AES" },
  { code: "KAS", label: "KAS" },
  { code: "EPSILON", label: "EPSILON" },
  { code: "GENIUS", label: "GENIUS" },
  { code: "GENIUS4", label: "GENIUS 4" },
  { code: "NOVA", label: "NOVA" },
  { code: "INDIGO", label: "INDIGO" },
  { code: "ERUDIT", label: "ERUDIT" },
  { code: "TENSAY", label: "TENSAI" },
  { code: "EDISON", label: "EDISON" },
];

export const TOPICS = [
  {
    key: "info",
    title: "📢 Информация",
    text: ({ school, transfer }) =>
      `Добро пожаловать в OUTWAY × ${school} | Трансфер #${transfer}.\n\n` +
      "В этой теме публикуются важные объявления по трансферу: изменения, организационная информация и уведомления.\n\n" +
      "Пожалуйста, проверяйте эту тему регулярно.",
  },
  {
    key: "location",
    title: "📍 Геолокация",
    text: () =>
      "Здесь публикуется актуальная геолокация автомобиля во время выполнения трансфера.\n\n" +
      "Используйте эту тему, чтобы понимать, где находится автомобиль по маршруту.",
  },
  {
    key: "schedule",
    title: "🕒 Расписание",
    text: () =>
      "Здесь публикуется актуальная информация по времени подачи и изменениям расписания трансфера.\n\n" +
      "При изменении времени информация будет обновлена в этой теме.",
  },
  {
    key: "payments",
    title: "💰 Оплаты",
    text: () =>
      "Здесь публикуется общая информация по оплатам: сроки, реквизиты и организационные уведомления.\n\n" +
      "Индивидуальные суммы, задолженность и история платежей не публикуются в общей группе и сообщаются родителю лично.",
  },
  {
    key: "feedback",
    title: "💬 Обратная связь",
    text: () =>
      "Тема для вопросов, замечаний и предложений по работе трансфера.\n\n" +
      "По персональным вопросам, связанным с ребёнком или оплатой, рекомендуем обращаться к менеджеру OUTWAY лично.",
  },
];

export const schoolByCode = (code) =>
  SCHOOLS.find((school) => school.code === String(code).toUpperCase());

export const groupTitle = ({ school, transfer }) =>
  `OUTWAY × ${school} | Трансфер #${transfer}`;

export const groupAbout = ({ school, transfer }) =>
  `Официальная группа OUTWAY для родителей трансфера ${school} #${transfer}.\n\n` +
  "📢 Информация\n📍 Геолокация\n🕒 Расписание\n💰 Оплаты\n💬 Обратная связь";
