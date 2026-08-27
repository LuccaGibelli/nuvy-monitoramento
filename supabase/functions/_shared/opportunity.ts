export const MINIMUM_VALUE = 300_000;

const STRONG_LEGAL_TERMS = [
  "sociedade de advogados",
  "sociedades de advogados",
  "escritorio de advocacia",
  "escritorios de advocacia",
  "servicos advocaticios",
  "servico advocaticio",
  "servicos juridicos",
  "servico juridico",
  "assessoria juridica",
  "consultoria juridica",
  "representacao judicial",
  "representacao extrajudicial",
  "patrocinio de causas",
  "contencioso judicial",
  "contencioso administrativo",
  "parecer juridico",
  "procuradoria juridica",
  "advocacia especializada",
];

const BROAD_LEGAL_TERMS = [
  "advocacia",
  "advogado",
  "juridico",
  "juridica",
  "contencioso",
  "tributario",
  "tributaria",
  "administrativo",
  "administrativa",
  "trabalhista",
  "previdenciario",
  "previdenciaria",
  "recuperacao de credito",
  "recuperacao de creditos",
  "parecer",
  "assessoria legal",
  "consultoria legal",
  "representacao processual",
  "processos judiciais",
  "processo judicial",
];

export function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function legalMatch(text: string) {
  const normalized = normalize(text);
  const strong = STRONG_LEGAL_TERMS.filter((term) => normalized.includes(term));
  const broad = BROAD_LEGAL_TERMS.filter((term) => normalized.includes(term));
  return {
    relevant: strong.length > 0 || broad.length >= 1,
    strong,
    broad,
  };
}

export function scoreOpportunity(text: string, value: number | null, deadline?: string | null) {
  const match = legalMatch(text);
  let score = Math.min(60, match.strong.length * 18 + match.broad.length * 7);

  if (value !== null) {
    if (value >= 2_000_000) score += 25;
    else if (value >= 1_000_000) score += 20;
    else if (value >= 500_000) score += 15;
    else if (value >= MINIMUM_VALUE) score += 10;
  } else {
    // Valor ausente nao elimina a oportunidade. Ela fica para validacao manual.
    score += 5;
  }

  if (deadline) {
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
    if (days >= 0 && days <= 7) score += 15;
    else if (days <= 20) score += 10;
    else if (days <= 45) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

export function shouldKeepOpportunity(text: string, value: number | null) {
  const match = legalMatch(text);
  if (!match.relevant) return false;
  // Mantemos valor desconhecido para nao perder editais cujo valor esta apenas no anexo.
  return value === null || value >= MINIMUM_VALUE;
}

export function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
