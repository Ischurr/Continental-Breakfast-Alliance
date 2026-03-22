import Header from '@/components/Header';
import draftRounds from '@/data/draft-rounds.json';

const ROUND_COLORS: Record<number, string> = {
  1:  '#f59e0b',
  2:  '#6366f1',
  3:  '#10b981',
  4:  '#ef4444',
  5:  '#8b5cf6',
  6:  '#f97316',
  7:  '#06b6d4',
  8:  '#ec4899',
  9:  '#84cc16',
  10: '#14b8a6',
};

function roundColor(round: number): string {
  return ROUND_COLORS[round] ?? '#6b7280';
}

export default function DraftAnalysisPage() {
  const rounds = draftRounds.rounds;
  const maxAvg = Math.max(...rounds.map(r => r.avgPoints));
  const years = draftRounds.years;
  const byYear = draftRounds.byYear as Record<string, { effectiveRound: number; avgPoints: number; picks: number }[]>;

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Draft Round Analysis</h1>
          <p className="text-sm text-gray-600">
            Average fantasy points per effective draft round · {years.join(', ')} · {draftRounds.rounds[0]?.totalPicks ?? 30} picks per round (10 teams × 3 years)
          </p>
          <p className="text-xs text-gray-400 mt-1">{draftRounds.note}</p>
        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5">Avg Points by Effective Round</h2>
          <div className="space-y-2">
            {rounds.map(r => {
              const barPct = (r.avgPoints / maxAvg) * 100;
              const color = roundColor(r.effectiveRound);
              return (
                <div key={r.effectiveRound} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {r.effectiveRound}
                  </div>
                  <div className="flex-1 relative h-7 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${barPct}%`, backgroundColor: color, opacity: 0.8 }}
                    />
                    <span className="absolute inset-y-0 left-3 flex items-center text-xs font-bold text-white z-10 drop-shadow">
                      {r.avgPoints} pts
                    </span>
                  </div>
                  <div className="w-24 text-right">
                    <span className="text-[10px] text-gray-400">{r.totalPicks} picks</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top performers per round */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5">Best Pick per Round</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rounds.map(r => {
              const best = r.top3[0];
              const color = roundColor(r.effectiveRound);
              const premium = best ? Math.round(best.points - r.avgPoints) : 0;
              return (
                <div key={r.effectiveRound} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <div
                    className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    R{r.effectiveRound}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{best?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{best?.year} · Rd {best?.espnRound}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-800">{Math.round(best?.points ?? 0)} pts</p>
                    {premium > 0 && (
                      <p className="text-[10px] text-teal-600 font-semibold">+{premium} vs avg</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Year-over-year comparison */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5">Year-over-Year Breakdown</h2>
          <div className="overflow-x-auto overflow-y-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Round</th>
                  {years.map(y => (
                    <th key={y} className="text-right py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{y}</th>
                  ))}
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">3yr Avg</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r, idx) => {
                  const color = roundColor(r.effectiveRound);
                  return (
                    <tr key={r.effectiveRound} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {r.effectiveRound}
                          </div>
                          <span className="text-xs text-gray-600">Rd {r.effectiveRound}</span>
                        </div>
                      </td>
                      {years.map(y => {
                        const entry = byYear[String(y)]?.find(e => e.effectiveRound === r.effectiveRound);
                        return (
                          <td key={y} className="text-right py-2 px-3 tabular-nums text-gray-700">
                            {entry ? entry.avgPoints : '—'}
                          </td>
                        );
                      })}
                      <td className="text-right py-2 px-3 tabular-nums font-semibold text-gray-900">{r.avgPoints}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top 3 per round detail */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-5">Top 3 Picks per Round</h2>
          <div className="space-y-4">
            {rounds.map(r => {
              const color = roundColor(r.effectiveRound);
              return (
                <div key={r.effectiveRound}>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {r.effectiveRound}
                    </div>
                    <span className="text-xs font-semibold text-gray-600">Round {r.effectiveRound}</span>
                    <span className="text-xs text-gray-400">· avg {r.avgPoints} pts</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pl-9">
                    {r.top3.map((p, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.year} · Rd {p.espnRound}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold" style={{ color }}>{Math.round(p.points)}</p>
                          <p className="text-[10px] text-gray-400">pts</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
