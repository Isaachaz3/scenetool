// All user-facing strings. Code, names and comments stay in English.
import type { AssetType, LineStyle, MeasurementMethod } from '../core/types';

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

const num = (n: number, digits = 2) =>
  Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');

/** "29 × 22 клетки", "30 × 20 клеток", "12,5 × 8,25 клетки". */
const cells = (rows: number) => {
  const r = Math.round(rows * 100) / 100;
  return Number.isInteger(r) ? plural(r, 'клетка', 'клетки', 'клеток') : 'клетки';
};

export const ru = {
  appName: 'VTT Lite',

  tools: {
    move: 'Перемещение',
    select: 'Выделение',
    fog: 'Туман',
    draw: 'Рисование',
    measure: 'Измерение',
    pointer: 'Указка',
    text: 'Текст',
    undo: 'Отменить',
    redo: 'Повторить',
    collapse: 'Свернуть панель',
    expand: 'Развернуть панель',
    nextStage: 'появится на этапе 2',
  },

  assetTypes: {
    map: 'Карты',
    prop: 'Предметы',
    mount: 'Транспорт',
    character: 'Персонажи',
    attachment: 'Вложения',
    note: 'Заметки',
  } satisfies Record<AssetType, string>,

  assetTypeSingle: {
    map: 'Карта',
    prop: 'Предмет',
    mount: 'Транспорт',
    character: 'Персонаж',
    attachment: 'Вложение',
    note: 'Заметка',
  } satisfies Record<AssetType, string>,

  layers: {
    map: 'Карта',
    drawing: 'Рисунок',
    prop: 'Предмет',
    mount: 'Транспорт',
    character: 'Персонаж',
    attachment: 'Вложение',
    note: 'Заметка',
    text: 'Текст',
    ruler: 'Линейка',
    fog: 'Туман',
  },

  dock: {
    search: 'Поиск',
    scenes: 'Сцены',
    assetManager: 'Менеджер ассетов',
    collection: 'Коллекция',
    newCollection: 'Новая коллекция…',
    add: 'Добавить',
    searchPlaceholder: 'Поиск по имени',
    empty: 'Пусто. Добавьте файлы кнопкой «Добавить» или перетащите их сюда.',
    noResults: 'Ничего не найдено',
    disc: 'Кружок',
    newScene: 'Новая сцена',
    sceneFromMap: 'Сцена из карты',
    dragHint: 'Перетащите на холст или щёлкните, чтобы добавить в центр',
  },

  scene: {
    defaultName: (n: number) => `Сцена ${n}`,
    rename: 'Переименовать',
    duplicate: 'Дублировать',
    delete: 'Удалить',
    deleteConfirm: (name: string) => `Удалить сцену «${name}»? Это нельзя отменить.`,
    copySuffix: ' (копия)',
    namePrompt: 'Название сцены',
    noScene: 'Нет открытой сцены',
    emptyHint: 'Перетащите карту на холст или создайте «Сцену из карты» во вкладке «Сцены».',
    saved: 'Сохранено',
    saving: 'Сохранение…',
    unsaved: 'Есть несохранённые изменения',
  },

  menu: {
    open: 'Меню',
    present: 'Вывести на экран игроков',
    stopPresent: 'Остановить вывод',
    playerWindow: 'Окно игроков',
    storage: 'Хранилище',
    settings: 'Настройки',
    hotkeys: 'Горячие клавиши',
  },

  playerStatus: {
    none: 'Экран игроков не подключён',
    connected: 'Экран игроков подключён',
    following: 'Экран игроков следует за вами',
    connecting: 'Подключение…',
  },

  grid: {
    title: 'Сетка',
    color: 'Цвет',
    colorNames: ['Чёрный', 'Белый', 'Оранжевый'],
    customColor: 'Свой цвет',
    opacity: 'Прозрачность',
    scale: 'Масштаб клетки',
    scaleHint: 'Например 5ft, 1,5м или 5.00mi',
    scaleInvalid: 'Не удалось разобрать масштаб',
    lineWidth: 'Толщина линии',
    snapping: 'Привязка',
    type: 'Тип сетки',
    types: { square: 'Квадрат' },
    lineStyle: 'Тип линии',
    lineStyles: { solid: 'Сплошная', dashed: 'Пунктир', dotted: 'Точки' } satisfies Record<LineStyle, string>,
    measurement: 'Измерение',
    measurements: {
      chessboard: 'Chessboard (D&D 5e)',
      alternating: 'Alternating (D&D 3.5)',
      euclidean: 'Euclidean',
      manhattan: 'Manhattan',
      hex: 'Hex',
    } satisfies Record<MeasurementMethod, string>,
    showToPlayers: 'Сетка у игроков',
    show: 'Показывать',
    hide: 'Скрыть',
    buttonHint: 'Сетка и вид',
  },

  view: {
    title: 'Вид',
    x: 'X, клеток',
    y: 'Y, клеток',
    zoom: 'Зум, %',
    reset: 'Сбросить вид',
    resetHint: 'Вписать карту или все элементы в экран (Home)',
    sync: 'Sync View',
    syncHint: 'Передать игрокам текущий вид (Y)',
    follow: 'Следовать',
    followHint: 'Постоянно повторять ваш вид у игроков (Shift+Y)',
  },

  item: {
    hide: 'Скрыть от игроков',
    show: 'Показать игрокам',
    lock: 'Заблокировать',
    unlock: 'Разблокировать',
    duplicate: 'Дублировать',
    size: 'Размер в клетках',
    sizeShort: 'Размер',
    forward: 'Вперёд',
    backward: 'Назад',
    layer: 'Слой',
    align: 'Выровнять по сетке',
    delete: 'Удалить',
    copy: 'Копировать',
    paste: 'Вставить',
  },

  align: {
    title: 'Выравнивание по сетке',
    cols: 'Колонки',
    rows: 'Строки',
    dpi: 'DPI',
    offsetX: 'Смещение X',
    offsetY: 'Смещение Y',
    keysHint: 'Стрелки — смещение на 1 px (Shift — 10 px), + и − — DPI на 0,1',
    done: 'Готово',
    cancel: 'Отмена',
    reset: 'Сбросить',
    updateScene: 'Обновить выравнивание этой карты в открытой сцене?',
  },

  gridSource: {
    uvtt: 'Universal VTT',
    filename: (cols: number, rows: number) => `Имя файла: ${num(cols)} × ${num(rows)} ${cells(rows)}`,
    metadata: (format: string, dpi: number, cols: number, rows: number) =>
      `Метаданные ${format}: ${num(dpi)} DPI → ${num(cols)} × ${num(rows)} ${cells(rows)}`,
    heuristic: 'Подбор по делимости',
    manual: (dpi: number, cols: number, rows: number) =>
      `Вручную: ${num(dpi)} DPI → ${num(cols)} × ${num(rows)} ${cells(rows)}`,
    fallback: (dpi: number, cols: number, rows: number) =>
      `По умолчанию: ${num(dpi)} DPI → ${num(cols)} × ${num(rows)} ${cells(rows)}`,
    check: 'проверьте',
    checkAlignment: 'проверьте выравнивание',
    aspectMismatch: 'строки не совпадают с колонками — проверьте',
    duplicate: 'уже в библиотеке',
  },

  importer: {
    title: (n: number) => `Импорт: ${n} ${plural(n, 'файл', 'файла', 'файлов')}`,
    type: 'Тип',
    visibility: 'Видимость',
    visible: 'Видно игрокам',
    locked: 'Заблокировано',
    size: 'Размер',
    sizeModes: { auto: 'Авто', dpi: 'Задать DPI', cols: 'Задать колонки', rows: 'Задать строки' },
    rotation: 'Поворот',
    label: 'Подпись',
    labelModes: { none: 'Нет', filename: 'Имя файла', custom: 'Свой текст' },
    import: (n: number) => `Импортировать (${n})`,
    cancel: 'Отмена',
    analyzing: 'Анализ…',
    failed: 'Не удалось прочитать',
    unsupported: 'Формат не поддерживается',
    tooLarge: (side: number) => `Сторона ${side} px больше 16 384 — браузер может не справиться`,
    imported: (n: number) => `Добавлено: ${n}`,
    dropHere: 'Отпустите, чтобы добавить',
  },

  sceneImport: {
    title: 'Сцена из карты',
    name: 'Название сцены',
    scale: 'Масштаб клетки',
    create: 'Создать сцену',
    pick: 'Выберите файл карты',
    previewHint: 'Колесо — зум, перетаскивание — сдвиг',
  },

  newScene: {
    title: 'Новая сцена',
    create: 'Создать',
  },

  disc: {
    title: 'Кружок',
    color: 'Цвет',
    text: 'Текст',
    size: 'Размер в клетках',
    add: 'Добавить в центр',
  },

  manager: {
    title: 'Менеджер ассетов',
    rename: 'Переименовать',
    delete: 'Удалить',
    deleteConfirm: (name: string) => `Удалить «${name}»?`,
    deleteUsed: (name: string, n: number) =>
      `«${name}» стоит в ${n} ${plural(n, 'сцене', 'сценах', 'сценах')}. Удалить ассет и его копии из сцен?`,
    edit: 'Настройки',
    name: 'Имя',
    type: 'Тип',
    defaults: 'По умолчанию',
    rotation: 'Поворот',
    sizeCells: 'Размер в клетках',
    save: 'Сохранить',
    close: 'Закрыть',
    usedIn: (n: number) =>
      n === 0 ? 'нигде не используется' : `в ${n} ${plural(n, 'сцене', 'сценах', 'сценах')}`,
    collectionName: 'Название коллекции',
    defaultCollection: 'Default',
    pixels: (w: number, h: number) => `${w} × ${h} px`,
    open: 'Открыть',
  },

  settings: {
    title: 'Настройки',
    playerDefaults: 'Показывать игрокам по умолчанию',
    grid: 'Сетка',
    ruler: 'Линейка и movement',
    pointer: 'Указка',
    fogOpacity: 'Прозрачность тумана для ведущего',
    syncDuration: 'Длительность анимации Sync View, мс',
    close: 'Закрыть',
  },

  storage: {
    title: 'Хранилище',
    used: (used: string, quota: string) => `Занято ${used} из ${quota}`,
    unknown: 'Браузер не сообщает размер хранилища',
    persisted: 'Постоянное хранение включено: браузер не удалит данные сам',
    notPersisted: 'Постоянное хранение не включено: при нехватке места браузер может удалить данные',
    requestPersist: 'Запросить постоянное хранение',
    assets: (n: number) => `Ассетов: ${n}`,
    scenes: (n: number) => `Сцен: ${n}`,
    backupLater: 'Резервные копии и таблица ассетов — на этапе 2.',
    close: 'Закрыть',
  },

  hotkeys: {
    title: 'Горячие клавиши',
    close: 'Закрыть',
    list: [
      ['Перемещение', 'H'],
      ['Выделение', 'S'],
      ['Текст', 'T'],
      ['Отменить / повторить', 'Ctrl+Z / Ctrl+Shift+Z или Ctrl+Y'],
      ['Копировать / вставить / дублировать', 'Ctrl+C / Ctrl+V / Ctrl+D'],
      ['Удалить выделенное', 'Delete или Backspace'],
      ['Скрыть или показать игрокам', 'Shift+H'],
      ['Заблокировать или разблокировать', 'Shift+L'],
      ['Сдвиг холста', 'пробел + перетаскивание, средняя кнопка мыши'],
      ['Отключить привязку на время', 'зажать Ctrl'],
      ['Добавить к выделению', 'Shift'],
      ['Копия при перетаскивании', 'Alt'],
      ['Отмена действия', 'Esc'],
      ['Сбросить вид', 'Home'],
      ['Sync View / переключить «Следовать»', 'Y / Shift+Y'],
    ] as [string, string][],
  },

  text: {
    font: 'Шрифт',
    fonts: { sans: 'Без засечек', serif: 'С засечками', fantasy: 'Фэнтези' },
    size: 'Размер',
    color: 'Цвет',
    background: 'Подложка',
    backgrounds: { none: 'Нет', dark: 'Тёмная плашка' },
    bold: 'Жирный',
    align: 'Выравнивание',
    aligns: { left: 'Влево', center: 'По центру', right: 'Вправо' },
  },

  player: {
    waiting: 'Ожидание ведущего…',
    noOpener: 'Откройте это окно из меню ведущего: «Окно игроков».',
    fullscreen: 'На весь экран',
  },

  common: {
    ok: 'OK',
    confirm: 'Подтверждение',
    cancel: 'Отмена',
    yes: 'Да',
    no: 'Нет',
    close: 'Закрыть',
    on: 'Вкл',
    off: 'Выкл',
    error: 'Ошибка',
    loading: 'Загрузка…',
  },

  errors: {
    storageOpen: 'Не удалось открыть хранилище браузера. Возможно, включён приватный режим.',
    popupBlocked: 'Браузер заблокировал всплывающее окно. Разрешите всплывающие окна для этого сайта.',
    presentFailed: 'Не удалось вывести на экран игроков',
  },
};

export type Dict = typeof ru;
export const t = ru;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 ** 2) return `${num(n / 1024, 1)} КБ`;
  if (n < 1024 ** 3) return `${num(n / 1024 ** 2, 1)} МБ`;
  return `${num(n / 1024 ** 3, 1)} ГБ`;
}
