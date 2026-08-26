// Estatistica de apoio ao forest plot. Os dados servem beta e p (como -log10),
// sem erro-padrao. Para o teste Burden (Wald) o par (beta, p) determina o se de
// forma consistente: p = 2*(1 - Phi(|beta/se|)), entao se = |beta| / z, com
// z = |Phi^-1(p/2)|. Isso reconstroi o IC de 95% sem dados extras.

// Inversa da normal padrao (algoritmo de Acklam), precisa o bastante para IC.
export function invNorm(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const plow = 0.02425, phigh = 1 - plow
  let q, r
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p <= phigh) {
    q = p - 0.5; r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
}

// z bicaudal a partir do -log10(p); protege contra underflow (p muito pequeno).
export function zFromLp(lp) {
  if (!(lp > 0)) return 0
  // Para p abaixo do que o double representa, aproxima z pela cauda da normal:
  // -ln p = ln(10)*lp e z ~ sqrt(2*(-ln p)) quando p -> 0.
  if (lp > 300) return Math.sqrt(2 * Math.LN10 * lp)
  const p = Math.pow(10, -lp)
  return Math.abs(invNorm(p / 2))
}

// se do efeito Burden a partir de beta e -log10(p).
export function seFromBetaLp(beta, lp) {
  const z = zFromLp(lp)
  if (!(z > 0)) return Math.abs(beta) || 1
  return Math.abs(beta) / z
}

// Heterogeneidade entre estudos (ancestrias) pelo Q de Cochran e o I^2.
// I^2 = fracao da variancia entre estudos que vem de heterogeneidade real,
// nao do acaso: <25% baixa, 25-50 moderada, 50-75 substancial, >75 alta.
export function heterogeneity(studies) {
  const k = studies.length
  if (k < 2) return { Q: 0, df: 0, i2: 0, betaFE: studies[0]?.beta ?? 0 }
  let sw = 0, swb = 0
  for (const s of studies) { const w = 1 / (s.se * s.se); sw += w; swb += w * s.beta }
  const betaFE = swb / sw
  let Q = 0
  for (const s of studies) { const w = 1 / (s.se * s.se); Q += w * (s.beta - betaFE) ** 2 }
  const df = k - 1
  const i2 = Q > df ? ((Q - df) / Q) * 100 : 0
  return { Q, df, i2, betaFE }
}

// Faixa qualitativa do I^2, para a escala do que e bom ou ruim.
export function i2Tier(i2) {
  if (i2 < 25) return { key: 'good', label: 'Baixa' }
  if (i2 < 50) return { key: 'warning', label: 'Moderada' }
  if (i2 < 75) return { key: 'serious', label: 'Substancial' }
  return { key: 'critical', label: 'Alta' }
}
