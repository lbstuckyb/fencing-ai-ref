import type { Dictionary } from './index';

/** French. Signal names follow the FIE's own French refereeing vocabulary. */
const fr: Dictionary = {
  lang: {
    names: { en: 'English', es: 'Español', fr: 'Français' },
    selector: 'Langue',
  },

  common: {
    moreInfo: 'Plus d’infos',
    home: '‹ Accueil',
    tryAgain: 'Réessayer',
    cancel: 'Annuler',
    why: 'Pourquoi',
    startsIn: 'Début dans {n}…',
    recordingFor: 'Enregistrement… {s} s',
    recordSeconds: 'Enregistrer {s} s',
    eitherArm: 'un bras ou l’autre',
  },

  side: {
    arm: { left: 'bras gauche', right: 'bras droit' },
    yourArm: { left: 'votre bras gauche', right: 'votre bras droit' },
    yourHand: { left: 'votre main gauche', right: 'votre main droite' },
    yourSide: { left: 'votre gauche', right: 'votre droite' },
  },

  nav: {
    brand: 'Entraîneur d’arbitrage d’escrime',
    brandShort: 'Arbitre',
    skip: 'Aller au contenu',
    main: 'Principal',
    tuning: 'Réglages',
    about: 'À propos',
    learn: 'Apprendre',
    practice: 'Pratiquer',
    referee: 'Arbitrer',
    yourSignals: 'Vos signaux',
    readouts: 'Mesures',
  },

  home: {
    title1: 'À vous',
    title2: 'de juger.',
    enter: 'Entrer ›',
    signals: 'Signaux',
    hold: 'Tenue',
    weapons: 'Armes',
  },

  about: {
    title: 'À propos',
    p1: 'Ce projet veut permettre à chacun, partout dans le monde, de s’entraîner et de progresser en arbitrage d’escrime.',
    p2: 'Apprenez les signaux, entraînez-vous devant votre caméra, puis arbitrez de vraies situations. Tout est évalué selon le Règlement technique de la FIE, article {article}.',
    p3: 'Tout fonctionne sur votre appareil : aucune vidéo ne quitte votre navigateur.',
  },

  notFound: {
    title: 'Page introuvable',
  },

  reference: {
    title: 'Apprendre',
    selected: 'Signal sélectionné',
    namesFencer: 'Désigne un tireur',
    namesFencerHint:
      'Le bras utilisé désigne le tireur : bras gauche pour le tireur à votre gauche (rouge), bras droit pour celui à votre droite (vert).',
    eitherArm: 'Un bras ou l’autre',
    notGraded: 'Non évalué',
    readsHand: 'Lit votre main',
    drill: 'S’entraîner : {signal} ›',
    drillAll: 'Tous les signaux ›',
    rulebook: 'Règlement ↗',
    filter: 'Filtrer par groupe',
    all: 'Tous',
  },

  practice: {
    title: 'Entraînement',
    streak: 'Série',
    best: 'Record',
    score: 'Score',
    signals: '‹ Signaux',
    hintRandom:
      'Ordre aléatoire. Baissez les bras après chaque signal pour passer au suivant. Choisissez-en un pour rester dessus.',
    hintPinned: 'Vous restez sur {signal}. « Signal suivant » revient à l’ordre aléatoire.',
    next: 'Signal suivant ›',
    referee: 'Arbitrer ›',
    pickOne: 'Travailler un signal',
    close: 'Fermer',
    namesFencer: 'désigne un tireur',
  },

  feedbackUi: {
    held: '{signal} — tenu {s} s',
    quick: '{signal} — trop rapide',
    wrongArm: '{signal} — mauvais bras',
    wrongArmUse: 'Mauvais bras — utilisez votre',
    holding: 'Tenu',
    holdIt: 'Tenez',
    shape: 'forme {n} %',
  },

  scenarios: {
    title: 'Arbitrer',
    difficulty: 'Difficulté {n}',
    about: 'À propos : {weapon}',
    neverCalled: 'Jamais annoncé : {signals}.',
    rightOfWay: 'Convention',
    noRightOfWay: 'Sans convention',
    phrases: '‹ Phrases',
    hint: 'Cadrez-vous, puis lancez la phrase. Vous avez cinq secondes pour vous placer. Chaque signal tenu est enregistré jusqu’à ce que vous validiez, relectures comprises.',
    noSignal: 'Pas encore de signal',
    noCalls: 'Pas encore de décision',
    callsSoFar: 'Décisions jusqu’ici',
    quick: 'rapide',
    undo: 'Annuler la dernière',
    submit: 'Valider la décision',
  },

  player: {
    unavailable: 'Vidéo indisponible',
    unavailableHint1: 'Les vidéos d’exemple sont générées, pas versionnées. Lancez',
    unavailableHint2: '(nécessite ffmpeg), ou déposez une vidéo dans',
    unavailableHint3: '. Vous pouvez quand même arbitrer et être évalué.',
    pause: 'Pause',
    play: 'Lecture',
    replay: 'Revoir',
    stepBack: 'Reculer d’une image',
    stepForward: 'Avancer d’une image',
    slowMotion: 'Ralenti',
    slow: 'Ralenti',
    ended: 'Vidéo terminée · enregistrement en cours',
    getReady: 'Préparez-vous à arbitrer',
    playPhrase: 'Lancer la phrase',
    waiting: 'En attente de la caméra',
  },

  grade: {
    correct: 'Correct',
    out_of_order: 'Dans le désordre',
    wrong_side: 'Mauvais bras',
    wrong_signal: 'Mauvais signal',
    missing: 'Manquant',
    spoken: 'Annoncé',
    extra: 'En trop',
    correctCount: '{correct}/{total} corrects',
    extraCalls: 'Signaux en trop',
    whatHappened: 'Ce qui s’est passé',
    tryAgain: 'Réessayer',
    allPhrases: 'Toutes les phrases',
    nextPhrase: 'Phrase suivante ›',
    sideNote: ' avec {arm}',
    msgCorrect: '{signal}{sideNote} : correct.',
    msgOutOfOrder: '{signal}{sideNote} était bien fait, mais dans le désordre.',
    msgWrongSide:
      '{signal} était juste, mais fait avec {callArm} — celui-ci désigne le tireur à {side}.',
    msgWrongSignal: 'Attendu : {signal}{sideNote}, mais vous avez annoncé {call} ici.',
    msgMissing: '{signal}{sideNote} n’a jamais été annoncé.',
    msgExtra:
      'Vous avez aussi annoncé {call}{sideNote}, qui ne faisait pas partie de cette phrase.',
  },

  camera: {
    start: 'Activer la caméra',
    stop: 'Arrêter la caméra',
    starting: 'Démarrage de la caméra…',
    about: 'À propos de la caméra',
    aboutHint: 'Chaque image est traitée dans cet onglet. Rien n’est envoyé ni enregistré.',
    noPose: 'personne dans le cadre',
    landmarks: '{n} points @ {rate}/s',
    hand: '{n} main',
    hands: '{n} mains',
    handsUnavailable: 'Détail des mains indisponible',
    handsUnavailableHint:
      'Le modèle des mains ne s’est pas chargé. La géométrie des bras reste évaluée. Lancez',
    failures: {
      insecure_context: {
        title: 'Le navigateur refuse de partager la caméra sur cette page',
        detail:
          'L’accès à la caméra nécessite un contexte sécurisé. Ouvrez l’application en https, ou sur localhost pendant le développement.',
      },
      permission_denied: {
        title: 'L’accès à la caméra a été refusé',
        detail:
          'Autorisez la caméra pour ce site — en général via l’icône de caméra dans la barre d’adresse — puis recommencez. Rien de ce que vous filmez n’est envoyé : la vidéo est traitée dans cet onglet puis effacée.',
      },
      no_camera: {
        title: 'Aucune caméra trouvée',
        detail:
          'Branchez une webcam et recommencez. Les exercices ont besoin de voir le haut de votre corps en direct.',
      },
      camera_busy: {
        title: 'La caméra est déjà utilisée',
        detail:
          'Une autre application ou un autre onglet utilise la caméra. Fermez-le, puis recommencez.',
      },
      camera_lost: {
        title: 'La caméra s’est arrêtée',
        detail:
          'Le flux vidéo s’est interrompu — l’appareil a peut-être été débranché ou l’autorisation retirée.',
      },
      model_assets: {
        title: 'Le modèle de posture est manquant',
        detail:
          'Le modèle et le moteur MediaPipe sont fournis dans public/ au lieu d’être chargés depuis un CDN. Lancez `npm run fetch-assets`, puis recommencez.',
      },
      model_runtime: {
        title: 'La détection de posture n’a pas pu démarrer',
        detail:
          'Le détecteur de posture n’a pas pu s’initialiser dans ce navigateur. Une version récente de Chrome, Edge, Firefox ou Safari est nécessaire.',
      },
      unknown: {
        title: 'Impossible de démarrer la caméra',
        detail: 'Une erreur inattendue s’est produite. La console du navigateur donne les détails.',
      },
    },
  },

  calibrate: {
    title: 'Calibrer',
    hint: 'Mesures en direct de chaque grandeur utilisée par les signaux. Faites un signal, enregistrez la tenue, et reportez les valeurs mesurées dans la spécification.',
    measurement: 'Mesure',
    noSamples: 'aucun échantillon',
    classified: 'Forme détectée — {shapes}',
    clear: 'Effacer l’enregistrement',
    recorded: '{frames} images enregistrées en {s} s',
    recordedHint:
      'La petite ligne de chaque case donne min · médiane · max sur la tenue. Prenez la médiane comme centre d’une plage et l’écart comme la tolérance nécessaire.',
  },

  calibrateSignals: {
    title: 'Calibration experte',
    hint: 'Filmez-vous en faisant chaque signal correctement. Les exercices seront ensuite évalués d’après votre enregistrement plutôt que les valeurs par défaut. Une nouvelle prise remplace l’ancienne ; réinitialiser rétablit les valeurs par défaut.',
    arm: 'Bras',
    rightArm: 'Bras droit',
    leftArm: 'Bras gauche',
    bothArms: 'Les deux bras',
    recording: 'Enregistrement',
    recordedWith: 'Enregistré avec {arm}',
    save: 'Enregistrer',
    retake: 'Refaire',
    coreTen: 'Les dix principaux',
    coreTenHint:
      'Choisissez un signal pour l’enregistrer. Exporter sauvegarde tous les enregistrements de cet appareil dans un fichier ; importer en recharge un, par-dessus ce qui est déjà sauvegardé.',
    export: 'Exporter',
    import: 'Importer',
    usingYours: 'Votre enregistrement',
    usingDefault: 'Plage par défaut',
    reset: 'Réinitialiser',
    measurement: 'Mesure',
    youRecorded: 'Votre mesure',
    defaultBand: 'Plage par défaut',
    newBand: 'Nouvelle plage',
    skippedOne:
      '{n} autre contrainte — forme de la main ou symétrie des bras — n’est pas affichée ici : ce n’est pas une plage qu’un enregistrement peut élargir.',
    skippedMany:
      '{n} autres contraintes — forme de la main ou symétrie des bras — ne sont pas affichées ici : aucune n’est une plage qu’un enregistrement peut élargir.',
  },

  coaching: {
    tooQuick:
      'Tenu {held} s — trop rapide : un signal doit durer de {min} à {max} secondes et être expressif.',
    wrongSide:
      'Le signal {signal} est juste, mais fait avec {arm}. Il désigne le tireur de ce côté, il faut donc utiliser {prompted}.',
    sideWord: ' ({arm})',
    unmeasured:
      '{label}{side} : mesure impossible — vérifiez que tout le haut de votre corps est dans le cadre.',
    outOfRange: '{label}{side} : {value} — attendu {band}.',
    handMissing: '{hand} n’est pas détectée — placez-la là où la caméra la voit.',
    wrongShape: '{hand} est lue comme {shape} — ce signal demande {expected}.',
    symmetryUnmeasured:
      '{label} : mesure impossible sur les deux bras — vérifiez qu’ils sont tous deux dans le cadre.',
    asymmetric: 'Vos bras diffèrent de {delta} en {label} — ce signal les veut à la même hauteur.',
    atLeast: 'au moins {n}',
    atMost: 'au plus {n}',
    anyValue: 'n’importe quelle valeur',
  },

  shapes: {
    open_palm: 'paume ouverte',
    fist: 'poing',
    index_point: 'index pointé',
    unknown: 'inconnue',
    none: 'non détectée',
  },

  signals: {
    halt: {
      label: 'Halte',
      description:
        'Un bras levé bien droit au-dessus de la tête, paume ouverte : on arrête le combat. L’autre bras reste en bas.',
    },
    attack: {
      label: 'Attaque',
      description:
        'Le bras qui signale vers le côté, coude fléchi, l’avant-bras pointé vers le tireur qui a attaqué. Le même geste sert pour le coup d’arrêt, la contre-attaque et la remise, qui sont annoncés à voix haute.',
    },
    parry: {
      label: 'Parade',
      description:
        'L’avant-bras levé presque vertical à côté de la tête, coude bas, en imitant une parade : le tireur de ce côté a paré. Le contre-temps utilise le même geste.',
    },
    point_in_line: {
      label: 'Ligne',
      description:
        'Le bras tendu bien droit sur le côté, l’index pointé vers le tireur qui a établi la ligne.',
    },
    hit_scored: {
      label: 'Touche',
      description:
        'Le bras levé vers l’extérieur et vers le haut du côté du tireur qui a touché, coude à peu près à angle droit : la touche est pour lui.',
    },
    hit_against: {
      label: 'Touche contre',
      description:
        'Le bras tendu bien droit sur le côté, main à plat, du côté du tireur qui a reçu la touche.',
    },
    not_valid: {
      label: 'Non valable',
      description:
        'Le bras tendu vers le bas et vers l’extérieur, vers le sol, du côté de ce tireur : sa touche est hors surface et ne compte pas.',
    },
    double_hit: {
      label: 'Coup double',
      description:
        'Les deux bras tendus sur les côtés à hauteur d’épaule : les deux tireurs ont touché — un coup double, qui compte pour les deux à l’épée.',
    },
    simultaneous: {
      label: 'Simultané',
      description:
        'Les deux bras vers l’avant, les mains se rejoignant devant la poitrine : les deux attaques étaient simultanées, aucune touche n’est accordée.',
    },
    nothing: {
      label: 'Rien',
      description:
        'Les deux bras tendus bas et vers l’avant, paumes vers le sol : aucune touche n’est accordée — la phrase n’a rien donné.',
    },
    on_guard: {
      label: 'En garde',
      description: 'Demande aux tireurs de se mettre en garde avant le début de la phrase.',
    },
    ready: {
      label: 'Êtes-vous prêts ?',
      description: 'Demande aux deux tireurs s’ils sont prêts à tirer.',
    },
    play: {
      label: 'Allez',
      description: 'Lance la phrase : les tireurs peuvent tirer.',
    },
    incorrect: {
      label: 'Incorrect',
      description: 'Indique que l’action d’un tireur était mal exécutée, sans accorder de touche.',
    },
    no: {
      label: 'Non',
      description:
        'Refuse la demande d’un tireur — par exemple pour arrêter la phrase ou réclamer une touche.',
    },
    hit_for_each: {
      label: 'Touche à chacun',
      description:
        'Accorde la touche aux deux tireurs, à distinguer du coup double tranché par la convention.',
    },
    technical_touch: {
      label: 'Touche technique',
      description:
        'Accorde une touche due à une défaillance du matériel ou de l’appareil plutôt qu’à une action d’escrime.',
    },
    changing_decision: {
      label: 'Changement de décision',
      description:
        'Annule une décision précédente, en général après avoir consulté le directoire technique ou la vidéo.',
    },
    card: {
      label: 'Carton',
      description:
        'Montre un carton jaune, rouge ou noir : un avertissement, une touche de pénalité ou l’exclusion de la compétition.',
    },
    winner: {
      label: 'Vainqueur',
      description: 'Désigne le vainqueur du match.',
    },
  },

  groups: {
    preparatory: 'Préparation',
    phrase_analysis: 'Analyse de la phrase',
    awarding: 'Attribution',
    administrative: 'Administratif',
  },

  feedback: {
    offArmDown: 'Gardez l’autre bras le long du corps',
    haltStraighten: 'Tendez complètement le bras levé',
    haltOverhead: 'Montez le bras bien droit au-dessus de la tête',
    haltAboveHead: 'Levez la main au-dessus de la tête',
    haltOpenHand: 'Ouvrez complètement la main levée, paume vers l’avant',
    attackBend: 'Pliez le coude — un bras tendu est un autre signal',
    attackShoulderHeight: 'Montez le bras à hauteur d’épaule',
    attackForearm: 'Pointez l’avant-bras sur le côté, vers le tireur qui a attaqué',
    handLevelShoulder: 'Gardez la main à hauteur d’épaule',
    attackOutToSide: 'Faites le signal sur le côté, pas vers l’avant',
    bendRightAngle: 'Pliez le coude à peu près à angle droit',
    parryForearm: 'Montez l’avant-bras vers la verticale, comme pour parer',
    parryElbowLow: 'Gardez le coude bas — seul l’avant-bras monte',
    parryAboveShoulder: 'Levez la main au-dessus de l’épaule',
    parryBesideHead: 'Gardez la main à côté de la tête, pas sur le côté',
    extendFully: 'Tendez complètement le bras',
    armShoulderHeight: 'Tenez le bras sur le côté à hauteur d’épaule',
    pointOutToSide: 'Pointez bien droit sur le côté',
    pointIndex: 'Pointez avec l’index — une main ouverte, c’est « touche contre »',
    hitRaiseArm: 'Levez tout le bras du côté du tireur qui a touché',
    hitHandHigh: 'Levez la main bien au-dessus de l’épaule',
    hitScorerSide: 'Levez le bras du côté du tireur qui a touché, pas devant la tête',
    againstOutToSide: 'Tendez le bras bien droit sur le côté',
    againstFlatHand: 'Montrez une main ouverte, à plat — un index pointé, c’est « ligne »',
    keepStraight: 'Gardez le bras tendu',
    notValidAngle: 'Inclinez le bras vers le sol, à mi-chemin de votre côté',
    notValidBelowShoulder: 'Gardez la main bien en dessous de l’épaule',
    notValidAway: 'Écartez le bras du corps, ne le baissez pas droit devant vous',
    doubleStraighten: 'Tendez complètement les deux bras sur les côtés',
    doubleShoulderHeight: 'Montez les deux mains à hauteur d’épaule',
    doubleOutToSides: 'Ouvrez les deux bras sur les côtés, pas vers l’avant',
    bothLevel: 'Gardez les deux bras à la même hauteur',
    simultaneousExtend: 'Tendez les deux bras vers l’avant',
    simultaneousChest: 'Tenez les deux mains à hauteur de poitrine',
    simultaneousInFront: 'Amenez les deux bras devant vous',
    simultaneousTogether: 'Rapprochez les mains devant vous',
    nothingStraighten: 'Tendez les deux bras',
    nothingLow: 'Baissez les deux mains sous la taille',
    nothingForward: 'Tendez les deux bras vers l’avant, pas le long du corps',
    nothingOpen: 'Ouvrez les deux mains, paumes vers le sol',
  },

  rules: {
    index: {
      title: 'Règlements et documents FIE',
      description: 'L’index officiel — renvoie toujours à l’édition en vigueur.',
    },
    technical: {
      title: 'Règlement technique',
      description: 'Déroulement du match, convention, et signaux de l’arbitre à l’article t.63.',
    },
    organisation: {
      title: 'Règlement d’organisation',
      description: 'Formules de compétition, classements et déroulement des épreuves.',
    },
    material: {
      title: 'Règlement du matériel',
      description: 'Spécifications des armes, des tenues et des appareils de signalisation.',
    },
    edition: 'Août 2026',
  },

  weapons: {
    epee: {
      label: 'Épée',
      target: 'Tout le corps, du masque aux pieds.',
      summary:
        'Pas de convention : le premier qui touche marque, et deux lampes dans le temps de blocage donnent une touche à chacun. L’arbitre annonce le résultat, jamais la phrase.',
      excluded: {
        attack: 'L’épée n’a pas de convention, la phrase n’est donc jamais analysée.',
        parry: 'La parade relève de la convention, que l’épée n’utilise pas.',
        point_in_line:
          'La ligne ne compte que parce qu’elle donne la priorité — ce que l’épée n’accorde pas.',
        not_valid: 'Tout le corps est surface valable : aucune touche ne peut être hors surface.',
        simultaneous:
          'Simultané relève de la convention. À l’épée, deux lampes dans le temps de blocage donnent une touche à chacun.',
      },
    },
    foil: {
      label: 'Fleuret',
      target: 'Le tronc, devant et derrière, plus le bas de la bavette du masque.',
      summary:
        'Convention complète. Deux lampes se résolvent en faveur d’un tireur, en aucune touche si les actions sont réellement simultanées, ou en une touche non valable qui arrête le combat sans compter.',
      excluded: {
        double_hit:
          'La convention attribue les deux lampes à un tireur ou à aucun — le fleuret ne donne jamais une touche à chacun.',
      },
    },
    sabre: {
      label: 'Sabre',
      target: 'Tout ce qui est au-dessus de la taille sauf les mains — masque, bras et tronc.',
      summary:
        'Convention complète, et pas de touche non valable : un coup hors surface ne s’allume tout simplement pas, il n’y a donc rien à signaler.',
      excluded: {
        double_hit:
          'La convention attribue les deux lampes à un tireur ou à aucun — le sabre ne donne jamais une touche à chacun.',
        not_valid: 'Le sabre n’a pas de touche non valable, il n’y a donc rien à signaler.',
      },
    },
  },

  spoken: {
    riposte: 'riposte',
  },

  measure: {
    groups: {
      arm: {
        label: 'Angles du bras',
        note: 'Mesurés dans le repère du torse : ils ne changent pas quand vous pivotez par rapport à la caméra — surveillez « de biais » plus bas pendant la vérification.',
      },
      wrist: {
        label: 'Position du poignet',
        note: 'En longueurs de torse plutôt qu’en mètres, pour qu’un même seuil convienne à un arbitre de 1,60 m comme de 2 m. La hauteur est le critère principal des signaux à deux bras.',
      },
      body: {
        label: 'Les deux bras, et le corps',
        note: 'Les signaux à deux bras se distinguent sur ces valeurs. « De biais » est le test d’invariance : pivotez sur place, tous les angles ci-dessus doivent rester stables pendant que ce nombre augmente.',
      },
      hand: {
        label: 'Forme de la main',
        note: 'Seuls Halte, Ligne et Rien lisent les doigts. Chaque nombre est bout-poignet sur jointure-poignet : au-dessus de 1,15 le doigt est tendu, en dessous de 0,95 il est replié, et l’écart entre les deux est volontairement « inconnu ».',
      },
    },
    rows: {
      elbow: { label: 'Coude', hint: '180 tendu, 90 à angle droit, 0 replié' },
      upper_elevation: {
        label: 'Élévation du bras',
        hint: '−90 pendant, 0 horizontal, +90 au-dessus de la tête',
      },
      upper_abduction: {
        label: 'Abduction du bras',
        hint: 'élévation + 90 — la forme utilisée par les mesures t.63',
      },
      upper_azimuth: {
        label: 'Azimut du bras',
        hint: '0 droit devant, +90 vers le côté de ce bras',
      },
      forearm_elevation: {
        label: 'Élévation de l’avant-bras',
        hint: 'près de +90 : l’avant-bras vertical de la Parade',
      },
      forearm_azimuth: {
        label: 'Azimut de l’avant-bras',
        hint: 'près de +90 : l’avant-bras latéral de l’Attaque',
      },
      wrist_height: { label: 'Hauteur', hint: '0 aux hanches, 1 aux épaules' },
      wrist_vsShoulder: {
        label: 'Hauteur par rapport à l’épaule',
        hint: '0 au niveau de cette épaule',
      },
      wrist_vsNose: {
        label: 'Hauteur par rapport au nez',
        hint: 'positif au-dessus du nez, comme l’exige Halte',
      },
      wrist_lateral: {
        label: 'Écart de l’axe du corps',
        hint: 'positif en s’éloignant de l’axe du corps',
      },
      wrist_forward: { label: 'Devant la poitrine', hint: 'positif devant la poitrine' },
      wrists_gap: {
        label: 'Écart des poignets',
        hint: '× largeur d’épaules ; moins de 1, les mains sont rapprochées',
      },
      wrists_heightDelta: {
        label: 'Différence de hauteur des poignets',
        hint: '0 à la même hauteur — la symétrie que veut Coup double',
      },
      body_turn: { label: 'De biais par rapport à la caméra', hint: '0 bien face à la caméra' },
      body_lean: { label: 'Inclinaison', hint: '0 debout bien droit' },
      body_torso: {
        label: 'Longueur du torse',
        hint: 'des hanches aux épaules — l’échelle qui divise chaque hauteur',
      },
      body_shoulderWidth: {
        label: 'Largeur d’épaules',
        hint: 'la référence pour l’écart des poignets',
      },
      hand_index: { label: 'Index', hint: '' },
      hand_middle: { label: 'Majeur', hint: '' },
      hand_ring: { label: 'Annulaire', hint: '' },
      hand_pinky: { label: 'Auriculaire', hint: '' },
      hand_thumb: { label: 'Pouce', hint: 'affiché seulement — aucune forme n’en dépend' },
    },
  },
};

export default fr;
