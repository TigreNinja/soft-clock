/**
 * ══════════════════════════════════════════════════════════════════════════════
 * softclock.js — Reloj analógico encapsulado · Soft Geometric Edition
 * Vanilla JS · Sin dependencias · Un solo archivo · Tigre Ninja
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * QUÉ ES
 * ──────────────────────────────────────────────────────────────────────────────
 * Un reloj analógico SVG con estética geométrica suave y minimalista que se
 * puede incrustar en cualquier web añadiendo un <script> y una línea de JS
 * (o ninguna, usando el atributo data-soft-clock).
 *
 * FIRMA VISUAL
 * ──────────────────────────────────────────────────────────────────────────────
 * En lugar de aguja de segundos, un punto orbital recorre el perímetro
 * dejando un arco de progreso del minuto en curso. Es el único elemento
 * de color de acento: todo lo demás es geometría neutra (puntos, líneas
 * redondeadas, círculos concéntricos).
 *
 * USO RÁPIDO
 * ──────────────────────────────────────────────────────────────────────────────
 * 1) Declarativo (cero JS):
 *      <div data-soft-clock data-theme="grafito" data-size="200"></div>
 *      <script src="softclock.js"></script>
 *
 * 2) Programático:
 *      const clock = SoftClock.mount('#miDiv', {
 *        theme: 'salvia',   // 'porcelana' | 'grafito' | 'salvia' | 'niebla'
 *        size:  220,        // px (el SVG escala sin pérdida)
 *        sweep: true,       // barrido continuo; false = tic-tac por segundo
 *        seconds: true,     // mostrar el punto orbital y su arco
 *      });
 *
 *      clock.setTheme('grafito');   // cambiar tema en caliente
 *      clock.randomize();           // ★ genera una paleta suave aleatoria
 *      clock.destroy();             // desmonta y limpia listeners/rAF
 *
 * API GLOBAL
 * ──────────────────────────────────────────────────────────────────────────────
 *   SoftClock.mount(target, options) → instancia
 *   SoftClock.themes                 → ['porcelana','grafito','salvia','niebla']
 *   SoftClock.version                → string
 *
 * ENCAPSULACIÓN
 * ──────────────────────────────────────────────────────────────────────────────
 * · IIFE: nada se filtra al scope global salvo window.SoftClock.
 * · CSS autoinyectado una sola vez con prefijo .sck- (sin colisiones).
 * · Los colores viajan como custom properties EN el elemento raíz de cada
 *   instancia, así dos relojes en la misma página pueden tener temas distintos.
 * · Un único requestAnimationFrame compartido mueve todos los relojes de la
 *   página (registro central), en lugar de un loop por instancia.
 *
 * ACCESIBILIDAD
 * ──────────────────────────────────────────────────────────────────────────────
 * · role="img" + aria-label con la hora legible, actualizado cada minuto.
 * · prefers-reduced-motion: si el usuario lo pide, se desactiva el barrido
 *   continuo y el reloj avanza en pasos discretos de un segundo.
 */

