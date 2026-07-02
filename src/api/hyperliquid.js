import { HL_API_URL, START_TIME, PAGINATION_DELAY } from "../constants.js";

async function apiPost(body) {
  const res = await fetch(HL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchAllFills(wallet, startTime = START_TIME, onProgress) {
  let allFills = [];
  let cursor = startTime;
  let page = 0;
  while (true) {
    page++;
    if (onProgress) onProgress(`Fetching fills page ${page}...`);
    const fills = await apiPost({
      type: "userFillsByTime",
      user: wallet,
      startTime: cursor,
      aggregateByTime: true,
    });
    allFills = allFills.concat(fills);
    if (fills.length < 2000) break;
    cursor = fills[fills.length - 1].time + 1;
    await new Promise(r => setTimeout(r, PAGINATION_DELAY));
  }
  return allFills;
}

export async function fetchClearinghouseState(wallet) {
  const [main, xyz] = await Promise.all([
    apiPost({ type: "clearinghouseState", user: wallet }),
    apiPost({ type: "clearinghouseState", user: wallet, dex: "xyz" }).catch(() => null),
  ]);
  return { main, xyz };
}

// HL keeps separate collateral per dex; funds can sit entirely on the builder
// dex (e.g. trade.xyz) while `main` reads 0. Sum both for account totals.
export function hlAccountTotals(chState) {
  let accountValue = 0;
  let marginUsed = 0;
  for (const s of [chState?.main, chState?.xyz]) {
    accountValue += parseFloat(s?.marginSummary?.accountValue || "0");
    marginUsed += parseFloat(s?.marginSummary?.totalMarginUsed || "0");
  }
  return { accountValue, marginUsed };
}

export async function fetchFunding(wallet) {
  return apiPost({ type: "userFunding", user: wallet, startTime: START_TIME });
}

export async function fetchAllMids() {
  return apiPost({ type: "allMids" });
}
