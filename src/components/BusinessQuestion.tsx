// Once for a data folder from before 0.5: the program was set up as a car
// service; ask whether that is right. Nothing changes until the owner says.
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { CAR } from "../lib/business";
import { ChangeBusinessDialog, useShopReload } from "./Business";
import { Icon, useToast } from "./ui";
import { useUpdateNotesPending } from "./updates";

const LATER_KEY = "garazh.businessLater";
const WEEK = 7 * 24 * 3600 * 1000;

function laterUntil(): number {
  try {
    return Number(localStorage.getItem(LATER_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function BusinessQuestion() {
  const toast = useToast();
  const reload = useShopReload();
  const notesPending = useUpdateNotesPending();
  const [ask, setAsk] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .getShop()
      .then((s) => alive && setAsk(!s.data.businessType && laterUntil() < Date.now()))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  // After "what's new" is read, so two notices never stack.
  if (!ask || notesPending) return null;

  async function keepCar() {
    setBusy(true);
    try {
      // Only the business type, on top of the file as it is now.
      const s = await api.getShop();
      await api.saveShop({ data: { ...s.data, businessType: CAR }, notes: s.notes, baseHash: s.hash });
      await reload();
      setAsk(false);
      toast("Записано: автосервиз. Може да се смени от Настройки.");
    } catch (e) {
      toast(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }

  function later() {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now() + WEEK));
    } catch {
      /* asks again next time */
    }
    setAsk(false);
  }

  return (
    <section className="card biz-ask" aria-labelledby="biz-ask-title">
      <div className="biz-ask-icon"><Icon name="settings" size={22} /></div>
      <div className="grow stack-12">
        <div>
          <h2 id="biz-ask-title">Гараж вече може да се настрои за вашата дейност</h2>
          <p>
            Досега програмата беше подредена за автосервиз. Ако основно боядисвате, сменяте гуми или правите детайлинг, изберете
            дейността – ще видите какво се променя, преди да го приемете. Работните карти, клиентите и колите остават същите.
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={keepCar} disabled={busy}>Автосервиз сме – оставете така</button>
          <button type="button" className="btn dark" onClick={() => setOpen(true)} disabled={busy}>Друга дейност…</button>
          <button type="button" className="link-btn" onClick={later} disabled={busy}>По-късно</button>
        </div>
      </div>
      <button type="button" className="btn icon-btn ghost" aria-label="По-късно" title="По-късно" onClick={later}>×</button>
      {open && <ChangeBusinessDialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); setAsk(false); }} />}
    </section>
  );
}
