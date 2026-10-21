export type SignalId = "volume-lead" | "accumulation" | "range-break" | "lowcap-heat";

export type PairRaw = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
};

export type ScoredCoin = {
  id: string;
  symbol: string;
  name: string;
  chain: string;
  dex: string;
  address: string;
  url: string;
  price: number;
  mcap: number;
  liq: number;
  vol24: number;
  vol1: number;
  vol6: number;
  chg5: number;
  chg1: number;
  chg6: number;
  chg24: number;
  buyPressure: number;
  tx1: number;
  volPerTx: number;
  social: number;
  signals: SignalId[];
  score: number;
  note: string;
};

const SIGNAL_LABEL: Record<SignalId, string> = {
  "volume-lead": "Volume lead",
  accumulation: "Accumulation",
  "range-break": "Range break",
  "lowcap-heat": "Low-cap heat",
};

export function signalLabel(id: SignalId) {
  return SIGNAL_LABEL[id];
}

export type ReviewTone = "wait" | "check" | "watch";

export function reviewCoin(c: ScoredCoin): {
  tone: ReviewTone;
  headline: string;
  entry: number | null;
  entryNote: string;
  points: string[];
} {
  const liqRatio = c.mcap > 0 ? c.liq / c.mcap : 0;
  const points: string[] = [];
  let flags = 0;
  let entry: number | null = null;
  let entryNote = "Tidak ada harga entry. Data tidak cukup untuk menarik level.";

  if (c.liq < 25_000 || liqRatio < 0.08) {
    flags += 2;
    points.push(
      `Pool tipis: likuiditas $${fmtCompact(c.liq)} (${(liqRatio * 100).toFixed(0)}% dari mcap). Order kecil saja, atau skip.`,
    );
  } else if (c.liq < 80_000) {
    flags += 1;
    points.push(`Likuiditas $${fmtCompact(c.liq)} cukup untuk cek chart, belum aman untuk size besar.`);
  } else {
    points.push(`Pool $${fmtCompact(c.liq)} relatif lebih dalam di band ini. Tetap pakai pool dengan likuiditas tertinggi.`);
  }

  const spiked = c.chg5 >= 15 || c.chg1 >= 20;
  if (spiked) {
    flags += 2;
    const spike = c.chg5 >= 15 ? c.chg5 : c.chg1;
    entry = c.price / (1 + spike / 100);
    const sameWindow =
      Math.abs(c.chg5 - c.chg1) < 1 && Math.abs(c.chg1 - c.chg6) < 1 && Math.abs(c.chg6 - c.chg24) < 1;
    entryNote = sameWindow
      ? "Perkiraan harga sebelum spike. Semua jendela waktu sama, jadi ini bukan support."
      : "Perkiraan harga sebelum candle spike. Bukan support yang sudah teruji.";
    points.push(
      sameWindow
        ? `5m, 1j, 6j, dan 24j sama-sama ${fmtPct(c.chg5)}. Tidak ada range terukur.`
        : `Sudah naik ${fmtPct(spike)} di candle terakhir. Jangan beli di harga sekarang.`,
    );
  } else if (c.signals.includes("range-break") && c.chg1 > 0 && c.chg1 <= 15) {
    entry = c.price / (1 + Math.max(c.chg5, 1) / 100);
    entryNote = "Zona tarikan ke dekat harga sejam yang lalu. Hanya relevan kalau candle belum vertikal.";
    points.push(`Baru lepas range (${fmtPct(c.chg1)} / 1j, 6j ${fmtPct(c.chg6)}). Masih layak dicek, asal belum vertikal.`);
  } else if (c.chg1 < 0 && c.chg24 < 15) {
    entry = c.price;
    entryNote = "Harga belum spike. Level ini harga sekarang, bukan rekomendasi beli.";
    points.push(`Harga belum meledak (${fmtPct(c.chg1)} / 1j, ${fmtPct(c.chg24)} / 24j). Lebih ke pantau daripada entry sekarang.`);
  } else {
    entry = c.price / (1 + Math.max(c.chg1, 0) / 200);
    entryNote = "Tengah jalan antara harga sekarang dan harga sejam yang lalu. Tetap konfirmasi di chart.";
    points.push(`Pergerakan ${fmtPct(c.chg1)} / 1j dan ${fmtPct(c.chg24)} / 24j. Konfirmasi di chart sebelum entry.`);
  }

  if (c.tx1 >= 40 && c.volPerTx < 100) {
    points.push(
      `${c.tx1} transaksi dalam 1 jam, rata-rata cuma $${fmtCompact(c.volPerTx)}. Bukan satu-dua wallet, tapi ordernya kecil. Jumlah wallet unik tidak kelihatan dari data ini.`,
    );
  } else if (c.tx1 < 15) {
    flags += 1;
    points.push(
      `Cuma ${c.tx1} transaksi dalam 1 jam. Aktivitas bisa terkumpul di sedikit wallet. Cek tab transaksi di DexScreener.`,
    );
  } else if (c.buyPressure >= 0.65 && c.volPerTx >= 200) {
    points.push(
      `Beli ${(c.buyPressure * 100).toFixed(0)}% dari ${c.tx1} tx, ~$${fmtCompact(c.volPerTx)}/tx. Tekanan beli ada, holder tetap harus dicek di DexScreener.`,
    );
  } else {
    points.push(
      `Buy pressure ${(c.buyPressure * 100).toFixed(0)}% dari ${c.tx1} tx. Tidak cukup untuk anggap smart money.`,
    );
  }

  if (c.chg24 >= 55 || c.chg6 >= 40) {
    flags += 1;
    entry = null;
    entryNote = "Sudah terlalu jauh dari setup awal. Tidak ada entry yang disarankan.";
    points.push(`Sudah bergerak kuat (${fmtPct(c.chg6)} / 6j, ${fmtPct(c.chg24)} / 24j). Skor bukan alasan masuk.`);
  } else {
    points.push(`Jendela 6–24 jam: ${fmtPct(c.chg6)} / ${fmtPct(c.chg24)}. Berita di luar data ini tetap tidak ketahuan.`);
  }

  const tone: ReviewTone = flags >= 3 ? "wait" : flags >= 1 ? "check" : "watch";
  const headline =
    tone === "wait"
      ? "Jangan entry di harga sekarang."
      : tone === "check"
        ? "Cek chart dulu. Skor bukan entry."
        : "Layak dipantau, entry tetap manual.";
  return { tone, headline, entry, entryNote, points };
}

