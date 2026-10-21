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
  },

  assetTypes: {
    map: 'Карты',
    prop: 'Предметы',
    mount: 'Транспорт',
    character: 'Персонажи',
    attachment: 'Вложения',
    note: 'Заметки',
    backdrop: 'Фоны',
  } satisfies Record<AssetType, string>,

  assetTypeSingle: {
    map: 'Карта',
    prop: 'Предмет',
    mount: 'Транспорт',
    character: 'Персонаж',
    attachment: 'Вложение',
    note: 'Заметка',
    backdrop: 'Фоновое изображение',
  } satisfies Record<AssetType, string>,

  backdrop: {
    tileHint: 'Нажмите, чтобы показать поверх сцены, ещё раз — чтобы убрать',
    shown: (name: string) => `Поверх сцены: «${name}»`,
    hide: 'Убрать',
    minimize: 'Свернуть у себя',
    expand: 'Развернуть',
    minimizedHint: 'Игроки видят фон, а вы — сцену',
    auto: 'Авто',
    autoHint: 'Кадр по самой детальной части картинки',
    cropHint:
      'Фон заполняет экран игроков целиком; светлая рамка — то, что они видят. Щёлкните или тяните, чтобы сдвинуть кадр.',
  },

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
    unsaved: 'Не сохранено',
  },

  menu: {
    open: 'Меню',
    present: 'Вывести на экран игроков',
    stopPresent: 'Остановить вывод',
    playerWindow: 'Окно игроков',
    storage: 'Хранилище',
    cloud: 'Облако',
    settings: 'Настройки',
    hotkeys: 'Горячие клавиши',
    welcome: 'Начальный экран',
  },

  ambient: {
    title: 'Эмбиент',
    volume: 'Громкость',
    play: 'Включить звук',
    pause: 'Пауза',
    silence: 'Тишина: выберите общий эмбиент или эмбиент сцены',
    nowPlaying: (name: string, scene: boolean, paused: boolean) =>
      `${paused ? 'На паузе' : 'Играет'}: «${name}»${scene ? ' (эмбиент сцены)' : ' (общий)'}`,
    blocked: 'Браузер ждёт щелчка по странице, чтобы включить звук',
    global: 'Общий — играет во всех сценах',
    none: '— без звука —',
    scene: (name: string) => `Сцена «${name}» — начинается при открытии сцены`,
    sceneNone: '— как общий —',
    library: 'Звуки',
    empty: 'Добавьте ссылку на YouTube или аудиофайл.',
    linkPlaceholder: 'Ссылка на YouTube',
    addLink: 'Добавить',
    addFile: 'Загрузить MP3 или другой аудиофайл',
    added: (name: string) => `Добавлено: «${name}»`,
    addFailed: 'не удалось добавить',
    badLink: 'Не похоже на ссылку YouTube',
    trackVolume: (v: number) => `Громкость дорожки: ${v}%`,
    rename: 'Переименовать',
    delete: 'Удалить',
    deleteConfirm: (name: string) => `Удалить звук «${name}»? Сцены с ним перейдут на общий эмбиент.`,
    hint: 'Всё играет по кругу и звучит из окна ведущего. Эмбиент сцены плавно перекрывает общий, а при уходе из сцены общий возвращается.',
  },

  welcome: {
    title: 'VTT Lite',
    subtitle: 'Стол для очной игры: ваш экран и экран игроков',
    start: 'Начать',
    newScene: 'Новая сцена',
    sceneFromMap: 'Сцена из карты',
    continue: (name: string) => `Продолжить: «${name}»`,
    players: 'Экран игроков',
    present: 'Вывести на второй экран',
    presenting: 'Выводится на второй экран',
    stopPresent: 'Остановить вывод',
    playerWindow: 'Открыть окно игроков',
    presentHint: 'Chrome или Edge: ТВ или монитор в режиме «Расширить», либо Chromecast.',
    scenes: 'Сцены',
    noScenes: 'Сцен пока нет — создайте первую из карты.',
    search: 'Поиск сцены',
    showOnStart: 'Показывать при запуске',
    close: 'Закрыть',
    edited: (date: string) => `изменена ${date}`,
  },

  playerFrame: {
    label: 'Экран игроков',
  },

  playerStatus: {
    none: 'Экран игроков не подключён',
    connected: 'Экран игроков подключён',
    following: 'Экран игроков следует за вами',
    connecting: 'Подключение…',
    short: { none: 'Игроки: нет', connected: 'Игроки: на связи', following: 'Игроки: следуют' },
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
    label: 'Подпись',
    labelPrompt: 'Подпись под фишкой (пусто — убрать)',
    attachTo: (name: string) => `Прикрепить к «${name}»`,
    detach: 'Открепить',
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
    candidates: 'Делится без остатка:',
    candidate: (dpi: number, cols: number, rows: number) => `${num(dpi)} DPI · ${num(cols)}×${num(rows)}`,
    updateScene: 'Обновить выравнивание этой карты в открытой сцене?',
  },

  visualAlign: {
    open: 'Визуальная подгонка',
    stepNames: ['1. Угол', '2. Размер', '3. Уточнение'],
    step1:
      'Щёлкните или перетащите якорь на угол любой клетки карты. Колесо — масштаб, перетаскивание мимо якоря — сдвиг.',
    step2: 'Тяните правую ручку, пока четыре клетки рамки не совпадут с четырьмя клетками карты.',
    step3:
      'Ручка у дальнего края убирает накопленный сдвиг: совместите её с пересечением линий карты. Shift — одна ось, Ctrl — медленно.',
    values: (dpi: number, cols: number, rows: number) =>
      `${num(dpi)} DPI → ${num(cols)} × ${num(rows)} ${cells(rows)}`,
    keys: 'Enter — дальше, Esc — отмена',
    back: 'Назад',
    next: 'Дальше',
    done: 'Готово',
  },

  gridSource: {
    uvtt: 'Universal VTT',
    filename: (cols: number, rows: number) => `Имя файла: ${num(cols)} × ${num(rows)} ${cells(rows)}`,
    metadata: (format: string, dpi: number, cols: number, rows: number) =>
      `Метаданные ${format}: ${num(dpi)} DPI → ${num(cols)} × ${num(rows)} ${cells(rows)}`,
    heuristic: (dpi: number, cols: number, rows: number) =>
      `Подбор по делимости: ${num(dpi)} DPI → ${num(cols)} × ${num(rows)} ${cells(rows)}`,
    pickCandidate: 'выберите подходящий вариант ниже',
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
    close: 'Закрыть',
    backup: 'Резервная копия',
    backupHint:
      'Все сцены и картинки одним файлом .vttlite.zip. Очистка данных сайта стирает всё, поэтому делайте копию регулярно.',
    lastBackup: (date: string) => `Последняя копия: ${date}`,
    noBackup: 'Копий ещё не было',
    export: 'Экспорт копии',
    import: 'Импорт копии',
    exporting: 'Собираю архив…',
    importing: 'Импортирую…',
    badFile: 'Это не резервная копия VTT Lite',
    newerVersion: 'Копия сделана более новой версией приложения',
    importSuffix: ' (импорт)',
    conflicts: (n: number) =>
      `${n} ${plural(n, 'элемент', 'элемента', 'элементов')} из копии уже есть в библиотеке, но отличаются. Что сделать?`,
    replace: 'Заменить',
    keepBoth: 'Сохранить обе версии',
    imported: (scenes: number, assets: number) => `Импортировано: сцен — ${scenes}, ассетов — ${assets}`,
    assetsTable: 'Ассеты по размеру',
    colName: 'Имя',
    colType: 'Тип',
    colSize: 'Размер',
    colUsage: 'Сцен',
    deleteUnused: (n: number, size: string) => `Удалить неиспользуемые (${n}, ${size})`,
    deleteUnusedConfirm: (n: number) =>
      `Удалить ${n} ${plural(n, 'ассет', 'ассета', 'ассетов')}, которые не стоят ни в одной сцене?`,
    noUnused: 'Неиспользуемых ассетов нет',
  },

  hotkeys: {
    title: 'Горячие клавиши',
    close: 'Закрыть',
    list: [
      ['Перемещение', 'H'],
      ['Выделение', 'S'],
      ['Туман', 'F'],
      ['Рисование', 'D'],
      ['Измерение: линейка', 'R'],
      ['Измерение: движение', 'M'],
      ['Указка', 'P'],
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
      ['Отмена действия, убрать фон', 'Esc'],
      ['Точка излома линейки', 'W во время протягивания'],
      ['Постоянная линейка', 'двойной клик линейкой'],
      ['Завершить многоугольник / убрать угол', 'Enter / Backspace'],
      ['Предпросмотр глазами игроков', 'Shift+P'],
      ['Сбросить вид', 'Home'],
      ['Sync View / переключить «Следовать»', 'Y / Shift+Y'],
    ] as [string, string][],
  },

  measure: {
    ruler: 'Линейка',
    movement: 'Движение',
    method: 'Метод',
    rulerHint:
      'Зажмите и тяните: концы встают в центры клеток (Ctrl — без привязки), W — точка излома. Двойной клик ставит постоянную линейку: щелчки — изломы, двойной клик или Enter — готово',
    movementHint: 'Тяните фишку: за ней тянется линейка, W — точка излома, Esc возвращает на место',
  },

  draw: {
    modes: {
      brush: 'Кисть',
      line: 'Линия',
      rect: 'Прямоугольник',
      ellipse: 'Круг',
      polygon: 'Многоугольник',
      eraser: 'Ластик',
    },
    stroke: 'Обводка',
    width: 'Толщина',
    fill: 'Заливка',
    opacity: 'Прозрачность',
    eraserHint: 'Коснитесь рисунка, чтобы удалить его целиком',
  },

  fog: {
    modes: { rect: 'Прямоугольник', polygon: 'Многоугольник', ellipse: 'Круг', brush: 'Кисть' },
    fill: 'Заливка',
    fillHint: 'Туман на всю сцену: игроки видят только разрезанное',
    cutByDefault: 'Новые фигуры разрезаны',
    preview: 'Глазами игроков',
    previewHint: 'Непрозрачный туман и без скрытых элементов (Shift+P)',
    color: 'Цвет',
    gmOpacity: 'Видимость для ведущего',
    cut: 'Разрезать (открыть)',
    restore: 'Вернуть туман',
    polygonHint: 'Клики по углам; Enter или двойной клик — готово, Backspace — убрать угол',
    clickHint: 'Щелчок по фигуре — выбрать её',
  },

  cloud: {
    title: 'Облако',
    intro:
      'Сцены и картинки хранятся в вашем проекте Supabase и открываются с любого компьютера. Работа идёт как раньше, а изменения уходят в облако сами.',
    localOnly: 'Пока вы не вошли, всё хранится только в этом браузере.',
    email: 'Почта',
    password: 'Пароль',
    signIn: 'Войти',
    signUp: 'Создать аккаунт',
    signOut: 'Выйти',
    signedInAs: (email: string) => `Вы вошли как ${email}`,
    syncNow: 'Синхронизировать сейчас',
    checkEmail: (email: string) =>
      `Письмо отправлено на ${email}. Откройте ссылку из него на этом компьютере — и вы войдёте.`,
    lastSync: (time: string) => `Последняя синхронизация: ${time}`,
    usageTitle: 'Занято в облаке (бесплатный тариф)',
    usageFiles: (used: string, limit: string, n: number) =>
      `Картинки: ${used} из ${limit} · ${n} ${plural(n, 'файл', 'файла', 'файлов')}`,
    usageDatabase: (used: string, limit: string) => `База данных: ${used} из ${limit}`,
    usageNote: 'В базу входят служебные таблицы Supabase: даже пустой проект занимает несколько десятков МБ.',
    usageMissing:
      'Чтобы видеть занятое место, запустите обновлённый supabase/schema.sql ещё раз в SQL Editor.',
    usageShort: (files: string, db: string) => `Картинки: ${files} · база: ${db}`,
    uploading: (i: number, n: number) => `Загружаю картинки в облако: ${i} из ${n}`,
    pushing: 'Отправляю изменения…',
    pulling: 'Получаю изменения…',
    status: {
      loading: 'Облако…',
      'signed-out': 'Облако: вход не выполнен',
      idle: 'Облако: всё сохранено',
      syncing: 'Облако: синхронизация…',
      error: 'Облако: ошибка',
    },
    chip: {
      loading: 'Облако…',
      'signed-out': 'Облако: выкл.',
      idle: 'Облако ✓',
      syncing: 'Облако…',
      error: 'Облако: ошибка',
    },
    errors: {
      invalid: 'Неверная почта или пароль',
      notConfirmed: 'Почта не подтверждена: откройте ссылку из письма',
      exists: 'Такой аккаунт уже есть — нажмите «Войти»',
      weak: 'Пароль — минимум 6 символов',
      rate: 'Слишком много писем подряд, подождите немного',
      network: 'Нет связи с облаком, проверьте интернет',
      schema: 'В облаке нет таблиц: запустите supabase/schema.sql в SQL Editor',
      tracksSchema:
        'Музыка не синхронизируется: запустите обновлённый supabase/schema.sql в SQL Editor ещё раз. Остальное в облаке.',
      generic: (m: string) => `Ошибка: ${m}`,
    },
  },

  pointer: {
    hint: 'Зажмите кнопку мыши — игроки увидят лазерную точку',
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
