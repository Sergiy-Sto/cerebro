import type { StageId, Project, Card } from '../state/types';

function formatContext(project: Project): string {
  const parts = [`ТЕМА (держи в фокусе на протяжении всего ответа): ${project.frame}`];
  if (project.constraints.length > 0)
    parts.push(`Ограничения: ${project.constraints.join('; ')}`);
  if (project.criteria.length > 0)
    parts.push(`Критерии успеха: ${project.criteria.join('; ')}`);
  return parts.join('\n');
}

function formatCards(cards: Card[]): string {
  return cards.map((c) => `- ${c.status === 'interesting' ? '★ ' : ''}${c.title}: ${c.description}`).join('\n');
}

function existingBlock(existing: string): string {
  if (!existing) return '';
  return `\nCRITICAL — these cards already exist. You MUST NOT repeat, rephrase, or generate anything thematically similar to them:\n${existing}\n`;
}

const FMT = 'ВАЖНО: Весь текст — только на русском языке. Никакого английского.\nOutput each card as a separate JSON object on its own line: {"title": "...", "description": "...", "tags": ["..."]}';

const FMT_METRICS = `ВАЖНО: Весь текст — только на русском языке. Никакого английского.

SELF-CHECK перед каждой идеей:
1. Если бы ты вбил эту идею в Google — она оказалась бы в топ-10 результатов? Если да — выброси и думай глубже.
2. Оцени Новизну от 1 до 10. Если < 7 — замени идею на более неожиданную, затем оценивай снова.

Output each card as a separate JSON object on its own line:
{"title": "...", "description": "...", "tags": ["..."], "metrics": {"novelty": 8, "strength": 7, "feasibility": 6, "testability": 9}, "analysis": "Новизна 8: [почему неочевидно]. Сила 7: [масштаб возможности]. Реализация 6: [что сложно]. Проверка 9: [как быстро протестировать]."}`;

type PromptFn = (ctx: string, prev: string, existing: string) => string;

