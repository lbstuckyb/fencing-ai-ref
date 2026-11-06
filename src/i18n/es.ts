import type { Dictionary } from './index';

/** Spanish. Signal names follow the usual Spanish-language FIE refereeing terms. */
const es: Dictionary = {
  lang: {
    names: { en: 'English', es: 'Español', fr: 'Français' },
    selector: 'Idioma',
  },

  common: {
    moreInfo: 'Más información',
    home: '‹ Inicio',
    tryAgain: 'Reintentar',
    cancel: 'Cancelar',
    why: 'Por qué',
    startsIn: 'Empieza en {n}…',
    recordingFor: 'Grabando… {s} s',
    recordSeconds: 'Grabar {s} s',
    eitherArm: 'cualquier brazo',
  },

  side: {
    arm: { left: 'brazo izquierdo', right: 'brazo derecho' },
    yourArm: { left: 'tu brazo izquierdo', right: 'tu brazo derecho' },
    yourHand: { left: 'tu mano izquierda', right: 'tu mano derecha' },
    yourSide: { left: 'tu izquierda', right: 'tu derecha' },
  },

  nav: {
    brand: 'Entrenador de arbitraje de esgrima',
    brandShort: 'Árbitro',
    skip: 'Saltar al contenido',
    main: 'Principal',
    tuning: 'Ajustes',
    about: 'Acerca de',
    learn: 'Aprender',
    practice: 'Practicar',
    referee: 'Arbitrar',
    yourSignals: 'Tus señales',
    readouts: 'Lecturas',
  },

  home: {
    title1: 'Tú',
    title2: 'decides.',
    enter: 'Entrar ›',
    signals: 'Señales',
    hold: 'Mantener',
    weapons: 'Armas',
  },

  about: {
    title: 'Acerca de',
    p1: 'Este proyecto quiere que cualquier persona, en cualquier parte del mundo, pueda practicar y mejorar su arbitraje de esgrima.',
    p2: 'Aprende las señales, practícalas frente a tu cámara y luego arbitra situaciones reales. Todo se evalúa según el Reglamento Técnico de la FIE, artículo {article}.',
    p3: 'Todo funciona en tu dispositivo: ningún vídeo sale de tu navegador.',
  },

  notFound: {
    title: 'Página no encontrada',
  },

  reference: {
    title: 'Aprender',
    selected: 'Señal seleccionada',
    namesFencer: 'Indica un tirador',
    namesFencerHint:
      'El brazo que usas indica el tirador: brazo izquierdo para el tirador a tu izquierda (rojo), brazo derecho para el de tu derecha (verde).',
    eitherArm: 'Cualquier brazo',
    notGraded: 'Sin evaluar',
    readsHand: 'Lee tu mano',
    drill: 'Practicar {signal} ›',
    drillAll: 'Practicar todas ›',
    rulebook: 'Reglamento ↗',
    filter: 'Filtrar por grupo',
    all: 'Todas',
  },

  practice: {
    title: 'Práctica',
    streak: 'Racha',
    best: 'Mejor',
    score: 'Puntos',
    signals: '‹ Señales',
    hintRandom:
      'Orden aleatorio. Baja los brazos después de cada señal para pasar a la siguiente. Elige una para quedarte en ella.',
    hintPinned: 'Practicando {signal}. «Siguiente señal» vuelve al orden aleatorio.',
    next: 'Siguiente señal ›',
    referee: 'Arbitrar ›',
    pickOne: 'Practicar una señal',
    close: 'Cerrar',
    namesFencer: 'indica un tirador',
  },

  feedbackUi: {
    held: '{signal} — mantenida {s} s',
    quick: '{signal} — demasiado rápida',
    wrongArm: '{signal} — brazo equivocado',
    wrongArmUse: 'Brazo equivocado — usa tu',
    holding: 'Mantenida',
    holdIt: 'Mantén',
    shape: 'forma {n}%',
  },

  scenarios: {
    title: 'Arbitrar',
    difficulty: 'Dificultad {n}',
    about: 'Sobre {weapon}',
    neverCalled: 'Nunca se marca: {signals}.',
    rightOfWay: 'Con prioridad',
    noRightOfWay: 'Sin prioridad',
    phrases: '‹ Frases',
    hint: 'Colócate en el encuadre y reproduce la frase. Tienes cinco segundos para prepararte. Cada señal que mantengas se registra hasta que envíes tu decisión, también durante las repeticiones.',
    noSignal: 'Aún sin señal',
    noCalls: 'Aún sin decisiones',
    callsSoFar: 'Decisiones hasta ahora',
    quick: 'rápida',
    undo: 'Deshacer la última',
    submit: 'Enviar decisión',
  },

  player: {
    unavailable: 'Clip no disponible',
    unavailableHint1: 'Los clips de muestra se generan, no se incluyen en el repositorio. Ejecuta',
    unavailableHint2: '(necesita ffmpeg), o coloca un clip en',
    unavailableHint3: '. Aun así puedes arbitrar y recibir la evaluación.',
    pause: 'Pausa',
    play: 'Reproducir',
    replay: 'Repetir',
    stepBack: 'Retroceder un fotograma',
    stepForward: 'Avanzar un fotograma',
    slowMotion: 'Cámara lenta',
    slow: 'Lento',
    ended: 'Clip terminado · sigue registrando',
    getReady: 'Prepárate para arbitrar',
    playPhrase: 'Reproducir la frase',
    waiting: 'Esperando la cámara',
  },

  grade: {
    correct: 'Correcto',
    out_of_order: 'Fuera de orden',
    wrong_side: 'Brazo equivocado',
    wrong_signal: 'Señal equivocada',
    missing: 'Falta',
    spoken: 'Hablado',
    extra: 'De más',
    correctCount: '{correct}/{total} correctas',
    extraCalls: 'Señales de más',
    whatHappened: 'Qué pasó',
    tryAgain: 'Reintentar',
    allPhrases: 'Todas las frases',
    nextPhrase: 'Siguiente frase ›',
    sideNote: ' con {arm}',
    msgCorrect: '{signal}{sideNote}: correcto.',
    msgOutOfOrder: '{signal}{sideNote} se hizo bien, pero fuera de orden.',
    msgWrongSide:
      '{signal} era correcta, pero la hiciste con {callArm}; esta indica al tirador de {side}.',
    msgWrongSignal: 'Se esperaba {signal}{sideNote}, pero aquí marcaste {call}.',
    msgMissing: '{signal}{sideNote} nunca se marcó.',
    msgExtra: 'También marcaste {call}{sideNote}, que no formaba parte de esta frase.',
  },

  camera: {
    start: 'Activar cámara',
    stop: 'Detener cámara',
    starting: 'Activando la cámara…',
    about: 'Sobre la cámara',
    aboutHint: 'Cada fotograma se procesa en esta pestaña. No se sube ni se graba nada.',
    noPose: 'nadie en el encuadre',
    landmarks: '{n} puntos @ {rate}/s',
    hand: '{n} mano',
    hands: '{n} manos',
    handsUnavailable: 'Detalle de manos no disponible',
    handsUnavailableHint:
      'El modelo de manos no se cargó. La geometría de los brazos sigue evaluándose. Ejecuta',
    failures: {
      insecure_context: {
        title: 'El navegador no comparte la cámara en esta página',
        detail:
          'El acceso a la cámara necesita un contexto seguro. Abre la aplicación por https, o en localhost durante el desarrollo.',
      },
      permission_denied: {
        title: 'Se denegó el permiso de la cámara',
        detail:
          'Concede acceso a la cámara para este sitio (normalmente con el icono de la cámara en la barra de direcciones) y vuelve a empezar. Nada de lo que grabas se sube: el vídeo se procesa en esta pestaña y se descarta.',
      },
      no_camera: {
        title: 'No se encontró ninguna cámara',
        detail:
          'Conecta una webcam y vuelve a empezar. Los ejercicios necesitan ver en directo la parte superior de tu cuerpo.',
      },
      camera_busy: {
        title: 'La cámara está en uso',
        detail:
          'Otra aplicación o pestaña del navegador está usando la cámara. Ciérrala y vuelve a empezar.',
      },
      camera_lost: {
        title: 'La cámara se detuvo',
        detail:
          'La señal de vídeo terminó: puede que el dispositivo se haya desconectado o que se haya retirado el permiso.',
      },
      model_assets: {
        title: 'Falta el modelo de postura',
        detail:
          'El modelo y el motor de MediaPipe se incluyen en public/ en lugar de descargarse de un CDN. Ejecuta `npm run fetch-assets` y vuelve a empezar.',
      },
      model_runtime: {
        title: 'La detección de postura no pudo iniciarse',
        detail:
          'El detector de postura no pudo inicializarse en este navegador. Se necesita una versión reciente de Chrome, Edge, Firefox o Safari.',
      },
      unknown: {
        title: 'No se pudo activar la cámara',
        detail: 'Algo salió mal. La consola del navegador tiene los detalles.',
      },
    },
  },

  calibrate: {
    title: 'Calibrar',
    hint: 'Lecturas en directo de cada magnitud que usan las especificaciones de las señales. Haz una señal, graba cómo la mantienes y escribe los valores medidos en la especificación.',
    measurement: 'Medida',
    noSamples: 'sin muestras',
    classified: 'Forma detectada — {shapes}',
    clear: 'Borrar grabación',
    recorded: '{frames} fotogramas grabados en {s} s',
    recordedHint:
      'La línea pequeña de cada celda es mín · mediana · máx durante la grabación. Usa la mediana como centro de un rango y la dispersión como la tolerancia que necesita.',
  },

  calibrateSignals: {
    title: 'Calibración experta',
    hint: 'Grábate haciendo cada señal correctamente. Los ejercicios se evaluarán según tu grabación en lugar de los valores por defecto. Una nueva toma reemplaza la anterior; restablecer recupera los valores por defecto.',
    arm: 'Brazo',
    rightArm: 'Brazo derecho',
    leftArm: 'Brazo izquierdo',
    bothArms: 'Ambos brazos',
    recording: 'Grabando',
    recordedWith: 'Grabada con {arm}',
    save: 'Guardar',
    retake: 'Repetir',
    coreTen: 'Las diez básicas',
    coreTenHint:
      'Elige una señal para grabarla. Exportar guarda todas las grabaciones de este dispositivo en un archivo; importar vuelve a cargar uno, sobre lo que ya está guardado.',
    export: 'Exportar grabaciones',
    import: 'Importar grabaciones',
    usingYours: 'Usa tu grabación',
    usingDefault: 'Usa el rango por defecto',
    reset: 'Restablecer',
    measurement: 'Medida',
    youRecorded: 'Tu grabación',
    defaultBand: 'Rango por defecto',
    newBand: 'Nuevo rango',
    skippedOne:
      '{n} restricción más (forma de la mano o simetría de los brazos) no se muestra aquí: ninguna es un rango que una grabación pueda ampliar.',
    skippedMany:
      '{n} restricciones más (forma de la mano o simetría de los brazos) no se muestran aquí: ninguna es un rango que una grabación pueda ampliar.',
  },

  coaching: {
    tooQuick:
      'Mantenida {held} s, demasiado rápida: una señal debe durar entre {min} y {max} segundos y ser expresiva.',
    wrongSide:
      'La señal {signal} es correcta, pero la hiciste con {arm}. Indica al tirador de ese lado, así que tiene que ser con {prompted}.',
    sideWord: ' ({arm})',
    unmeasured:
      'No se pudo medir {label}{side}: asegúrate de que toda la parte superior de tu cuerpo esté en el encuadre.',
    outOfRange: '{label}{side}: {value}; se esperaba {band}.',
    handMissing: 'No se detecta {hand}: ponla donde la cámara pueda verla.',
    wrongShape: '{hand} se lee como {shape}; esta señal necesita {expected}.',
    symmetryUnmeasured:
      'No se pudo medir {label} en ambos brazos: asegúrate de que los dos estén en el encuadre.',
    asymmetric:
      'Tus brazos difieren {delta} en {label}; esta señal los necesita a la misma altura.',
    atLeast: 'al menos {n}',
    atMost: 'como mucho {n}',
    anyValue: 'cualquier valor',
  },

  shapes: {
    open_palm: 'palma abierta',
    fist: 'puño',
    index_point: 'índice extendido',
    unknown: 'desconocida',
    none: 'no detectada',
  },

  signals: {
    halt: {
      label: 'Alto',
      description:
        'Un brazo levantado recto por encima de la cabeza con la palma abierta: se detiene el combate. El otro brazo queda abajo.',
    },
    attack: {
      label: 'Ataque',
      description:
        'El brazo que señala, hacia el lado y con el codo flexionado, con el antebrazo apuntando al tirador que atacó. El mismo gesto sirve para golpe de arresto, contraataque y remise, que se nombran en voz alta.',
    },
    parry: {
      label: 'Parada',
      description:
        'El antebrazo levantado casi vertical junto a la cabeza, con el codo bajo, imitando una parada: el tirador de ese lado paró. El contratiempo usa el mismo gesto.',
    },
    point_in_line: {
      label: 'Punta en línea',
      description:
        'El brazo extendido recto hacia el lado, con el índice apuntando al tirador que estableció la punta en línea.',
    },
    hit_scored: {
      label: 'Tocado',
      description:
        'El brazo levantado hacia fuera y arriba del lado del tirador que tocó, con el codo en ángulo recto aproximadamente: el tocado es suyo.',
    },
    hit_against: {
      label: 'Tocado en contra',
      description:
        'El brazo extendido recto hacia el lado con la mano plana, del lado del tirador que recibió el tocado.',
    },
    not_valid: {
      label: 'No válido',
      description:
        'El brazo extendido recto hacia abajo y hacia fuera, hacia el suelo, del lado de ese tirador: su tocado cayó fuera de la superficie válida y no cuenta.',
    },
    double_hit: {
      label: 'Golpe doble',
      description:
        'Ambos brazos extendidos hacia los lados a la altura de los hombros: los dos tiradores tocaron; es un golpe doble, que en espada cuenta para ambos.',
    },
    simultaneous: {
      label: 'Simultáneo',
      description:
        'Ambos brazos hacia delante con las manos juntándose frente al pecho: los dos ataques fueron simultáneos, así que no se concede tocado.',
    },
    nothing: {
      label: 'Nada',
      description:
        'Ambos brazos extendidos bajos y hacia delante con las palmas hacia abajo: no se concede tocado; la frase no dio nada.',
    },
    on_guard: {
      label: 'En guardia',
      description: 'Indica a los tiradores que se pongan en guardia antes de empezar la frase.',
    },
    ready: {
      label: '¿Listos?',
      description: 'Pregunta a ambos tiradores si están listos para tirar.',
    },
    play: {
      label: 'Adelante',
      description: 'Empieza la frase: los tiradores ya pueden tirar.',
    },
    incorrect: {
      label: 'Incorrecto',
      description: 'Indica que la acción de un tirador se ejecutó mal, sin conceder tocado.',
    },
    no: {
      label: 'No',
      description:
        'Rechaza la petición de un tirador; por ejemplo, que pide parar la frase o reclama un tocado.',
    },
    hit_for_each: {
      label: 'Tocado para cada uno',
      description:
        'Concede el tocado a ambos tiradores, distinto de la señal de golpe doble que resuelve la prioridad.',
    },
    technical_touch: {
      label: 'Tocado técnico',
      description:
        'Concede un tocado causado por un fallo del material o del aparato, no por una acción de esgrima.',
    },
    changing_decision: {
      label: 'Cambio de decisión',
      description:
        'Anula una decisión anterior, normalmente tras consultar con el directorio técnico o revisar el vídeo.',
    },
    card: {
      label: 'Tarjeta',
      description:
        'Muestra una tarjeta amarilla, roja o negra: una advertencia, un tocado de penalización o la exclusión de la competición.',
    },
    winner: {
      label: 'Ganador',
      description: 'Declara el ganador del asalto.',
    },
  },

  groups: {
    preparatory: 'Preparatorias',
    phrase_analysis: 'Análisis de la frase',
    awarding: 'Concesión',
    administrative: 'Administrativas',
  },

  feedback: {
    offArmDown: 'Mantén el otro brazo abajo, junto al cuerpo',
    haltStraighten: 'Estira del todo el brazo levantado',
    haltOverhead: 'Lleva el brazo recto por encima de la cabeza',
    haltAboveHead: 'Sube la mano por encima de la cabeza',
    haltOpenHand: 'Abre del todo la mano levantada, con la palma hacia delante',
    attackBend: 'Flexiona el codo: con el brazo recto es otra señal',
    attackShoulderHeight: 'Lleva el brazo a la altura del hombro',
    attackForearm: 'Apunta el antebrazo hacia el lado, al tirador que atacó',
    handLevelShoulder: 'Mantén la mano a la altura del hombro',
    attackOutToSide: 'Lleva la señal hacia el lado, no hacia delante',
    bendRightAngle: 'Flexiona el codo hasta formar más o menos un ángulo recto',
    parryForearm: 'Sube el antebrazo hacia la vertical, como si parases',
    parryElbowLow: 'Mantén el codo bajo: solo sube el antebrazo',
    parryAboveShoulder: 'Sube la mano por encima del hombro',
    parryBesideHead: 'Mantén la mano junto a la cabeza, no hacia el lado',
    extendFully: 'Extiende el brazo del todo',
    armShoulderHeight: 'Mantén el brazo hacia fuera a la altura del hombro',
    pointOutToSide: 'Apunta recto hacia el lado',
    pointIndex: 'Apunta con el índice: la mano abierta es «tocado en contra»',
    hitRaiseArm: 'Sube todo el brazo hacia el lado del que tocó',
    hitHandHigh: 'Sube la mano bien por encima del hombro',
    hitScorerSide: 'Sube el brazo del lado del que tocó, no delante de la cabeza',
    againstOutToSide: 'Lleva el brazo recto hacia el lado',
    againstFlatHand: 'Muestra la mano plana y abierta: el índice extendido es «punta en línea»',
    keepStraight: 'Mantén el brazo recto',
    notValidAngle: 'Inclina el brazo hacia el suelo, a medio camino de tu costado',
    notValidBelowShoulder: 'Mantén la mano bien por debajo del hombro',
    notValidAway: 'Separa el brazo del cuerpo, no lo bajes recto por delante',
    doubleStraighten: 'Estira del todo ambos brazos hacia los lados',
    doubleShoulderHeight: 'Sube ambas manos a la altura de los hombros',
    doubleOutToSides: 'Lleva ambos brazos hacia los lados, no hacia delante',
    bothLevel: 'Mantén ambos brazos a la misma altura',
    simultaneousExtend: 'Extiende ambos brazos hacia delante',
    simultaneousChest: 'Mantén ambas manos a la altura del pecho',
    simultaneousInFront: 'Lleva ambos brazos por delante de ti',
    simultaneousTogether: 'Junta las manos delante de ti',
    nothingStraighten: 'Estira ambos brazos',
    nothingLow: 'Baja ambas manos por debajo de la cintura',
    nothingForward: 'Lleva ambos brazos hacia delante, no a los costados',
    nothingOpen: 'Abre ambas manos, con las palmas hacia abajo',
  },

  rules: {
    index: {
      title: 'Reglamentos y documentos FIE',
      description: 'El índice oficial: siempre apunta a la edición vigente.',
    },
    technical: {
      title: 'Reglamento técnico',
      description: 'Desarrollo del asalto, prioridad y las señales del árbitro del artículo t.63.',
    },
    organisation: {
      title: 'Reglamento de organización',
      description: 'Formatos de competición, clasificaciones y desarrollo de las pruebas.',
    },
    material: {
      title: 'Reglamento de material',
      description: 'Especificaciones de armas, indumentaria y aparatos de señalización.',
    },
    edition: 'Agosto de 2026',
  },

  weapons: {
    epee: {
      label: 'Espada',
      target: 'Todo el cuerpo, de la careta a los pies.',
      summary:
        'Sin prioridad: quien toca primero marca, y dos luces dentro del tiempo de bloqueo dan un tocado a cada uno. El árbitro señala el resultado, nunca la frase.',
      excluded: {
        attack: 'La espada no tiene prioridad, así que la frase nunca se analiza.',
        parry: 'La parada es una señal de prioridad, y la espada no usa prioridad.',
        point_in_line: 'La línea solo importa porque da prioridad, y la espada no la concede.',
        not_valid: 'Todo el cuerpo es superficie válida, así que ningún tocado cae fuera.',
        simultaneous:
          'Simultáneo es una señal de prioridad. En espada, dos luces dentro del bloqueo son un tocado para cada uno.',
      },
    },
    foil: {
      label: 'Florete',
      target: 'El tronco, por delante y por detrás, más la parte inferior del babero de la careta.',
      summary:
        'Prioridad completa. Dos luces se resuelven a favor de un tirador, en ningún tocado cuando las acciones son realmente simultáneas, o en un tocado no válido que detiene el combate sin marcar.',
      excluded: {
        double_hit:
          'La prioridad resuelve las dos luces a favor de un tirador o en ningún tocado: el florete nunca da un tocado a cada uno.',
      },
    },
    sabre: {
      label: 'Sable',
      target: 'Todo lo que está por encima de la cintura salvo las manos: careta, brazos y tronco.',
      summary:
        'Prioridad completa y sin superficie no válida: un golpe fuera de la superficie válida simplemente no se registra, así que no hay nada que señalar.',
      excluded: {
        double_hit:
          'La prioridad resuelve las dos luces a favor de un tirador o en ningún tocado: el sable nunca da un tocado a cada uno.',
        not_valid: 'En sable no hay tocados no válidos, así que no hay nada que señalar.',
      },
    },
  },

  spoken: {
    riposte: 'respuesta',
  },

  measure: {
    groups: {
      arm: {
        label: 'Ángulos del brazo',
        note: 'Medidos respecto al torso, así que no cambian al girarte respecto a la cámara; vigila «fuera de frente» más abajo mientras lo compruebas.',
      },
      wrist: {
        label: 'Posición de la muñeca',
        note: 'En longitudes de torso en lugar de metros, para que un mismo umbral sirva a un árbitro de 1,6 m y a uno de 2 m. La altura es el principal criterio para las señales de dos brazos.',
      },
      body: {
        label: 'Ambos brazos y el cuerpo',
        note: 'Las señales de dos brazos se distinguen por estos valores. «Fuera de frente» es la prueba de invariancia: gira sobre ti mismo y todos los ángulos de arriba deberían quedarse quietos mientras este número sube.',
      },
      hand: {
        label: 'Forma de la mano',
        note: 'Solo Alto, Punta en línea y Nada leen los dedos. Cada número es punta-muñeca entre nudillo-muñeca: por encima de 1,15 cuenta como extendido, por debajo de 0,95 como flexionado, y el hueco entre ambos es «desconocido» a propósito.',
      },
    },
    rows: {
      elbow: { label: 'Codo', hint: '180 recto, 90 en ángulo recto, 0 cerrado' },
      upper_elevation: {
        label: 'Elevación del brazo',
        hint: '−90 colgando, 0 horizontal, +90 por encima de la cabeza',
      },
      upper_abduction: {
        label: 'Abducción del brazo',
        hint: 'elevación + 90: la forma que usan las lecturas t.63',
      },
      upper_azimuth: {
        label: 'Azimut del brazo',
        hint: '0 recto al frente, +90 hacia el propio lado de ese brazo',
      },
      forearm_elevation: {
        label: 'Elevación del antebrazo',
        hint: 'cerca de +90 es el antebrazo vertical de la Parada',
      },
      forearm_azimuth: {
        label: 'Azimut del antebrazo',
        hint: 'cerca de +90 es el antebrazo lateral del Ataque',
      },
      wrist_height: { label: 'Altura', hint: '0 en las caderas, 1 en los hombros' },
      wrist_vsShoulder: {
        label: 'Altura respecto al hombro',
        hint: '0 es a la altura de ese hombro',
      },
      wrist_vsNose: {
        label: 'Altura respecto a la nariz',
        hint: 'positivo es por encima de la nariz, como exige Alto',
      },
      wrist_lateral: {
        label: 'Separación de la línea media',
        hint: 'positivo es alejándose del eje del cuerpo',
      },
      wrist_forward: { label: 'Delante del pecho', hint: 'positivo es por delante del pecho' },
      wrists_gap: {
        label: 'Separación de las muñecas',
        hint: '× anchura de hombros; menos de 1 es manos juntas',
      },
      wrists_heightDelta: {
        label: 'Diferencia de altura de las muñecas',
        hint: '0 es a la misma altura: la simetría que pide Golpe doble',
      },
      body_turn: { label: 'Fuera de frente a la cámara', hint: '0 es de frente a la cámara' },
      body_lean: { label: 'Inclinación', hint: '0 es de pie y recto' },
      body_torso: {
        label: 'Longitud del torso',
        hint: 'de caderas a hombros: la escala por la que se divide cada altura',
      },
      body_shoulderWidth: {
        label: 'Anchura de hombros',
        hint: 'la referencia para la separación de las muñecas',
      },
      hand_index: { label: 'Dedo índice', hint: '' },
      hand_middle: { label: 'Dedo corazón', hint: '' },
      hand_ring: { label: 'Dedo anular', hint: '' },
      hand_pinky: { label: 'Dedo meñique', hint: '' },
      hand_thumb: {
        label: 'Pulgar',
        hint: 'solo informativo: no se clasifica ninguna forma con él',
      },
    },
  },
};

export default es;