(function () {
  'use strict';

  const SVG_NS  = 'http://www.w3.org/2000/svg';
  const VERSION = '1.0.0';

  /* ══════════════════════════════════════════════════════════════════════════
     0. TEMAS — paletas geométricas suaves
     ══════════════════════════════════════════════════════════════════════════
     Cada tema define 6 colores. Se aplican como CSS custom properties en el
     elemento raíz de la instancia, de modo que el SVG (que usa var(--sck-*))
     se recolorea sin tocar el DOM interno.

     · face   → fondo de la esfera
     · ring   → anillo exterior fino
     · mark   → puntos y marcas horarias
     · hand   → agujas de hora y minuto + núcleo del eje
     · accent → punto orbital de segundos + arco de progreso
     · shadow → sombra exterior difusa (rgba)
  */
  const THEMES = {
    porcelana: {
      face: '#F7F4EF', ring: '#E6E1D8', mark: '#C6BFB2',
      hand: '#33302B', accent: '#C2603F', shadow: 'rgba(80, 70, 55, .14)',
    },
    grafito: {
      face: '#24262C', ring: '#33363F', mark: '#565B68',
      hand: '#E8EAEF', accent: '#8FC0AC', shadow: 'rgba(10, 12, 18, .45)',
    },
    salvia: {
      face: '#E8EEE5', ring: '#D2DECE', mark: '#9CB096',
      hand: '#2F3B2E', accent: '#C97B5A', shadow: 'rgba(60, 80, 58, .16)',
    },
    niebla: {
      face: '#EAEDF3', ring: '#D9DEE9', mark: '#ABB4C7',
      hand: '#2E3445', accent: '#DE9E4C', shadow: 'rgba(55, 65, 95, .16)',
    },
  };

  const DEFAULT_OPTIONS = {
    theme:   'porcelana',
    size:    180,     // px
    sweep:   true,    // barrido suave (usa milisegundos)
    seconds: true,    // mostrar punto orbital + arco
  };

  /* Geometría base. El SVG usa un viewBox fijo de 200×200 y escala por CSS,
     así todas las medidas internas son constantes independientes del size. */
  const C        = 100;   // centro (x = y)
  const R_RING   = 96;    // radio del anillo exterior
  const R_FACE   = 92;    // radio de la esfera
  const R_ORBIT  = 72;    // radio de la órbita de segundos
  const ORBIT_LEN = 2 * Math.PI * R_ORBIT; // circunferencia del arco

  /* ══════════════════════════════════════════════════════════════════════════
     1. CSS AUTOINYECTADO
     ══════════════════════════════════════════════════════════════════════════
     Se inyecta una sola vez (guard por id). Todo va con prefijo .sck-.
     Las custom properties se declaran aquí con los valores del tema por
     defecto; setTheme() las sobreescribe a nivel de instancia.
  */
  function injectCSS() {
    if (document.getElementById('sck-styles')) return;
    const style = document.createElement('style');
    style.id = 'sck-styles';
    style.textContent = `
      .sck-root {
        --sck-face:   ${THEMES.porcelana.face};
        --sck-ring:   ${THEMES.porcelana.ring};
        --sck-mark:   ${THEMES.porcelana.mark};
        --sck-hand:   ${THEMES.porcelana.hand};
        --sck-accent: ${THEMES.porcelana.accent};
        --sck-shadow: ${THEMES.porcelana.shadow};
        display: inline-block;
        line-height: 0;
      }
      .sck-root svg {
        display: block;
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 10px 24px var(--sck-shadow));
        /* Suaviza el cambio de tema (no afecta a las agujas en movimiento) */
      }
      .sck-face   { fill: var(--sck-face); transition: fill .45s ease; }
      .sck-ring   { stroke: var(--sck-ring); transition: stroke .45s ease; }
      .sck-mark   { fill: var(--sck-mark); stroke: var(--sck-mark); transition: fill .45s ease, stroke .45s ease; }
      .sck-hand   { stroke: var(--sck-hand); transition: stroke .45s ease; }
      .sck-hub    { fill: var(--sck-hand); transition: fill .45s ease; }
      .sck-core   { fill: var(--sck-accent); transition: fill .45s ease; }
      .sck-orbit  { stroke: var(--sck-accent); transition: stroke .45s ease; }
      .sck-dot    { fill: var(--sck-accent); transition: fill .45s ease; }
    `;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     2. HELPERS
     ══════════════════════════════════════════════════════════════════════════ */

  /** Crea un elemento SVG con atributos en una sola llamada. */
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  /** Convierte un ángulo horario (0 = las 12, sentido reloj) a coordenadas. */
  function polar(angleDeg, radius) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return {
      x: C + Math.cos(rad) * radius,
      y: C + Math.sin(rad) * radius,
    };
  }

  /** Media query de movimiento reducido, consultada en vivo (puede cambiar). */
  const reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  /* ══════════════════════════════════════════════════════════════════════════
     3. CONSTRUCCIÓN DE LA ESFERA
     ══════════════════════════════════════════════════════════════════════════
     Devuelve las referencias a las piezas móviles para que el loop de
     animación no tenga que hacer querySelector en cada frame.

     Composición (de atrás hacia delante):
       anillo exterior → esfera → marcas → arco de segundos → agujas →
       punto orbital → eje central
  */
  function buildFace(root, opts) {
    const svg = svgEl('svg', { viewBox: '0 0 200 200', role: 'img' });

    // Anillo exterior fino: separa la esfera del fondo sin pesar visualmente
    svg.appendChild(svgEl('circle', {
      class: 'sck-ring', cx: C, cy: C, r: R_RING,
      fill: 'none', 'stroke-width': 2,
    }));

    // Esfera
    svg.appendChild(svgEl('circle', { class: 'sck-face', cx: C, cy: C, r: R_FACE }));

    /* Marcas horarias: geometría mínima.
       · Las 12 posiciones llevan un punto.
       · Las 4 cardinales (12, 3, 6, 9) llevan además una línea corta
         redondeada que ancla la lectura sin necesidad de números. */
    const marks = svgEl('g', { class: 'sck-mark' });
    for (let i = 0; i < 12; i++) {
      const angle = i * 30;
      const isCardinal = i % 3 === 0;
      if (isCardinal) {
        const a = polar(angle, 86);
        const b = polar(angle, 77);
        marks.appendChild(svgEl('line', {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          'stroke-width': 3.5, 'stroke-linecap': 'round',
        }));
      } else {
        const p = polar(angle, 82);
        marks.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 2.1, stroke: 'none' }));
      }
    }
    svg.appendChild(marks);

    /* Arco de segundos: un círculo con stroke-dasharray.
       El primer tramo del dash es la fracción transcurrida del minuto;
       el segundo es la circunferencia completa (siempre cubre el resto).
       Se rota -90° para que el origen del trazo sea las 12 en punto. */
    let orbitArc = null;
    let secondsDot = null;
    if (opts.seconds) {
      orbitArc = svgEl('circle', {
        class: 'sck-orbit', cx: C, cy: C, r: R_ORBIT,
        fill: 'none', 'stroke-width': 2.5, 'stroke-linecap': 'round',
        'stroke-dasharray': `0 ${ORBIT_LEN}`,
        transform: `rotate(-90 ${C} ${C})`,
        opacity: .85,
      });
      svg.appendChild(orbitArc);
    }

    /* Agujas: líneas con extremos redondeados y una pequeña cola que
       sobrepasa el centro (contrapeso visual clásico, versión suave). */
    const hourHand = svgEl('line', {
      class: 'sck-hand',
      x1: C, y1: C + 12, x2: C, y2: C - 40,
      'stroke-width': 5.5, 'stroke-linecap': 'round',
    });
    const minuteHand = svgEl('line', {
      class: 'sck-hand',
      x1: C, y1: C + 14, x2: C, y2: C - 60,
      'stroke-width': 4, 'stroke-linecap': 'round',
    });
    svg.appendChild(hourHand);
    svg.appendChild(minuteHand);

    // Punto orbital de segundos (la "aguja" de esta esfera)
    if (opts.seconds) {
      secondsDot = svgEl('circle', { class: 'sck-dot', cx: C, cy: C - R_ORBIT, r: 4.2 });
      svg.appendChild(secondsDot);
    }

    // Eje central: disco del color de las agujas con núcleo de acento
    svg.appendChild(svgEl('circle', { class: 'sck-hub',  cx: C, cy: C, r: 6 }));
    svg.appendChild(svgEl('circle', { class: 'sck-core', cx: C, cy: C, r: 2.4 }));

    root.appendChild(svg);
    return { svg, hourHand, minuteHand, orbitArc, secondsDot };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     4. LOOP DE ANIMACIÓN COMPARTIDO
     ══════════════════════════════════════════════════════════════════════════
     Un solo requestAnimationFrame para toda la página. Cada instancia se
     registra en `registry` al montarse y se elimina al destruirse.
     El loop se detiene solo cuando no queda ningún reloj vivo.
  */
  const registry = [];
  let rafId = null;

  function loop() {
    const now = new Date();
    for (let i = 0; i < registry.length; i++) registry[i]._tick(now);
    rafId = registry.length ? requestAnimationFrame(loop) : null;
  }

  function register(instance) {
    registry.push(instance);
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }

  function unregister(instance) {
    const i = registry.indexOf(instance);
    if (i !== -1) registry.splice(i, 1);
    if (!registry.length && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     5. INSTANCIA DE RELOJ
     ══════════════════════════════════════════════════════════════════════════ */
  function createClock(target, userOptions) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) {
      console.warn('[SoftClock] target no encontrado:', target);
      return null;
    }

    const opts = Object.assign({}, DEFAULT_OPTIONS, userOptions);

    injectCSS();

    // Raíz de la instancia: contenedor con las custom properties del tema
    const root = document.createElement('div');
    root.className = 'sck-root';
    root.style.width  = opts.size + 'px';
    root.style.height = opts.size + 'px';
    host.appendChild(root);

    const parts = buildFace(root, opts);
    let lastAriaMinute = -1;

    const instance = {
      el: root,
      options: opts,

      /* Aplica un tema por nombre ('grafito') o por objeto de colores
         parcial ({ accent: '#FF5577' }). Los campos no incluidos en un
         objeto parcial conservan su valor actual. */
      setTheme(theme) {
        const palette = typeof theme === 'string' ? THEMES[theme] : theme;
        if (!palette) {
          console.warn('[SoftClock] tema desconocido:', theme);
          return this;
        }
        for (const key in palette) {
          root.style.setProperty('--sck-' + key, palette[key]);
        }
        return this;
      },

      /* ★ Hook de shareability: genera una paleta suave aleatoria.
         Parte de un tono base aleatorio y deriva el resto con HSL:
         · esfera casi blanca o casi negra (50/50)
         · acento en el tono complementario desplazado, saturación media
         El resultado siempre es coherente porque las relaciones de
         luminosidad entre capas son fijas. */
      randomize() {
        const h  = Math.floor(Math.random() * 360);       // tono base
        const ha = (h + 140 + Math.random() * 80) % 360;  // tono de acento
        const dark = Math.random() < 0.5;

        const palette = dark ? {
          face:   `hsl(${h} 12% 16%)`,
          ring:   `hsl(${h} 12% 24%)`,
          mark:   `hsl(${h} 10% 42%)`,
          hand:   `hsl(${h} 18% 92%)`,
          accent: `hsl(${ha} 48% 68%)`,
          shadow: `hsl(${h} 30% 6% / .45)`,
        } : {
          face:   `hsl(${h} 28% 94%)`,
          ring:   `hsl(${h} 24% 86%)`,
          mark:   `hsl(${h} 16% 64%)`,
          hand:   `hsl(${h} 24% 18%)`,
          accent: `hsl(${ha} 52% 52%)`,
          shadow: `hsl(${h} 30% 30% / .18)`,
        };
        this.setTheme(palette);
        return palette; // se devuelve por si el integrador quiere guardarla
      },

      /* Llamado por el loop compartido en cada frame.
         Calcula los ángulos a partir de la hora real (no acumula error). */
      _tick(now) {
        const sweep = opts.sweep && !reducedMotion.matches;
        const ms  = sweep ? now.getMilliseconds() : 0;
        const sec = now.getSeconds() + ms / 1000;
        const min = now.getMinutes() + sec / 60;
        const hr  = (now.getHours() % 12) + min / 60;

        parts.minuteHand.setAttribute('transform', `rotate(${min * 6} ${C} ${C})`);
        parts.hourHand.setAttribute('transform',   `rotate(${hr * 30} ${C} ${C})`);

        if (parts.secondsDot) {
          const p = polar(sec * 6, R_ORBIT);
          parts.secondsDot.setAttribute('cx', p.x);
          parts.secondsDot.setAttribute('cy', p.y);
          parts.orbitArc.setAttribute(
            'stroke-dasharray',
            `${(sec / 60) * ORBIT_LEN} ${ORBIT_LEN}`
          );
        }

        // aria-label legible, actualizado solo cuando cambia el minuto
        if (now.getMinutes() !== lastAriaMinute) {
          lastAriaMinute = now.getMinutes();
          parts.svg.setAttribute(
            'aria-label',
            'Reloj analógico: ' +
            now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          );
        }
      },

      /* Desmonta la instancia: la saca del loop y limpia el DOM. */
      destroy() {
        unregister(this);
        root.remove();
      },
    };

    instance.setTheme(opts.theme);
    instance._tick(new Date()); // primer pintado inmediato (sin esperar al rAF)
    register(instance);
    return instance;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     6. AUTO-MONTAJE DECLARATIVO
     ══════════════════════════════════════════════════════════════════════════
     Cualquier elemento con [data-soft-clock] se convierte en reloj al cargar.
     Atributos opcionales:
       data-theme="grafito"   data-size="220"
       data-sweep="false"     data-seconds="false"
  */
  function autoMount() {
    document.querySelectorAll('[data-soft-clock]').forEach(el => {
      if (el.dataset.sckMounted) return; // evitar montaje doble
      el.dataset.sckMounted = '1';
      createClock(el, {
        theme:   el.dataset.theme   || DEFAULT_OPTIONS.theme,
        size:    parseInt(el.dataset.size, 10) || DEFAULT_OPTIONS.size,
        sweep:   el.dataset.sweep   !== 'false',
        seconds: el.dataset.seconds !== 'false',
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     7. API PÚBLICA
     ══════════════════════════════════════════════════════════════════════════ */
  window.SoftClock = {
    mount: createClock,
    themes: Object.keys(THEMES),
    version: VERSION,
  };

})();
