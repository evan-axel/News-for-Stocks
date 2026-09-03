/**
 * Checklist library.
 *
 * Sections are drawn from published value-investing frameworks. The point of a
 * checklist here is Gawande's point in The Checklist Manifesto, which is what
 * Pabrai and Spier adapted for investing: it is not a scoring model, it is a
 * defence against the specific, boring, repeated ways experienced people lose
 * money. A "no" on a critical item is not a veto — it is a thing you must have
 * consciously decided to accept, in writing, before you buy.
 *
 * Items are phrased so that "yes" is the reassuring answer and "no" is the flag.
 */

export const SECTIONS = {
  // ---------------------------------------------------------------- premortem
  premortem: {
    id: 'premortem',
    name: 'Pre-Mortem & Risk',
    source: 'Pabrai / Spier post-mortem checklists, Munger inversion',
    blurb:
      'Run on every idea regardless of style. These are the failure modes that recur across post-mortems of losing positions.',
    items: [
      {
        id: 'pm_competence',
        text: 'Can I explain how this business makes money, in two minutes, without notes?',
        hint: 'Circle of competence. If the explanation needs a diagram of the cap table, you are speculating on a structure, not owning a business.',
        critical: true,
      },
      {
        id: 'pm_survives_drought',
        text: 'Can it survive two years of flat revenue with credit markets closed to it?',
        hint: 'Check the maturity wall inside 24 months, revolver covenants, and whether refinancing is assumed in your model.',
        critical: true,
      },
      {
        id: 'pm_leverage',
        text: 'Is leverage modest for this business type (and is it real leverage, including leases and pensions)?',
        hint: 'Net debt/EBITDA, plus off-balance-sheet: operating leases, underfunded pension, litigation reserves, purchase obligations.',
        critical: true,
      },
      {
        id: 'pm_dilution',
        text: 'Is my share of the company safe from dilution?',
        hint: 'ATM programmes, convertibles, outstanding warrants, heavy SBC. Common in microcaps: the thesis is right and the share count doubles.',
        critical: true,
      },
      {
        id: 'pm_customer_conc',
        text: 'Is the business free of dangerous customer concentration (no customer >20% of revenue)?',
        hint: 'Read the 10-K concentration note, not the deck.',
      },
      {
        id: 'pm_supplier_conc',
        text: 'Are suppliers/inputs replaceable at comparable cost?',
        hint: 'Single-source components, one contract manufacturer, one commodity input with no hedge.',
      },
      {
        id: 'pm_keyman',
        text: 'Does the business survive the loss of its single most important person?',
        hint: 'Founder-dependent microcaps: what exactly happens if they leave?',
      },
      {
        id: 'pm_incentives',
        text: 'Is management compensated on per-share value rather than size, revenue or adjusted metrics?',
        hint: 'Read the proxy. Comp on revenue or "adjusted EBITDA" buys empire-building and acquisitions on your dime.',
        critical: true,
      },
      {
        id: 'pm_candour',
        text: 'Has management discussed its own past mistakes plainly in letters or on calls?',
        hint: 'Go back three years of shareholder letters. Nobody who never admits error is telling you the truth about the current year.',
      },
      {
        id: 'pm_related_party',
        text: 'Is the business free of meaningful related-party transactions?',
        hint: 'Proxy related-party note. Leases from the CEO, consulting to a director, purchases from a family entity.',
      },
      {
        id: 'pm_accruals',
        text: 'Does cash flow track earnings over the last three years?',
        hint: 'Widening accruals — receivables and inventory growing faster than sales — is the most reliable single accounting flag.',
        critical: true,
      },
      {
        id: 'pm_auditor',
        text: 'Is the audit clean (no going-concern language, restatements, or recent auditor change)?',
        hint: 'A small-cap changing from a national to an unknown auditor is worth an hour of your time.',
      },
      {
        id: 'pm_obsolescence',
        text: 'Is the business safe from technological or regulatory obsolescence over my holding period?',
        hint: 'Ask what this looks like in ten years, not next quarter. Melting ice cubes are cheap for a reason.',
      },
      {
        id: 'pm_origin',
        text: 'Did I find this idea myself, rather than anchoring on someone else\'s write-up?',
        hint: 'If it came from a pitch, state what you verified independently. Borrowed conviction disappears exactly when you need it.',
      },
      {
        id: 'pm_base_rate',
        text: 'Do I know the base rate for this kind of situation, and am I inside it?',
        hint: 'Mauboussin: the outside view. What normally happens to turnarounds / serial acquirers / post-bankruptcy equities?',
        critical: true,
      },
      {
        id: 'pm_liquidity',
        text: 'Can I exit the intended position within three days of average volume?',
        hint: 'Microcap-specific. Position size that cannot be sold is a permanent decision disguised as a trade.',
      },
    ],
  },

  // ------------------------------------------------------------------ quality
  quality: {
    id: 'quality',
    name: 'Business Quality & Moat',
    source: 'Buffett owner-earnings, Fisher 15 Points, Greenwald franchise analysis',
    blurb: 'For compounders: is this a franchise, and can it reinvest at the returns that make it one?',
    items: [
      {
        id: 'q_moat_named',
        text: 'Can I name the specific source of competitive advantage?',
        hint: 'Pick one and defend it: scale economies, network effects, switching costs, brand/habit, regulatory licence, or low-cost process. "Good management" and "great products" are not moats.',
        critical: true,
      },
      {
        id: 'q_moat_widening',
        text: 'Is the moat widening rather than eroding?',
        hint: 'Market share trend, gross margin trend, customer retention. A moat is a direction, not a state.',
      },
      {
        id: 'q_roic',
        text: 'Has ROIC exceeded cost of capital consistently through a full cycle?',
        hint: 'Use invested capital excluding goodwill for operating quality, including it to judge acquisitions.',
        critical: true,
      },
      {
        id: 'q_reinvest',
        text: 'Is there runway to reinvest a meaningful share of earnings at that ROIC?',
        hint: 'A high-ROIC business with nowhere to deploy is a dividend, not a compounder. Size of opportunity vs. current revenue.',
        critical: true,
      },
      {
        id: 'q_pricing_power',
        text: 'Has it raised prices ahead of inflation without losing volume?',
        hint: 'The cleanest empirical test of a moat. Find an actual instance in the last five years.',
      },
      {
        id: 'q_margin_stability',
        text: 'Are gross margins stable or improving across the cycle?',
        hint: 'Volatile gross margin usually means price-taking, i.e. commodity economics.',
      },
      {
        id: 'q_fcf_conversion',
        text: 'Does the business convert earnings into free cash flow (not into working capital and capex)?',
        hint: 'FCF / net income over 5 years. Chronic sub-70% conversion needs an explanation.',
      },
      {
        id: 'q_capital_allocation',
        text: 'Is the capital allocation record good — buybacks below value, acquisitions that earned their cost?',
        hint: 'Check whether buybacks happened at peak valuations and whether acquired goodwill was later written down.',
        critical: true,
      },
      {
        id: 'q_insider_ownership',
        text: 'Do insiders own a meaningful stake bought with their own money?',
        hint: 'Distinguish granted shares from open-market purchases. Fisher\'s point about management depth applies here too.',
      },
      {
        id: 'q_runway',
        text: 'Do products/services have years of growth runway ahead (Fisher\'s first point)?',
        hint: 'And is there a second act after the current product matures?',
      },
      {
        id: 'q_missed',
        text: 'Would customers genuinely struggle to replace it if it disappeared tomorrow?',
        hint: 'The scuttlebutt test. Ask a customer, a competitor, and an ex-employee.',
      },
    ],
  },

  // ---------------------------------------------------------------- deepvalue
  deepvalue: {
    id: 'deepvalue',
    name: 'Statistical Cheapness & Balance Sheet',
    source: 'Graham (Security Analysis / The Intelligent Investor), net-net and defensive criteria',
    blurb:
      'For cheapness-driven ideas: is the asset value real, and is the cheapness compensation for risk or an actual mispricing?',
    items: [
      {
        id: 'dv_valuation_gap',
        text: 'Is there a large, quantified gap between price and a conservative value estimate?',
        hint: 'State the number in the thesis: NCAV, EPV, SOTP, or a reverse-DCF. "It looks cheap" is not a valuation.',
        critical: true,
      },
      {
        id: 'dv_book_real',
        text: 'Is book value actually realisable?',
        hint: 'Haircut receivables, inventory (especially fashion/tech), and any goodwill. Real estate held at historic cost cuts the other way — in your favour.',
        critical: true,
      },
      {
        id: 'dv_current_ratio',
        text: 'Is the balance sheet defensively strong (Graham: current ratio > 2, LT debt < working capital)?',
        hint: 'Graham\'s defensive criteria. Relax them consciously, not by accident.',
      },
      {
        id: 'dv_earnings_stability',
        text: 'Has it been profitable in each of the last five years?',
        hint: 'Graham asked ten. Five is the modern compromise; below that you are buying an option, so size it like one.',
      },
      {
        id: 'dv_burn',
        text: 'Is it free of cash burn, or funded past the point where the thesis resolves?',
        hint: 'Months of runway at current burn. A cheap company that must raise equity at these prices is not cheap.',
        critical: true,
      },
      {
        id: 'dv_capital_return',
        text: 'Is capital being returned, or is there a credible reason it is not?',
        hint: 'Graham wanted an uninterrupted dividend record. The modern equivalent: buybacks, or a stated reinvestment case.',
      },
      {
        id: 'dv_not_a_trap',
        text: 'Do I have an explanation for the cheapness that is not "the market is wrong"?',
        hint: 'Name the forced seller, the neglect, or the structural constraint. If nobody is forced, ask who is on the other side and why.',
        critical: true,
      },
      {
        id: 'dv_offbalance',
        text: 'Have I checked off-balance-sheet and contingent liabilities?',
        hint: 'Pensions, environmental, litigation, guarantees, earn-outs. These are where net-nets go to die.',
      },
      {
        id: 'dv_decline',
        text: 'Is the underlying business stable rather than in secular decline?',
        hint: 'Cheap and shrinking means your margin of safety erodes while you wait.',
      },
    ],
  },

  // ------------------------------------------------------------------ special
  special: {
    id: 'special',
    name: 'Special Situation & Catalyst',
    source: 'Greenblatt (You Can Be a Stock Market Genius), merger-arb and activist practice',
    blurb:
      'For spin-offs, strategic reviews, mergers, recapitalisations and activist situations — the events this repo already scans for.',
    items: [
      {
        id: 'sp_catalyst_named',
        text: 'Is there a specific catalyst with an expected date?',
        hint: 'Write the event and the date in the thesis. "Eventually the market will notice" is not a catalyst.',
        critical: true,
      },
      {
        id: 'sp_forced_seller',
        text: 'Can I identify the forced or indifferent seller creating the mispricing?',
        hint: 'Greenblatt\'s core mechanism: index funds dumping a spin-off too small to hold, bondholders receiving equity, holders who cannot own sub-$5 stocks.',
        critical: true,
      },
      {
        id: 'sp_control',
        text: 'Is the catalyst within management\'s or an acquirer\'s control rather than dependent on a third party?',
        hint: 'Regulatory approval, financing conditions and a strategic buyer showing up are all outside anyone\'s control.',
      },
      {
        id: 'sp_downside_stub',
        text: 'Do I know what I own if the catalyst never happens — and am I content to hold it?',
        hint: 'This is the whole risk of event investing. Value the stub without the event.',
        critical: true,
      },
      {
        id: 'sp_time_decay',
        text: 'Does the thesis still work if it takes twice as long as expected?',
        hint: 'Compute IRR at 2x the expected timeline. Many spreads look fine on absolute return and terrible annualised.',
        critical: true,
      },
      {
        id: 'sp_insiders',
        text: 'Are insiders buying, or otherwise aligned with the outcome I expect?',
        hint: 'Form 4s around the announcement. In spin-offs, check where management\'s new options were struck.',
      },
      {
        id: 'sp_activist',
        text: 'If there is an activist (13D), do I know their stated plan and cost basis?',
        hint: 'Read the 13D exhibits, not the headline. Their exit price may be well below your target.',
      },
      {
        id: 'sp_deal_terms',
        text: 'For an announced deal: have I read the actual terms — spread, financing conditions, regulatory risk, break fee, walk rights?',
        hint: 'Merger agreement, not the press release. Note the outside date.',
      },
      {
        id: 'sp_reverse_split',
        text: 'If a reverse split is involved, is it clean-up rather than exchange-compliance desperation?',
        hint: 'Compliance-driven reverse splits in microcaps have a poor base rate and often precede dilution.',
      },
      {
        id: 'sp_structure_read',
        text: 'Have I read the primary document (Form 10, S-1, proxy, 8-K exhibits) rather than coverage of it?',
        hint: 'The edge in special situations is almost entirely that the document is boring and long and few people read it.',
        critical: true,
      },
    ],
  },

  // ------------------------------------------------------------- expectations
  expectations: {
    id: 'expectations',
    name: 'Expectations & Variant Perception',
    source: 'Mauboussin (Expectations Investing), Marks (second-level thinking)',
    blurb: 'What is priced in, and what specifically do you believe that the price does not?',
    items: [
      {
        id: 'ex_implied',
        text: 'Do I know what the current price implies for growth and margins?',
        hint: 'Reverse-DCF: solve for the assumptions that justify today\'s price, then judge whether they are too low or too high.',
        critical: true,
      },
      {
        id: 'ex_variant',
        text: 'Can I state my variant perception in one sentence?',
        hint: 'Second-level thinking: not "this is a good company" but "consensus expects X, and I think Y, because Z."',
        critical: true,
      },
      {
        id: 'ex_who_is_wrong',
        text: 'Do I know who is on the other side of this trade and why they are selling?',
        hint: 'If you cannot construct the bear case in its strongest form, you have not finished the work.',
      },
      {
        id: 'ex_narrative_risk',
        text: 'Am I confident the appeal is the numbers rather than the story?',
        hint: 'Exciting narratives are where the most money is lost. Notice if you are enjoying this.',
      },
      {
        id: 'ex_cycle',
        text: 'Do I know where we are in this industry\'s cycle, and am I not extrapolating a peak?',
        hint: 'Peak-margin earnings on a low multiple is the classic value trap setup.',
      },
    ],
  },

  // ------------------------------------------------------------------- sizing
  sizing: {
    id: 'sizing',
    name: 'Sizing & Portfolio Fit',
    source: 'Kelly-informed sizing, correlation discipline',
    blurb: 'Position-level decisions that only make sense in the context of the rest of the book.',
    items: [
      {
        id: 'sz_conviction',
        text: 'Is the size proportional to conviction and to how much I could lose here?',
        hint: 'Size to the downside case, not the target. Fractional Kelly if you want a formula.',
        critical: true,
      },
      {
        id: 'sz_add_lower',
        text: 'Would I willingly add at 30% lower, and do I have the cash reserved to do it?',
        hint: 'If the honest answer is no, the initial size is already too large.',
        critical: true,
      },
      {
        id: 'sz_correlation',
        text: 'Is this uncorrelated with what I already own?',
        hint: 'Same sector, same macro driver, same customer, same factor. Five microcap special situations are one bet on small-cap liquidity.',
      },
      {
        id: 'sz_max_loss',
        text: 'Have I written down the maximum loss I accept on this position?',
        hint: 'A number, in currency, before entry.',
      },
    ],
  },
};