function n(v: number | undefined) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

const MAJORS = new Set([
  "SOL", "WSOL", "ETH", "WETH", "BTC", "WBTC", "BNB", "WBNB",
  "USDC", "USDT", "USD1", "DAI", "FDUSD", "BUSD", "USDE",
]);

export function scorePair(p: PairRaw, socialBoost: number): ScoredCoin | null {
  const symbol = (p.baseToken?.symbol || "").trim();
  const price = Number(p.priceUsd || 0);
  if (!price || !symbol || MAJORS.has(symbol.toUpperCase())) return null;

  const mcap = n(p.marketCap) || n(p.fdv);
  const liq = n(p.liquidity?.usd);
  const vol24 = n(p.volume?.h24);
  const vol1 = n(p.volume?.h1);
  const vol6 = n(p.volume?.h6);
  const chg5 = n(p.priceChange?.m5);
  const chg1 = n(p.priceChange?.h1);
  const chg6 = n(p.priceChange?.h6);
  const chg24 = n(p.priceChange?.h24);

  if (mcap < 15_000 || mcap > 40_000_000) return null;
  if (liq < 6_000 || liq > 8_000_000) return null;
  if (vol24 < 20_000) return null;
  if (chg24 > 120 || chg1 > 45 || chg1 < -15) return null;

  const moved = [chg5, chg1, chg6, chg24].some((v) => Math.abs(v) >= 0.2);
  const buys1 = n(p.txns?.h1?.buys);
  const sells1 = n(p.txns?.h1?.sells);
  const tx1 = buys1 + sells1;
  const tx24 = n(p.txns?.h24?.buys) + n(p.txns?.h24?.sells);
  if (!moved || tx24 < 30) return null;

  const buyPressure = tx1 > 0 ? buys1 / tx1 : 0;
  const volPerTx = tx1 > 0 ? vol1 / tx1 : 0;
  const hourlyPace = vol6 > 0 ? vol6 / 6 : 0;
  const volLeadRatio = hourlyPace > 0 ? vol1 / hourlyPace : 0;
  const priceStillEarly = chg24 >= -15 && chg24 < 40 && chg1 > -10 && chg1 < 20;

  const volumeLead =
    vol6 >= 4_000 &&
    vol1 >= 2_000 &&
    volLeadRatio >= 1.35 &&
    priceStillEarly;

  const accumulation =
    tx1 >= 8 &&
    buyPressure >= 0.57 &&
    volPerTx >= 80 &&
    chg1 < 18 &&
    chg24 < 50 &&
    vol1 >= 1_500;

  const wasQuiet = chg6 > -8 && chg6 < 12;
  const rangeBreak =
    wasQuiet &&
    chg1 >= 2 &&
    chg1 <= 25 &&
    volLeadRatio >= 1.2 &&
    vol1 >= 2_500;

  const turnover = vol24 / mcap;
  const lowcapHeat =
    mcap <= 12_000_000 &&
    turnover >= 0.2 &&
    chg1 > -8 &&
    chg24 < 55 &&
    chg24 > -20 &&
    (socialBoost > 0 || volLeadRatio >= 1.2);

  const signals: SignalId[] = [];
  if (volumeLead) signals.push("volume-lead");
  if (accumulation) signals.push("accumulation");
  if (rangeBreak) signals.push("range-break");
  if (lowcapHeat) signals.push("lowcap-heat");
  if (signals.length === 0) return null;

  let score = 18;
  score += Math.min(26, Math.max(0, volLeadRatio - 1) * 14);
  score += Math.min(20, Math.max(0, buyPressure - 0.5) * 80);
  if (rangeBreak) score += 12;
  if (lowcapHeat) score += 10 + Math.min(8, socialBoost);
  if (priceStillEarly) score += 6;
  if (chg24 < 8 && chg1 > 1) score += 6;
  if (chg1 < -8) score -= 18;
  if (chg24 > 70) score -= 14;
  if (liq < 12_000) score -= 4;
  score = Math.max(1, Math.min(99, Math.round(score)));

  const notes: string[] = [];
  if (volumeLead) notes.push(`vol 1j ${volLeadRatio.toFixed(1)}× pace 6j, harga 24j ${fmtPct(chg24)}`);
  if (accumulation) notes.push(`beli ${(buyPressure * 100).toFixed(0)}% · $${Math.round(volPerTx)}/tx`);
  if (rangeBreak) notes.push(`keluar range, ${fmtPct(chg1)} / 1j`);
  if (lowcapHeat) notes.push(`mcap $${fmtCompact(mcap)} · turnover ${(turnover * 100).toFixed(0)}%`);

  return {
    id: `${p.chainId}:${p.baseToken.address}`,
    symbol,
    name: p.baseToken.name,
    chain: p.chainId,
    dex: p.dexId,
    address: p.baseToken.address,
    url: p.url,
    price,
    mcap,
    liq,
    vol24,
    vol1,
    vol6,
    chg5,
    chg1,
    chg6,
    chg24,
    buyPressure,
    tx1,
    volPerTx,
    social: socialBoost,
    signals,
    score,
    note: notes.join(" · "),
  };
}

export function fmtUsd(v: number) {
  if (!Number.isFinite(v) || v === 0) return "—";
  if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(3)}`;
}

export function fmtCompact(v: number) {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

export function fmtPct(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