const STAGE_PROMPTS: Record<StageId, PromptFn> = {
  definition: (ctx, _prev, existing) => `${ctx}
${existingBlock(existing)}
Stage: Definition Deconstruction
This is the foundation. Everything downstream depends on the depth here. Shallow analysis now = shallow hypotheses later.

STEP 1 — Classify the subject (write this silently, do not output it as a card):
Is it (A) a physical object, (B) a process / activity / non-material entity, or (C) a hybrid? This determines which analytical lenses apply.

STEP 2 — Generate 5 cards. Each card = one analytical lens from the list below. Pick the 5 that reveal the most non-obvious structure of THIS specific subject. For each: go deep on that one dimension — not a summary, but a structural X-ray.

Available lenses (pick 5):
1. НАЗНАЧЕНИЕ — all domains of use, functional AND symbolic/decorative. What non-obvious uses exist? What does it enable indirectly?
2. СОСТАВ / СТРОЕНИЕ — for physical objects: materials, components, subsystems. For processes: stages, sub-processes, cycles. What is the minimum viable version? What is irreducible?
3. ФОРМА / СТРУКТУРА — shape, format, architecture. What variations exist in the wild? What is fixed vs. configurable?
4. КАК УСТРОЕНО / КОНСТРУКТИВ — key design decisions in its current form. What alternative implementations have been tried or could exist?
5. ПОЛЬЗОВАТЕЛИ И КОНТЕКСТ ИСПОЛЬЗОВАНИЯ — who uses it, when, under what conditions? How do different user segments interact with it differently?
6. ПРОИСХОЖДЕНИЕ И ЭВОЛЮЦИЯ — NOT etymology of the word. How did this thing come to exist? What original problem did it solve? How has it changed over decades? What direction is it moving in?
7. ОБЯЗАТЕЛЬНЫЕ vs СЛУЧАЙНЫЕ ПРИЗНАКИ — which attributes are essential (remove them → it stops being X) vs. accidental (historical/cultural conventions that could be otherwise)? Name the irreducible core. The accidental attributes are where innovation hides.
8. ГРАНИЧНЫЕ СЛУЧАИ И АНТАГОНИСТЫ — what looks like X but isn't? What competes with X or substitutes for it? Where does the definition break down? These edges reveal what the subject truly is.

Rules:
- Each card must surface something non-obvious — not a Wikipedia paragraph
- End each description with: "→ Для анализа это означает: [one sharp implication for what to explore next]"
- Depth beats breadth: one precise observation beats three generic ones

${FMT}`,

  invert: (ctx, prev, existing) => `${ctx}
${prev ? `\nDefinition analysis (★ = особо важные — работай с ними в первую очередь):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Invert Assumptions
From the structural analysis above, extract the deeply held implicit assumptions — especially from the "обязательные vs случайные признаки" and "граничные случаи" lenses if present. Focus on assumptions that are treated as obvious but are actually just conventions.

For each card: state the assumption precisely, then invert it completely. The inversion should feel wrong or absurd at first — that's the signal you've hit something real.

SELF-CHECK: If the inversion sounds like a known product or obvious idea, go deeper. The best inversions produce a moment of "wait, can you actually do that?"

Generate 5 cards.
Title format: "Инверсия: <assumption>"

${FMT}`,

  friction: (ctx, prev, existing) => `${ctx}
${prev ? `\nKey angles (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Friction Map
Identify the most painful friction points in this topic. Be specific: WHO experiences it, WHEN, and what exactly breaks down. Focus on moments where time, money, or energy is wasted or where people give up. Generate 5 cards.

${FMT}`,

  contradiction: (ctx, prev, existing) => `${ctx}
${prev ? `\nFriction points (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Contradiction Finder
Surface the core tensions in this space. Format: "X requires Y but also requires NOT-Y." These contradictions are where breakthroughs live — the places where conventional solutions fail because satisfying one requirement violates another. Generate 5 cards.

${FMT}`,

  cross_field: (ctx, prev, existing) => `${ctx}
${prev ? `\nContradictions (★ = особо важные, ищи аналоги прежде всего для них):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Cross-field Transfer
For each contradiction above, find a different industry or business sector that faced a structurally identical tension and solved it.

HARD RULES:
- Priority: look in OTHER BUSINESS SECTORS first — retail, logistics, insurance, banking, pharma, real estate, franchising, B2B SaaS, media, staffing, marketplaces, manufacturing, telecom, etc.
- BANNED (too abstract, not useful for business): biology, military logistics, game design, urban planning, cooking, architecture, medieval history, nature metaphors. Reject these immediately.
- Each card MUST use a different industry. No repeats.
- The industry is chosen for STRUCTURAL FIT to this specific contradiction — not for sounding interesting.
- The more specific the business example the better: not "retail" but "fast fashion inventory management", not "banking" but "microloan underwriting in emerging markets".

For each card: name the industry + specific context, state the structural tension it faced, explain the exact mechanism it used to resolve it, map that mechanism to the original contradiction.
Title format: "<Industry>: <principle>"

${FMT}`,

  opportunity: (ctx, prev, existing) => `${ctx}
${prev ? `\nCross-field insights (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Opportunity Tree
Synthesize the insights so far into concrete opportunity spaces. For each: name the beneficiary, the unmet need, and what makes it now possible. Not hypotheses yet — just directions worth exploring. Generate 5 cards.

${FMT}`,

  hypothesis: (ctx, prev, existing) => `${ctx}
${prev ? `\nOpportunity spaces (★ = особо важные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Hypothesis Generation
Turn the selected opportunities into testable business hypotheses. Format: "We believe [specific customer] will [specific action] because [insight], resulting in [business outcome]." Each must be falsifiable — you should be able to imagine an experiment that proves it wrong. Generate 5 cards.

${FMT_METRICS}`,

  critic: (ctx, prev, existing) => `${ctx}
${prev ? `\nHypotheses to critique (★ = приоритетные для критики):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Critic Pass
For each hypothesis above, be its harshest critic. What are the 3 most likely failure modes? What assumptions must hold true? Is there prior art that tried this and failed? Be ruthlessly honest — a weak critique is useless. Generate one critique card per hypothesis.
Title format: "Critique: <hypothesis name>"
For metrics: novelty = how non-obvious this failure mode is, strength = how fatal this failure would be, feasibility = likelihood this failure actually occurs, testability = how fast you can detect this risk early.

${FMT_METRICS}`,

  shortlist: (ctx, prev, existing) => `${ctx}
${prev ? `\nHypotheses + critiques (★ = особо интересные):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Shortlist
${existing
  ? 'The top hypotheses are already shortlisted (shown above as already generated — do not repeat them). Now surface the NEXT TIER — hypotheses that almost made the cut but have a significant weakness. For each: explain what holds it back and under what conditions it would become stronger. These are the "dark horse" candidates. Continue numbering after the last already-generated rank.'
  : 'From the hypotheses and critiques above, select the 3-5 that best survived scrutiny. For each: explain why it made the cut — what makes it defensible, differentiated, and actionable right now. Rank them #1 being strongest.'}
Title format: "#<rank>: <hypothesis name>"

${FMT_METRICS}`,

  validation: (ctx, prev, existing) => `${ctx}
${prev ? `\nShortlisted hypotheses (★ = проверять в первую очередь):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Validation Plan
For each shortlisted hypothesis, design the cheapest and fastest test that could prove or disprove it. Specify: what exactly to test, how to test it (no-code / manual ok), what metric = true, what metric = false, and rough time+cost estimate. Generate 1-2 test cards per hypothesis.
Title format: "Test: <what>"
For metrics: novelty = creativity of the test approach, strength = how conclusive the result will be, feasibility = cost/effort to run, testability = days to first signal.

${FMT_METRICS}`,
};

export function buildPrompt(
  stageId: StageId,
  project: Project,
  prevCards: Card[],
  existingCards: Card[] = []
): string {
  const ctx = formatContext(project);
  const prev = formatCards(prevCards);
  const existing = formatCards(existingCards);
  return STAGE_PROMPTS[stageId](ctx, prev, existing);
}
