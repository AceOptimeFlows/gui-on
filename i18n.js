/* i18n.js
 * Loader simple de JSONs de idioma:
 *   /es.json, /en.json, /pt-BR.json, etc.
 *   /lang/es.json, /lang/en.json, /lang/pt-BR.json, etc.
 *
 * Expone window.I18n con:
 *   - I18n.setLang(lang): Promise<void>
 *   - I18n.t(key, fallback?): string | null
 *   - I18n.applyI18nToDom(root?): void
 *   - I18n.getLang(): string
 */

(function (global) {
  const defaultLang = 'es';
  let currentLang = defaultLang;

  // cache[lang] = { "clave": "texto", ... }
  const cache = {};
  let currentLoad = null;
  const SUPPLEMENTAL_MESSAGES = {
    es: {
      'p1.tplNamePlaceholder': 'Nombre de la plantilla',
      'p1.titlePlaceholder': 'Mi guion',
      'p1.loglinePlaceholder': 'Una frase clara que capture tu historia…',
      'p1.authorPlaceholder': 'Nombre del autor',
      'p1.emailPlaceholder': 'autor@ejemplo.com',
      'p1.licensePlaceholder': 'p. ej. CC BY 4.0',
      'p1.keywordsPlaceholder': 'palabra1; palabra2; palabra3',
      'p1.notesPlaceholder': 'Observaciones / dedicatorias / etc.',
      'p1.abstractPlaceholder': 'Un resumen conciso del guion…',
      'p2.charNamePlaceholder': 'Nombre del personaje / voz',
      'p2.sceneTitlePlaceholder': 'Acto 1, Escena 1 — o Segmento 1…',
      'p3.elemTextPlaceholder': 'Escribe aquí…'
    },
    ca: {
      'p1.tplNamePlaceholder': 'Nom de la plantilla',
      'p1.titlePlaceholder': 'El meu guió',
      'p1.loglinePlaceholder': 'Una frase clara que capturi la teva història…',
      'p1.authorPlaceholder': 'Nom de l’autor',
      'p1.emailPlaceholder': 'autor@exemple.com',
      'p1.licensePlaceholder': 'p. ex. CC BY 4.0',
      'p1.keywordsPlaceholder': 'paraula1; paraula2; paraula3',
      'p1.notesPlaceholder': 'Observacions / dedicatòries / etc.',
      'p1.abstractPlaceholder': 'Un resum concís del guió…',
      'p2.charNamePlaceholder': 'Nom del personatge / veu',
      'p2.sceneTitlePlaceholder': 'Acte 1, Escena 1 — o Segment 1…',
      'p3.elemTextPlaceholder': 'Escriu aquí…'
    },
    en: {
      'p1.tplNamePlaceholder': 'Template name',
      'p1.titlePlaceholder': 'My script',
      'p1.loglinePlaceholder': 'A clear sentence that captures your story…',
      'p1.authorPlaceholder': 'Author name',
      'p1.emailPlaceholder': 'author@example.com',
      'p1.licensePlaceholder': 'e.g. CC BY 4.0',
      'p1.keywordsPlaceholder': 'keyword1; keyword2; keyword3',
      'p1.notesPlaceholder': 'Notes / dedications / etc.',
      'p1.abstractPlaceholder': 'A concise summary of the script…',
      'p2.charNamePlaceholder': 'Character / voice name',
      'p2.sceneTitlePlaceholder': 'Act 1, Scene 1 — or Segment 1…',
      'p3.elemTextPlaceholder': 'Write here…'
    },
    'pt-br': {
      'p1.tplNamePlaceholder': 'Nome do modelo',
      'p1.titlePlaceholder': 'Meu roteiro',
      'p1.loglinePlaceholder': 'Uma frase clara que capture sua história…',
      'p1.authorPlaceholder': 'Nome do autor',
      'p1.emailPlaceholder': 'autor@exemplo.com',
      'p1.licensePlaceholder': 'ex.: CC BY 4.0',
      'p1.keywordsPlaceholder': 'palavra1; palavra2; palavra3',
      'p1.notesPlaceholder': 'Observações / dedicatórias / etc.',
      'p1.abstractPlaceholder': 'Um resumo conciso do roteiro…',
      'p2.charNamePlaceholder': 'Nome do personagem / voz',
      'p2.sceneTitlePlaceholder': 'Ato 1, Cena 1 — ou Segmento 1…',
      'p3.elemTextPlaceholder': 'Escreva aqui…'
    },
    fr: {
      'p1.tplNamePlaceholder': 'Nom du modèle',
      'p1.titlePlaceholder': 'Mon script',
      'p1.loglinePlaceholder': 'Une phrase claire qui résume votre histoire…',
      'p1.authorPlaceholder': 'Nom de l’auteur',
      'p1.emailPlaceholder': 'auteur@exemple.com',
      'p1.licensePlaceholder': 'ex. : CC BY 4.0',
      'p1.keywordsPlaceholder': 'mot-clé1 ; mot-clé2 ; mot-clé3',
      'p1.notesPlaceholder': 'Observations / dédicaces / etc.',
      'p1.abstractPlaceholder': 'Un résumé concis du script…',
      'p2.charNamePlaceholder': 'Nom du personnage / de la voix',
      'p2.sceneTitlePlaceholder': 'Acte 1, Scène 1 — ou Segment 1…',
      'p3.elemTextPlaceholder': 'Écrivez ici…'
    },
    de: {
      'p1.tplNamePlaceholder': 'Name der Vorlage',
      'p1.titlePlaceholder': 'Mein Skript',
      'p1.loglinePlaceholder': 'Ein klarer Satz, der deine Geschichte einfängt…',
      'p1.authorPlaceholder': 'Name des Autors',
      'p1.emailPlaceholder': 'autor@beispiel.de',
      'p1.licensePlaceholder': 'z. B. CC BY 4.0',
      'p1.keywordsPlaceholder': 'stichwort1; stichwort2; stichwort3',
      'p1.notesPlaceholder': 'Notizen / Widmungen / usw.',
      'p1.abstractPlaceholder': 'Eine knappe Zusammenfassung des Skripts…',
      'p2.charNamePlaceholder': 'Name der Figur / Stimme',
      'p2.sceneTitlePlaceholder': 'Akt 1, Szene 1 — oder Segment 1…',
      'p3.elemTextPlaceholder': 'Hier schreiben…'
    },
    it: {
      'p1.tplNamePlaceholder': 'Nome del modello',
      'p1.titlePlaceholder': 'Il mio copione',
      'p1.loglinePlaceholder': 'Una frase chiara che racchiuda la tua storia…',
      'p1.authorPlaceholder': 'Nome dell’autore',
      'p1.emailPlaceholder': 'autore@esempio.com',
      'p1.licensePlaceholder': 'es. CC BY 4.0',
      'p1.keywordsPlaceholder': 'parola1; parola2; parola3',
      'p1.notesPlaceholder': 'Osservazioni / dediche / ecc.',
      'p1.abstractPlaceholder': 'Un riassunto conciso del copione…',
      'p2.charNamePlaceholder': 'Nome del personaggio / della voce',
      'p2.sceneTitlePlaceholder': 'Atto 1, Scena 1 — oppure Segmento 1…',
      'p3.elemTextPlaceholder': 'Scrivi qui…'
    },
    hi: {
      'p1.tplNamePlaceholder': 'टेम्पलेट का नाम',
      'p1.titlePlaceholder': 'मेरी पटकथा',
      'p1.loglinePlaceholder': 'एक स्पष्ट वाक्य जो आपकी कहानी को समेटे…',
      'p1.authorPlaceholder': 'लेखक का नाम',
      'p1.emailPlaceholder': 'author@example.com',
      'p1.licensePlaceholder': 'उदाहरण: CC BY 4.0',
      'p1.keywordsPlaceholder': 'शब्द1; शब्द2; शब्द3',
      'p1.notesPlaceholder': 'टिप्पणियाँ / समर्पण / आदि',
      'p1.abstractPlaceholder': 'पटकथा का एक संक्षिप्त सार…',
      'p2.charNamePlaceholder': 'पात्र / आवाज़ का नाम',
      'p2.sceneTitlePlaceholder': 'अंक 1, दृश्य 1 — या खंड 1…',
      'p3.elemTextPlaceholder': 'यहाँ लिखें…'
    },
    'zh-cn': {
      'p1.tplNamePlaceholder': '模板名称',
      'p1.titlePlaceholder': '我的剧本',
      'p1.loglinePlaceholder': '用一句清晰的话概括你的故事…',
      'p1.authorPlaceholder': '作者姓名',
      'p1.emailPlaceholder': 'author@example.com',
      'p1.licensePlaceholder': '例如：CC BY 4.0',
      'p1.keywordsPlaceholder': '关键词1；关键词2；关键词3',
      'p1.notesPlaceholder': '备注 / 献词 / 等',
      'p1.abstractPlaceholder': '剧本的简明摘要…',
      'p2.charNamePlaceholder': '角色 / 声音名称',
      'p2.sceneTitlePlaceholder': '第1幕，第1场——或第1段…',
      'p3.elemTextPlaceholder': '在这里输入…'
    },
    ko: {
      'p1.tplNamePlaceholder': '템플릿 이름',
      'p1.titlePlaceholder': '내 대본',
      'p1.loglinePlaceholder': '당신의 이야기를 담아내는 분명한 한 문장…',
      'p1.authorPlaceholder': '작가 이름',
      'p1.emailPlaceholder': 'author@example.com',
      'p1.licensePlaceholder': '예: CC BY 4.0',
      'p1.keywordsPlaceholder': '키워드1; 키워드2; 키워드3',
      'p1.notesPlaceholder': '메모 / 헌사 / 기타',
      'p1.abstractPlaceholder': '대본의 간결한 요약…',
      'p2.charNamePlaceholder': '등장인물 / 음성 이름',
      'p2.sceneTitlePlaceholder': '1막 1장 — 또는 세그먼트 1…',
      'p3.elemTextPlaceholder': '여기에 입력하세요…'
    },
    'ja-jp': {
      'p1.tplNamePlaceholder': 'テンプレート名',
      'p1.titlePlaceholder': '私の脚本',
      'p1.loglinePlaceholder': 'あなたの物語を的確に捉える一文…',
      'p1.authorPlaceholder': '著者名',
      'p1.emailPlaceholder': 'author@example.com',
      'p1.licensePlaceholder': '例：CC BY 4.0',
      'p1.keywordsPlaceholder': 'キーワード1；キーワード2；キーワード3',
      'p1.notesPlaceholder': 'メモ / 献辞 / など',
      'p1.abstractPlaceholder': '脚本の簡潔な要約…',
      'p2.charNamePlaceholder': 'キャラクター / 声の名前',
      'p2.sceneTitlePlaceholder': '第1幕・第1場 — またはセグメント1…',
      'p3.elemTextPlaceholder': 'ここに入力…'
    },
    'ru-ru': {
      'p1.tplNamePlaceholder': 'Название шаблона',
      'p1.titlePlaceholder': 'Мой сценарий',
      'p1.loglinePlaceholder': 'Одна ясная фраза, передающая суть вашей истории…',
      'p1.authorPlaceholder': 'Имя автора',
      'p1.emailPlaceholder': 'author@example.com',
      'p1.licensePlaceholder': 'напр. CC BY 4.0',
      'p1.keywordsPlaceholder': 'ключ1; ключ2; ключ3',
      'p1.notesPlaceholder': 'Заметки / посвящения / и т. д.',
      'p1.abstractPlaceholder': 'Краткое содержание сценария…',
      'p2.charNamePlaceholder': 'Имя персонажа / голоса',
      'p2.sceneTitlePlaceholder': 'Акт 1, сцена 1 — или сегмент 1…',
      'p3.elemTextPlaceholder': 'Пишите здесь…'
    }
  };

  function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
  }

  function normalizeLangTag(lang) {
    return String(lang || '').trim() || defaultLang;
  }

  // Genera candidatos de archivo a partir del value del select
  // Ej: "pt-BR" -> ["pt-BR","pt-br","pt_BR","pt_br","pt"]
  // Ej: "zh-CN" -> ["zh-CN","zh-cn","zh_CN","zh_cn","zh"]
  function candidateLangIds(lang) {
    const L = normalizeLangTag(lang);

    const lower = L.toLowerCase();
    const underscore = L.replace(/-/g, '_');
    const underscoreLower = lower.replace(/-/g, '_');

    const base = L.split(/[-_]/)[0] || L;
    const baseLower = base.toLowerCase();

    return uniq([L, lower, underscore, underscoreLower, base, baseLower]);
  }

  function candidatePaths(lang) {
    return uniq(
      candidateLangIds(lang).flatMap((id) => [
        `${id}.json`,
        `./${id}.json`,
        `lang/${id}.json`,
        `./lang/${id}.json`
      ])
    );
  }

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) return null;
    const json = await res.json();
    return json || {};
  }

  async function loadLang(lang) {
    const L = normalizeLangTag(lang);

    if (cache[L]) return cache[L];

    // Evita disparar varias descargas a la vez del mismo idioma
    if (currentLoad && currentLoad.lang === L) {
      return currentLoad.promise;
    }

    const promise = (async () => {
      const paths = candidatePaths(L);

      for (const path of paths) {
        try {
          const json = await fetchJson(path);
          if (json) {
            cache[L] = json;
            return cache[L];
          }
        } catch (err) {
          // probamos siguiente candidato
        }
      }

      console.error('[i18n] No se pudo cargar ningún JSON para:', L, paths);

      // Fallback al idioma por defecto
      if (L !== defaultLang) {
        return loadLang(defaultLang);
      }
      return {};
    })().finally(() => {
      if (currentLoad && currentLoad.lang === L) {
        currentLoad = null;
      }
    });

    currentLoad = { lang: L, promise };
    return promise;
  }

  function normalizeSupplementalLang(lang) {
    return String(lang || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');
  }

  function lookupSupplemental(lang, key) {
    const normalized = normalizeSupplementalLang(lang);
    if (!normalized) return undefined;

    const direct = SUPPLEMENTAL_MESSAGES[normalized];
    if (direct && Object.prototype.hasOwnProperty.call(direct, key)) {
      return direct[key];
    }

    const base = normalized.split('-')[0];
    const fromBase = SUPPLEMENTAL_MESSAGES[base];
    if (fromBase && Object.prototype.hasOwnProperty.call(fromBase, key)) {
      return fromBase[key];
    }

    return undefined;
  }

  function lookup(key) {
    const dict = cache[currentLang] || {};
    if (Object.prototype.hasOwnProperty.call(dict, key)) {
      return dict[key];
    }

    const currentSupplemental = lookupSupplemental(currentLang, key);
    if (currentSupplemental !== undefined) {
      return currentSupplemental;
    }

    const fallback = cache[defaultLang] || {};
    if (Object.prototype.hasOwnProperty.call(fallback, key)) {
      return fallback[key];
    }

    const fallbackSupplemental = lookupSupplemental(defaultLang, key);
    if (fallbackSupplemental !== undefined) {
      return fallbackSupplemental;
    }

    return undefined;
  }

  async function setLang(lang) {
    currentLang = normalizeLangTag(lang);
    await loadLang(currentLang);

    // Pre‑carga el idioma por defecto por si no lo está
    if (!cache[defaultLang]) {
      loadLang(defaultLang);
    }

    // Mejora semántica (opcional)
    try {
      document.documentElement.lang = currentLang;
    } catch {}
  }

  function t(key, fallback = key) {
    const value = lookup(key);
    return value === undefined ? fallback : value;
  }

  function resolveAttrValue(rawKey, fallback = null) {
    const candidates = String(rawKey || '')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const key of candidates) {
      const value = lookup(key);
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }

    return fallback;
  }

  function applyI18nToDom(root) {
    const scope = root || document;

    // Textos normales
    const nodes = scope.querySelectorAll('[data-i18n]');
    nodes.forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const value = resolveAttrValue(key, null);
      if (value !== null && value !== undefined && value !== '') {
        el.textContent = value;
      }
    });

    // Placeholders:
    const phNodes = scope.querySelectorAll('[data-i18n-placeholder]');
    phNodes.forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      const value = resolveAttrValue(key, null);
      if (value !== null && value !== undefined && value !== '') {
        el.setAttribute('placeholder', value);
      }
    });

    // Títulos/tooltip:
    const titleNodes = scope.querySelectorAll('[data-i18n-title]');
    titleNodes.forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;
      const value = resolveAttrValue(key, null);
      if (value !== null && value !== undefined && value !== '') {
        el.setAttribute('title', value);
      }
    });

    // aria-label:
    const ariaNodes = scope.querySelectorAll('[data-i18n-aria]');
    ariaNodes.forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (!key) return;
      const value = resolveAttrValue(key, null);
      if (value !== null && value !== undefined && value !== '') {
        el.setAttribute('aria-label', value);
      }
    });
  }

  global.I18n = {
    setLang,
    t,
    applyI18nToDom,
    getLang: () => currentLang,
    preload: loadLang
  };
})(window);
