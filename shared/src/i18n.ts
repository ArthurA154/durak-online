// Sprachen und die Übersetzung der Server-Meldungen.
// Der Server meldet Fehler auf Deutsch; das Frontend übersetzt sie über diese Tabelle.
// Ein Test im Backend prüft, dass jede Meldung aus dem Server-Code hier steht.

export const LANGS = ['de', 'en', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

type Other = { en: string; ru: string };

/** Feste Meldungen: deutscher Text → Englisch/Russisch */
export const SERVER_ERRORS: Record<string, Other> = {
  'Das Spiel wurde noch nicht gestartet': { en: 'The game has not started yet', ru: 'Игра ещё не началась' },
  'Pause – warte, bis alle wieder da sind': {
    en: 'Paused – wait until everyone is back',
    ru: 'Пауза – ждём, пока все вернутся',
  },
  'Raum nicht gefunden': { en: 'Room not found', ru: 'Комната не найдена' },
  'Der Gastgeber hat dich aus diesem Raum entfernt': {
    en: 'The host removed you from this room',
    ru: 'Хозяин удалил тебя из этой комнаты',
  },
  'Das Spiel läuft bereits': { en: 'The game is already running', ru: 'Игра уже идёт' },
  'Der Raum ist voll': { en: 'The room is full', ru: 'Комната заполнена' },
  'Sitzung abgelaufen': { en: 'Session expired', ru: 'Сессия истекла' },
  'Du bist nicht in diesem Raum': { en: 'You are not in this room', ru: 'Ты не в этой комнате' },
  'Leere Nachricht': { en: 'Empty message', ru: 'Пустое сообщение' },
  'In öffentlichen Räumen gehen nur Schnellsprüche': {
    en: 'Public rooms only allow quick phrases',
    ru: 'В открытых комнатах только быстрые фразы',
  },
  'Das kann man nicht werfen': { en: "You can't throw that", ru: 'Это нельзя бросить' },
  'Diesen Spieler gibt es nicht': { en: 'This player does not exist', ru: 'Такого игрока нет' },
  'Nicht auf dich selbst': { en: 'Not at yourself', ru: 'Не в себя' },
  'Nur der Gastgeber kann das ändern': { en: 'Only the host can change that', ru: 'Это может изменить только хозяин' },
  'Erst nach der Partie': { en: 'Only after the game', ru: 'Только после партии' },
  'Nur der Gastgeber kann Spieler entfernen': {
    en: 'Only the host can remove players',
    ru: 'Удалять игроков может только хозяин',
  },
  'Diesen Spieler gibt es nicht mehr': { en: 'This player is gone', ru: 'Этого игрока уже нет' },
  'Du kannst dich nicht selbst entfernen': { en: "You can't remove yourself", ru: 'Нельзя удалить себя' },
  'Nur der Gastgeber kann starten': { en: 'Only the host can start', ru: 'Начать может только хозяин' },
  'Es läuft gerade kein Spiel': { en: 'No game is running', ru: 'Сейчас нет игры' },
  'Du spielst nicht mit': { en: "You're not playing", ru: 'Ты не играешь' },
  'Bitte einen Namen eingeben': { en: 'Please enter a name', ru: 'Введи имя' },
  'Der Verteidiger kann nicht angreifen': { en: "The defender can't attack", ru: 'Отбивающийся не может ходить' },
  'Nur der Angreifer darf den ersten Zug machen': {
    en: 'Only the attacker makes the first move',
    ru: 'Первым ходит только нападающий',
  },
  'In diesem Raum wird ohne Weiterschieben gespielt': {
    en: 'This room plays without transferring',
    ru: 'В этой комнате играют без перевода',
  },
  'Nur die Nachbarn des Verteidigers dürfen nachlegen': {
    en: "Only the defender's neighbours may throw in",
    ru: 'Подкидывать могут только соседи отбивающегося',
  },
  'Nur Karten mit einem Wert, der schon auf dem Tisch liegt': {
    en: 'Only cards with a rank already on the table',
    ru: 'Только карты того же достоинства, что на столе',
  },
  'Es darf keine Karte mehr gelegt werden': { en: 'No more cards allowed', ru: 'Больше карт класть нельзя' },
  'Nur der Verteidiger darf schlagen': { en: 'Only the defender may beat', ru: 'Бить может только отбивающийся' },
  'Du hast schon „Schlucken“ gewählt': { en: "You've already chosen to take", ru: 'Ты уже берёшь' },
  'Diese Karte gibt es nicht': { en: "This card doesn't exist", ru: 'Такой карты нет' },
  'Diese Karte ist schon geschlagen': { en: 'This card is already beaten', ru: 'Эта карта уже побита' },
  'Diese Karte schlägt nicht': { en: "This card doesn't beat it", ru: 'Эта карта не бьёт' },
  'Nur der Verteidiger darf weiterschieben': {
    en: 'Only the defender may transfer',
    ru: 'Переводить может только отбивающийся',
  },
  'Es liegt nichts auf dem Tisch': { en: 'The table is empty', ru: 'На столе ничего нет' },
  'Nach dem ersten Schlagen kann nicht mehr weitergeschoben werden': {
    en: "You can't transfer after beating",
    ru: 'После того как побил, переводить нельзя',
  },
  'Weiterschieben nur mit einer Karte gleichen Werts': {
    en: 'Transfer only with a card of the same rank',
    ru: 'Переводить можно только картой того же достоинства',
  },
  'Zu viele Karten auf dem Tisch': { en: 'Too many cards on the table', ru: 'Слишком много карт на столе' },
  'Der nächste Spieler hat nicht genug Karten zum Verteidigen': {
    en: "The next player doesn't have enough cards",
    ru: 'У следующего игрока не хватит карт',
  },
  'Nur der Verteidiger kann schlucken': { en: 'Only the defender can take', ru: 'Брать может только отбивающийся' },
  'Du schluckst bereits': { en: "You're already taking", ru: 'Ты уже берёшь' },
  'Alles ist geschlagen': { en: 'Everything is beaten', ru: 'Всё побито' },
  'Der Verteidiger kann nicht passen': { en: "The defender can't pass", ru: 'Отбивающийся не может пасовать' },
  'Warte, bis der Verteidiger geschlagen hat': {
    en: 'Wait until the defender has beaten',
    ru: 'Подожди, пока отобьются',
  },
  'Das Spiel ist vorbei': { en: 'The game is over', ru: 'Игра окончена' },
  'Diese Karte hast du nicht': { en: "You don't have this card", ru: 'У тебя нет этой карты' },
  // aus server.ts
  'Zu viele Verbindungen von deiner Adresse': {
    en: 'Too many connections from your address',
    ru: 'Слишком много подключений с твоего адреса',
  },
  'Zu viele neue Räume – warte kurz': {
    en: 'Too many new rooms – wait a moment',
    ru: 'Слишком много новых комнат – подожди',
  },
  'Zu viele Versuche – warte kurz': { en: 'Too many attempts – wait a moment', ru: 'Слишком много попыток – подожди' },
  'Du bist in keinem Raum': { en: "You're not in a room", ru: 'Ты не в комнате' },
  'Nicht so schnell!': { en: 'Not so fast!', ru: 'Не так быстро!' },
  'Interner Fehler': { en: 'Internal error', ru: 'Внутренняя ошибка' },
};

/** Meldungen mit Zahlen oder Namen darin */
const PATTERNS: { re: RegExp; en: (...m: string[]) => string; ru: (...m: string[]) => string }[] = [
  {
    re: /^Mindestens (\d+) Spieler nötig$/,
    en: (n) => `At least ${n} players needed`,
    ru: (n) => `Нужно минимум ${n} игрока`,
  },
  {
    re: /^(\d+)–(\d+) Spieler nötig$/,
    en: (a, b) => `${a}–${b} players needed`,
    ru: (a, b) => `Нужно ${a}–${b} игрока`,
  },
  { re: /^(.+) ist wieder da$/, en: (n) => `${n} is back`, ru: (n) => `${n} снова здесь` },
  { re: /^Noch (\d+) Sekunden warten$/, en: (n) => `Wait ${n} more seconds`, ru: (n) => `Подожди ещё ${n} сек.` },
];

/** Server-Meldung in die gewünschte Sprache (unbekannte bleiben, wie sie sind). */
export function translateServer(message: string, lang: Lang): string {
  if (lang === 'de') return message;
  const fixed = SERVER_ERRORS[message];
  if (fixed) return fixed[lang];
  for (const p of PATTERNS) {
    const m = message.match(p.re);
    if (m) return p[lang](...m.slice(1));
  }
  return message;
}

/** Schnellsprüche je Sprache – in öffentlichen Räumen die einzigen erlaubten Nachrichten */
export const QUICK_BY_LANG: Record<Lang, string[]> = {
  de: ['😂', '👍', 'GG', 'Schluck!', 'Glück gehabt 🍀', 'Warte nur …', 'Ну ты дурак 😂'],
  en: ['😂', '👍', 'GG', 'Take it!', 'Lucky 🍀', 'Just wait …', 'Ну ты дурак 😂'],
  ru: ['😂', '👍', 'GG', 'Бери!', 'Повезло 🍀', 'Ну погоди …', 'Ну ты дурак 😂'],
};
