import type { ExamPaperDataset } from '../types/exam';

export const SAMPLE_ANSWER_KEY_TEXT = `1: B
2: C
3: A
4: 4
5: B
6: D
7: A
8: 25
9: C
10: B
11: A
12: 12`;

export const INITIAL_SAMPLE_PAPERS: ExamPaperDataset[] = [
  {
    id: 'jee-main-2026-sample-1',
    title: 'JEE Main 2026 Mock Paper — Calculus, Electrostatics & Equilibrium',
    sourceFileName: 'JEE_Main_2026_Shift1_Sample.pdf',
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
    durationMinutes: 45,
    numericalNegativeMarking: 1,
    answerKeyAttached: true,
    answerKeySource: 'Official NTA Answer Key (Seeded)',
    questions: [
      {
        id: 'q-1',
        questionNumber: 1,
        subject: 'Mathematics',
        type: 'mcq',
        prompt:
          'Evaluate the definite integral with symmetric limits: $$I = \\int_{-\\pi/2}^{\\pi/2} \\frac{\\cos^2 x}{1 + 3^x}\\,dx$$',
        options: [
          { label: 'A', text: '$\\frac{\\pi}{2}$' },
          { label: 'B', text: '$\\frac{\\pi}{4}$' },
          { label: 'C', text: '$\\pi$' },
          { label: 'D', text: '$\\frac{\\pi}{8}$' },
        ],
        correctAnswer: 'B',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-2',
        questionNumber: 2,
        subject: 'Mathematics',
        type: 'mcq',
        prompt:
          'Find the value of the infinite series summation: $$S = \\sum_{n=1}^{\\infty} \\frac{n}{3^n}$$',
        options: [
          { label: 'A', text: '$\\frac{1}{2}$' },
          { label: 'B', text: '$\\frac{2}{3}$' },
          { label: 'C', text: '$\\frac{3}{4}$' },
          { label: 'D', text: '$\\frac{9}{4}$' },
        ],
        correctAnswer: 'C',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-3',
        questionNumber: 3,
        subject: 'Mathematics',
        type: 'mcq',
        prompt:
          'Let $L = \\lim_{n \\to \\infty} \\sum_{k=1}^{n} \\frac{n}{n^2 + k^2}$. Then the exact value of $L$ is:',
        options: [
          { label: 'A', text: '$\\frac{\\pi}{4}$' },
          { label: 'B', text: '$\\frac{\\pi}{2}$' },
          { label: 'C', text: '$\\ln 2$' },
          { label: 'D', text: '$1$' },
        ],
        correctAnswer: 'A',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-4',
        questionNumber: 4,
        subject: 'Mathematics',
        type: 'numerical',
        prompt:
          'If $\\int_{0}^{2} |x^2 - 1|\\,dx = \\frac{k}{2}$, then find the integer value of $k$.',
        correctAnswer: '4',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-5',
        questionNumber: 5,
        subject: 'Physics',
        type: 'mcq',
        prompt:
          'A solid non-conducting sphere of radius $R$ carries a uniform volume charge density $\\rho$. Using Gauss law $\\oint \\vec{E}\\cdot d\\vec{A} = \\frac{q_{\\text{enc}}}{\\varepsilon_0}$, the electric field at distance $r = \\frac{R}{2}$ from the center is:',
        options: [
          { label: 'A', text: '$\\frac{\\rho R}{3\\varepsilon_0}$' },
          { label: 'B', text: '$\\frac{\\rho R}{6\\varepsilon_0}$' },
          { label: 'C', text: '$\\frac{\\rho R}{12\\varepsilon_0}$' },
          { label: 'D', text: '$0$' },
        ],
        correctAnswer: 'B',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-6',
        questionNumber: 6,
        subject: 'Physics',
        type: 'mcq',
        prompt:
          'The de Broglie wavelength of an electron accelerated from rest through a potential difference $V$ is $\\lambda$. If the potential difference is increased to $4V$, the new de Broglie wavelength becomes:',
        options: [
          { label: 'A', text: '$4\\lambda$' },
          { label: 'B', text: '$2\\lambda$' },
          { label: 'C', text: '$\\frac{\\lambda}{4}$' },
          { label: 'D', text: '$\\frac{\\lambda}{2}$' },
        ],
        correctAnswer: 'D',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-7',
        questionNumber: 7,
        subject: 'Physics',
        type: 'mcq',
        prompt:
          'For a series $LCR$ circuit driven by an AC source $V = V_0 \\sin(\\omega t)$ at resonance $\\omega = \\frac{1}{\\sqrt{LC}}$, the phase difference between applied voltage and current is:',
        options: [
          { label: 'A', text: '$0\\text{ rad}$' },
          { label: 'B', text: '$\\frac{\\pi}{4}\\text{ rad}$' },
          { label: 'C', text: '$\\frac{\\pi}{2}\\text{ rad}$' },
          { label: 'D', text: '$\\pi\\text{ rad}$' },
        ],
        correctAnswer: 'A',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-8',
        questionNumber: 8,
        subject: 'Physics',
        type: 'numerical',
        prompt:
          'A projectile is launched with speed $u = 20\\text{ m/s}$ at an angle of $30^{\\circ}$ above the horizontal ($g = 10\\text{ m/s}^2$). The maximum height attained is $H$ meters. Find $5H$.',
        correctAnswer: '25',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-9',
        questionNumber: 9,
        subject: 'Chemistry',
        type: 'mcq',
        prompt:
          'For the reversible reaction $\\text{N}_2(g) + 3\\text{H}_2(g) \\rightleftharpoons 2\\text{NH}_3(g)$, the relationship between $K_p$ and $K_c$ at temperature $T$ is:',
        options: [
          { label: 'A', text: '$K_p = K_c (RT)^2$' },
          { label: 'B', text: '$K_p = K_c (RT)^{-1}$' },
          { label: 'C', text: '$K_p = K_c (RT)^{-2}$' },
          { label: 'D', text: '$K_p = K_c$' },
        ],
        correctAnswer: 'C',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-10',
        questionNumber: 10,
        subject: 'Chemistry',
        type: 'mcq',
        prompt:
          'The standard Gibbs free energy change for a cell reaction is given by $\\Delta G^{\\circ} = -nFE^{\\circ}_{\\text{cell}}$. If $n = 2$ and $E^{\\circ}_{\\text{cell}} = 1.10\\text{ V}$, then $\\Delta G^{\\circ}$ in $\\text{kJ mol}^{-1}$ is approximately ($F = 96500\\text{ C mol}^{-1}$):',
        options: [
          { label: 'A', text: '$-106.15$' },
          { label: 'B', text: '$-212.30$' },
          { label: 'C', text: '$+212.30$' },
          { label: 'D', text: '$-424.60$' },
        ],
        correctAnswer: 'B',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-11',
        questionNumber: 11,
        subject: 'Chemistry',
        type: 'mcq',
        prompt:
          'Among the complex ions $[\\text{Ni(CN)}_4]^{2-}$ and $[\\text{NiCl}_4]^{2-}$, their respective geometries and magnetic behaviors are:',
        options: [
          { label: 'A', text: 'Square planar (diamagnetic) and Tetrahedral (paramagnetic)' },
          { label: 'B', text: 'Tetrahedral (paramagnetic) and Square planar (diamagnetic)' },
          { label: 'C', text: 'Both square planar and diamagnetic' },
          { label: 'D', text: 'Both tetrahedral and paramagnetic' },
        ],
        correctAnswer: 'A',
        marksPositive: 4,
        marksNegative: 1,
      },
      {
        id: 'q-12',
        questionNumber: 12,
        subject: 'Chemistry',
        type: 'numerical',
        prompt:
          'Calculate the $\\text{pH}$ of a $0.01\\text{ M}$ aqueous $\\text{NaOH}$ solution at $298\\text{ K}$ ($K_w = 10^{-14}$).',
        correctAnswer: '12',
        marksPositive: 4,
        marksNegative: 1,
      },
    ],
  },
];