export const TEMPLATES = {
  quality: {
    id: 'quality',
    name: 'Quality / Compounder',
    blurb: 'A durable franchise you intend to hold for years. Buffett/Fisher-style.',
    sections: ['premortem', 'quality', 'expectations', 'sizing'],
  },
  deepvalue: {
    id: 'deepvalue',
    name: 'Deep Value / Graham',
    blurb: 'Statistically cheap, asset- or earnings-backed. The question is whether it is a trap.',
    sections: ['premortem', 'deepvalue', 'expectations', 'sizing'],
  },
  special: {
    id: 'special',
    name: 'Special Situation / Catalyst',
    blurb: 'Spin-off, strategic review, merger, recap, activist. Event-driven with a date.',
    sections: ['premortem', 'special', 'expectations', 'sizing'],
  },
  full: {
    id: 'full',
    name: 'Full Work-Up',
    blurb: 'Every section. Slow on purpose — for a position that will be large.',
    sections: ['premortem', 'quality', 'deepvalue', 'special', 'expectations', 'sizing'],
  },
};

export function templateSections(templateId) {
  const template = TEMPLATES[templateId] || TEMPLATES.quality;
  return template.sections.map((id) => SECTIONS[id]).filter(Boolean);
}

export function allItemsFor(templateId) {
  return templateSections(templateId).flatMap((section) =>
    section.items.map((item) => ({ ...item, sectionId: section.id, sectionName: section.name }))
  );
}

/** Critical items answered "no" — the things you consciously accepted. */
export function redFlags(thesis) {
  return allItemsFor(thesis.templateId)
    .filter((item) => item.critical && thesis.checklist?.[item.id]?.answer === 'no')
    .map((item) => ({
      id: item.id,
      text: item.text,
      sectionName: item.sectionName,
      note: thesis.checklist[item.id]?.note || '',
    }));
}

export function checklistProgress(thesis) {
  const items = allItemsFor(thesis.templateId);
  const answered = items.filter((item) => {
    const answer = thesis.checklist?.[item.id]?.answer;
    return answer === 'yes' || answer === 'no' || answer === 'na';
  }).length;
  return { answered, total: items.length };
}
