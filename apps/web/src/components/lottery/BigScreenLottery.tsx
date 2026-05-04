'use client';

import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui';
import { LotteryPrize, useLottery } from '@/hooks/useLottery';

interface BigScreenLotteryProps {
  eventId: string;
  eventTitle: string;
  prizes: LotteryPrize[];
  onRefreshPrizes: () => Promise<void> | void;
}

export function BigScreenLottery({ eventId, eventTitle, prizes, onRefreshPrizes }: BigScreenLotteryProps) {
  const {
    isRunning,
    isStopping,
    currentDisplay,
    winner,
    selectedPrize,
    selectedPrizeId,
    setSelectedPrizeId,
    error,
    isConfirming,
    startDraw,
    stopDraw,
    confirmWinner,
    canStart,
  } = useLottery({ eventId, prizes });

  const winnerText = useMemo(() => {
    if (!winner) return currentDisplay;
    return winner.userName || winner.ticketCode || currentDisplay;
  }, [currentDisplay, winner]);

  useEffect(() => {
    const requestFullscreen = async () => {
      if (typeof document === 'undefined') return;
      if (document.fullscreenElement) return;
      try {
        await document.documentElement.requestFullscreen();
      } catch {
      }
    };
    void requestFullscreen();
  }, []);

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!isRunning && canStart && !winner) {
          startDraw();
          return;
        }
        if (isRunning) {
          await stopDraw();
        }
      }
      if (e.code === 'Enter') {
        e.preventDefault();
        if (!winner) return;
        const ok = await confirmWinner();
        if (ok) {
          await onRefreshPrizes();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canStart, confirmWinner, isRunning, onRefreshPrizes, startDraw, stopDraw, winner]);

  const selectedPrizeWinners = selectedPrize?.winners || [];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0B0B0B] text-white">
      <div className="h-full w-full grid grid-rows-[92px_1fr_84px]">
        <header className="flex items-center justify-between px-10 border-b border-white/10">
          <h1 className="text-3xl font-extrabold tracking-wide text-center flex-1">{eventTitle || 'Live Lottery Draw'}</h1>
          <div className="flex items-center gap-3">
            <select
              value={selectedPrizeId}
              onChange={(e) => setSelectedPrizeId(e.target.value)}
              className="h-10 min-w-[260px] rounded-lg bg-white/10 border border-white/20 px-3 text-sm text-white"
            >
              <option value="" className="bg-white text-black">Pilih prize</option>
              {prizes.map((p) => (
                <option key={p.id} value={p.prizeId} className="bg-white text-black">
                  {p.name} - sisa {p.remainingQuota}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
            >
              Enter Fullscreen
            </Button>
          </div>
        </header>

        <main className="grid grid-cols-12 gap-6 px-10 py-8">
          <section className="col-span-9 flex items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent">
            <div
              className={`text-center transition-all duration-300 ${winner ? 'scale-110 drop-shadow-[0_0_28px_rgba(250,204,21,.75)]' : ''}`}
            >
              <div
                className={`font-black tracking-widest leading-none ${
                  winnerText.length > 14 ? 'text-6xl' : 'text-8xl'
                } ${isRunning ? 'animate-pulse text-yellow-300' : 'text-white'}`}
              >
                {winnerText}
              </div>
              {winner && (
                <div className="mt-4 text-3xl text-yellow-400 font-bold">{winner.ticketCode}</div>
              )}
              {isStopping && <div className="mt-6 text-lg text-yellow-200">Stopping draw...</div>}
              {error && <div className="mt-6 text-lg text-red-400">{error}</div>}
            </div>
          </section>

          <aside className="col-span-3 rounded-2xl border border-yellow-500/30 bg-gradient-to-b from-yellow-400/10 to-transparent p-5">
            <div className="aspect-[4/5] rounded-xl overflow-hidden bg-black/40 border border-white/10">
              {selectedPrize?.imageUrl ? (
                <img src={selectedPrize.imageUrl} alt={selectedPrize.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-yellow-200 text-xl font-bold">PRIZE</div>
              )}
            </div>
            <div className="mt-4">
              <div className="text-yellow-300 text-xs uppercase tracking-[0.18em]">Prize</div>
              <div className="mt-1 text-2xl font-bold leading-tight">{selectedPrize?.name || '-'}</div>
              <div className="mt-3 text-sm text-white/80">Remaining Quota</div>
              <div className="text-4xl font-black text-yellow-300">{selectedPrize?.remainingQuota ?? 0}</div>
            </div>
            <div className="mt-6 flex gap-2">
              <Button onClick={startDraw} disabled={!canStart || isRunning || isStopping} className="flex-1">
                Start
              </Button>
              <Button onClick={stopDraw} disabled={!isRunning || isStopping} variant="outline" className="flex-1">
                Stop
              </Button>
            </div>
            <div className="mt-2">
              <Button onClick={async () => { const ok = await confirmWinner(); if (ok) await onRefreshPrizes(); }} disabled={!winner || isConfirming} className="w-full">
                {isConfirming ? 'Confirming...' : 'Confirm Winner'}
              </Button>
            </div>
            {selectedPrize && selectedPrize.remainingQuota === 0 && (
              <div className="mt-4 rounded-xl border border-white/15 bg-black/30 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-yellow-300">List Pemenang</div>
                {selectedPrizeWinners.length === 0 ? (
                  <div className="mt-2 text-sm text-white/70">Belum ada data pemenang di sesi ini.</div>
                ) : (
                  <div className="mt-2 max-h-48 overflow-auto rounded-md border border-white/10">
                    <table className="w-full text-xs">
                      <thead className="bg-white/10 text-white/80">
                        <tr>
                          <th className="px-2 py-2 text-left">Nama</th>
                          <th className="px-2 py-2 text-left">Kode Ticket</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPrizeWinners.map((item) => (
                          <tr key={`${item.ticketId}-${item.confirmedAt}`} className="border-t border-white/10">
                            <td className="px-2 py-2">{item.userName || '-'}</td>
                            <td className="px-2 py-2 font-semibold text-yellow-200">{item.ticketCode}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </aside>
        </main>

        <footer className="flex items-center justify-center border-t border-white/10 text-xl font-semibold tracking-wide text-yellow-300">
          Press SPACE to stop • Press ENTER to confirm winner
        </footer>
      </div>
    </div>
  );
}
