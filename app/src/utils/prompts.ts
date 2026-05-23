import type { StageId, Project, Card } from '../state/types';

function formatContext(project: Project): string {
  const parts = [`Topic: ${project.frame}`];
  if (project.constraints.length > 0)
    parts.push(`Constraints: ${project.constraints.join('; ')}`);
  if (project.criteria.length > 0)
    parts.push(`Success criteria: ${project.criteria.join('; ')}`);
  return parts.join('\n');
}

function formatCards(cards: Card[]): string {
  return cards.map((c) => `- ${c.title}: ${c.description}`).join('\n');
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
Decompose the topic by looking at it through radically different lenses. Consider angles like: etymological, stakeholder, functional, systemic, temporal — but don't limit yourself to these. Pick the angles that reveal the most hidden or non-obvious aspects of this specific topic. Generate 5 cards, each = one distinct lens.

${FMT}`,

  invert: (ctx, prev, existing) => `${ctx}
${prev ? `\nDefinition angles (★ selected):\n${prev}` : ''}
${existingBlock(existing)}
Stage: Invert Assumptions
From the definition angles above, extract the most deeply held implicit assumptions. For each: state the assumption clearly, then invert it completely. The inversion should feel surprising or even wrong at first — that's the point. Generate 5 cards.
Title format: "Invert: <assumption>"

${FMT}`,

  friction: (ctx, prev, existing) => `${ctx}
${prev ? `\nKey angles:\n${prev}` : ''}
${existingBlock(existing)}
Stage: Friction Map
Identify the most painful friction points in this topic. Be specific: WHO experiences it, WHEN, and what exactly breaks down. Focus on moments where time, money, or energy is wasted or where people give up. Generate 5 cards.

${FMT}`,

  contradiction: (ctx, prev, existing) => `${ctx}
${prev ? `\nFriction points:\n${prev}` : ''}
${existingBlock(existing)}
Stage: Contradiction Finder
Surface the core tensions in this space. Format: "X requires Y but also requires NOT-Y." These contradictions are where breakthroughs live — the places where conventional solutions fail because satisfying one requirement violates another. Generate 5 cards.

${FMT}`,

  cross_field: (ctx, prev, existing) => `${ctx}
${prev ? `\nContradictions:\n${prev}` : ''}
${existingBlock(existing)}
Stage: Cross-field Transfer
For each contradiction above, find a completely different field or domain that faced a structurally identical tension and solved it. The domain must be chosen based on structural fit to THIS specific contradiction — not picked from a generic list. Surprise yourself: the less obvious the domain, the more valuable the insight. Forbidden: do not default to the same domains repeatedly across cards. Describe exactly how that domain resolved the tension and map the mechanism back to the original problem. Generate 5 cards.
Title format: "<Domain>: <principle>"

${FMT}`,

  opportunity: (ctx, prev, existing) => `${ctx}
${prev ? `\nCross-field insights:\n${prev}` : ''}
${existingBlock(existing)}
Stage: Opportunity Tree
Synthesize the insights so far into concrete opportunity spaces. For each: name the beneficiary, the unmet need, and what makes it now possible. Not hypotheses yet — just directions worth exploring. Generate 5 cards.

${FMT}`,

  hypothesis: (ctx, prev, existing) => `${ctx}
${prev ? `\nOpportunity spaces:\n${prev}` : ''}
${existingBlock(existing)}
Stage: Hypothesis Generation
Turn the selected opportunities into testable business hypotheses. Format: "We believe [specific customer] will [specific action] because [insight], resulting in [business outcome]." Each must be falsifiable — you should be able to imagine an experiment that proves it wrong. Generate 5 cards.

${FMT_METRICS}`,

  critic: (ctx, prev, existing) => `${ctx}
${prev ? `\nHypotheses to critique:\n${prev}` : ''}
${existingBlock(existing)}
Stage: Critic Pass
For each hypothesis above, be its harshest critic. What are the 3 most likely failure modes? What assumptions must hold true? Is there prior art that tried this and failed? Be ruthlessly honest — a weak critique is useless. Generate one critique card per hypothesis.
Title format: "Critique: <hypothesis name>"
For metrics: novelty = how non-obvious this failure mode is, strength = how fatal this failure would be, feasibility = likelihood this failure actually occurs, testability = how fast you can detect this risk early.

${FMT_METRICS}`,

  shortlist: (ctx, prev, existing) => `${ctx}
${prev ? `\nHypotheses + critiques:\n${prev}` : ''}
${existingBlock(existing)}
Stage: Shortlist
${existing
  ? 'The top hypotheses are already shortlisted (shown above as already generated — do not repeat them). Now surface the NEXT TIER — hypotheses that almost made the cut but have a significant weakness. For each: explain what holds it back and under what conditions it would become stronger. These are the "dark horse" candidates. Continue numbering after the last already-generated rank.'
  : 'From the hypotheses and critiques above, select the 3-5 that best survived scrutiny. For each: explain why it made the cut — what makes it defensible, differentiated, and actionable right now. Rank them #1 being strongest.'}
Title format: "#<rank>: <hypothesis name>"

${FMT_METRICS}`,

  validation: (ctx, prev, existing) => `${ctx}
${prev ? `\nShortlisted hypotheses:\n${prev}` : ''}
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
