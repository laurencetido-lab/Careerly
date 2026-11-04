/** Configurable interview preparation topics by industry. */
export const INTERVIEW_TOPICS: Record<string, { label: string; topics: string[] }> = {
  finance: {
    label: "Finance",
    topics: [
      "Accounting: three statements and how they link", "Valuation: DCF, multiples, precedent transactions", "M&A: accretion/dilution, synergies, process",
      "Transaction Services: quality of earnings, net debt, working capital", "Restructuring: liquidity, covenants, capital structure",
      "Real estate underwriting: NOI, cap rates, yield on cost, IRR/equity multiple", "LBO: sources & uses, debt paydown, returns", "Investment case: thesis, risks, mitigants",
      "Market awareness: recent deals and rates environment",
    ],
  },
  consulting: { label: "Consulting", topics: ["Case structuring", "Market sizing", "Profitability cases", "Mental maths", "Chart interpretation", "Synthesis and recommendation"] },
  tech: { label: "Technology", topics: ["Data structures & algorithms", "System design", "Language fundamentals", "Debugging & testing", "Past project deep-dive", "ML fundamentals (if relevant)"] },
  general: { label: "General", topics: ["Tell me about yourself", "Why this company", "Why this role", "Strengths and weaknesses", "Teamwork example (STAR)", "Leadership example (STAR)", "Questions to ask the interviewer"] },
};
