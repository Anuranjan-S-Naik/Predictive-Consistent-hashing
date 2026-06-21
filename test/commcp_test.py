"""
commCP Full Metrics Test
=========================
Prints ALL commCP metrics for classifier_v1.joblib:
  - Automation Rate
  - Empirical Conformal Coverage
  - CommCP Wrapped System Accuracy
  - Route breakdown + LLM call diagnosis
  - Confidence distribution vs conformal cutoff

Run:
  cd test
  python commcp_test.py
"""

import os, sys, time, warnings
import numpy as np
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")

ROOT            = Path(__file__).resolve().parent.parent
MODEL_DIR       = ROOT / "models"
CLASSIFIER_PATH = MODEL_DIR / "classifier_v1.joblib"
sys.path.insert(0, str(ROOT))

load_dotenv(Path(__file__).parent / ".env")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# ── Data generator (same distribution as train_classifier.py) ─────────────────
def make_data(n=3000, seed=77):
    rng     = np.random.RandomState(seed)
    payload = rng.beta(2, 5, n)
    cpu_b   = rng.choice([0.1,0.2,0.3,0.4,0.7,0.9], n, p=[0.15,0.20,0.15,0.20,0.15,0.15])
    cpu_est = np.clip(cpu_b + rng.normal(0,.05,n) + payload*0.3, 0, 1)
    ep      = rng.choice([0.0,0.25,0.5,0.75,1.0], n, p=[0.25,0.20,0.15,0.25,0.15])
    r5s     = rng.beta(2,8,n)
    lat     = rng.beta(2,5,n)*0.6 + cpu_est*0.3
    q       = rng.beta(2,6,n)
    hr      = rng.uniform(0,1,n)
    burst   = (rng.random(n)<0.12).astype(float)
    r5s     = np.where(burst>0.5, np.clip(r5s+0.4,0,1), r5s)
    X       = np.column_stack([payload,cpu_est,ep,r5s,lat,q,hr,burst])
    ms      = np.clip(50+payload*800+cpu_est*400+ep*300+q*100+burst*200+rng.normal(0,30,n),10,2000)
    y3      = np.where(ms<100,0,np.where(ms<=500,1,2))
    y_bin   = (y3==2).astype(int)   # 1=Heavy, 0=NotHeavy
    return X, y_bin

# ── Binary wrapper around 3-class XGBoost ────────────────────────────────────
class HeavyWrapper:
    def __init__(self, pipe):
        self._p = pipe
        self.classes_ = np.array([0,1])
    def predict_proba(self, X):
        p3      = self._p.predict_proba(X)
        p_heavy = p3[:,2]
        return np.column_stack([1-p_heavy, p_heavy])
    def predict(self, X):
        return (self.predict_proba(X)[:,1] >= 0.5).astype(int)

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":

    print("=" * 65)
    print("  commCP — Full Metrics Report  (classifier_v1.joblib)")
    print("=" * 65)
    print(f"  Groq key : {'SET' if GROQ_API_KEY else 'MISSING'}")

    # ── Load model ─────────────────────────────────────────────────────────────
    import joblib
    pipe  = joblib.load(CLASSIFIER_PATH)
    model = HeavyWrapper(pipe)
    print(f"  Model    : {CLASSIFIER_PATH.name}  ({CLASSIFIER_PATH.stat().st_size/1024:.0f} KB)\n")

    # ── Data ───────────────────────────────────────────────────────────────────
    X_all, y_all = make_data(n=3000, seed=77)
    X_calib, y_calib = X_all[:600],  y_all[:600]
    X_test,  y_test  = X_all[600:],  y_all[600:]
    N = min(150, len(X_test))   # predict on 150 samples (caps LLM cost)

    print(f"  Calib    : {len(X_calib)} samples  (Heavy rate = {y_calib.mean():.1%})")
    print(f"  Test     : {N} samples used  (Heavy rate = {y_test[:N].mean():.1%})")

    # ── Raw accuracy (without commCP) ──────────────────────────────────────────
    raw_pred = model.predict(X_test[:N])
    raw_acc  = (raw_pred == y_test[:N]).mean()
    print(f"\n  Raw model accuracy (no commCP) : {raw_acc:.4f}  ({raw_acc:.2%})")

    # ── Confidence distribution preview ───────────────────────────────────────
    probas = model.predict_proba(X_test[:N])
    confs  = probas.max(axis=1)
    print(f"\n  Confidence distribution (test slice):")
    print(f"    min={confs.min():.3f}  p25={np.percentile(confs,25):.3f}"
          f"  median={np.median(confs):.3f}"
          f"  p75={np.percentile(confs,75):.3f}  max={confs.max():.3f}")
    print(f"    Samples with conf > 0.90 : {(confs>0.90).sum():3d} / {N}  ({(confs>0.90).mean():.1%})")
    print(f"    Samples with conf < 0.70 : {(confs<0.70).sum():3d} / {N}  ({(confs<0.70).mean():.1%})")

    # ── CommCP setup ──────────────────────────────────────────────────────────
    from commcp import CommCP

    ALPHA         = 0.05
    VERIFY_MARGIN = 0.20

    ccp = CommCP(
        estimator=model,
        task_description=(
            "Classify an incoming API request as Heavy (execution > 500 ms) or "
            "Not Heavy based on 8 normalised features: payload size, CPU estimate, "
            "endpoint type, recent request rate, latency EMA, queue depth, hour of day, "
            "and burst flag. Misclassifying a Heavy request causes SLA violations."
        ),
        class_labels={0: "Not Heavy (Light/Medium)", 1: "Heavy (>500 ms)"},
        llm_provider="groq",
        llm_api_key=GROQ_API_KEY,
        llm_model="llama-3.3-70b-versatile",
        alpha=ALPHA,
        verify_margin=VERIFY_MARGIN,
    )

    # ── Calibrate ──────────────────────────────────────────────────────────────
    print("\n  Calibrating ...")
    ccp.calibrate(X_calib, y_calib)
    cutoff    = ccp.conformal_cutoff_
    gray_low  = cutoff - VERIFY_MARGIN
    gray_high = cutoff

    print(f"\n  Conformal cutoff          : {cutoff:.4f}  ({cutoff:.2%})")
    print(f"  LLM gray-zone             : [{gray_low:.4f}, {gray_high:.4f})")
    print(f"  (verify_margin = {VERIFY_MARGIN:.2f})")

    # How many samples actually fall in the gray zone?
    in_gray = ((confs >= gray_low) & (confs < gray_high)).sum()
    print(f"\n  Samples in gray-zone      : {in_gray} / {N}  ({in_gray/N:.1%})")
    print(f"  => LLM calls expected     : ~{in_gray}  (only gray-zone samples call the LLM)")

    if in_gray == 0:
        print("\n  WHY ZERO LLM CALLS?")
        print(f"    The XGBoost model is highly confident on almost every sample.")
        print(f"    {(confs >= cutoff).sum()} samples ({(confs>=cutoff).mean():.1%}) have conf >= cutoff -> ACCEPT (no LLM needed)")
        print(f"    {(confs < gray_low).sum()} samples ({(confs<gray_low).mean():.1%}) have conf < {gray_low:.3f} -> HUMAN_REVIEW (too uncertain)")
        print(f"    {in_gray} samples fall in gray-zone [{gray_low:.3f}, {cutoff:.3f}) -> LLM would be called here")

    # ── Run commCP predict ─────────────────────────────────────────────────────
    print(f"\n  Running ccp.predict() on {N} samples ...")
    t0      = time.time()
    results = ccp.predict(X_test[:N])
    elapsed = time.time() - t0
    print(f"  Done in {elapsed:.2f}s")

    # ── ROUTE BREAKDOWN ────────────────────────────────────────────────────────
    all_records = results.auto_decided + results.escalated
    route_counts = {}
    for r in all_records:
        route_counts[r["route"]] = route_counts.get(r["route"], 0) + 1

    print("\n" + "=" * 65)
    print("  ROUTE BREAKDOWN")
    print("=" * 65)
    for route in ["ACCEPT", "LLM_VERIFIED", "HUMAN_REVIEW"]:
        cnt = route_counts.get(route, 0)
        pct = cnt / N * 100
        bar = "#" * int(pct / 2)
        print(f"  {route:<16}  {bar:<25}  {cnt:3d}  ({pct:5.1f}%)")

    # ── AUTOMATION RATE ────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  AUTOMATION RATE")
    print("=" * 65)
    accept_n  = route_counts.get("ACCEPT", 0)
    llm_n     = route_counts.get("LLM_VERIFIED", 0)
    human_n   = route_counts.get("HUMAN_REVIEW", 0)
    auto_rate = results.automation_rate

    print(f"  ACCEPT cases              : {accept_n}")
    print(f"  LLM_VERIFIED cases        : {llm_n}")
    print(f"  HUMAN_REVIEW cases        : {human_n}")
    print(f"  Total samples             : {N}")
    print(f"\n  Automation Rate = (ACCEPT + LLM_VERIFIED) / Total")
    print(f"                  = ({accept_n} + {llm_n}) / {N}")
    print(f"                  = {auto_rate:.4f}  ({auto_rate:.2%})")

    # ── EMPIRICAL CONFORMAL COVERAGE ───────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  EMPIRICAL CONFORMAL COVERAGE")
    print("=" * 65)
    coverage = results.coverage(y_test[:N])
    target   = 1.0 - ALPHA
    met      = "YES - guarantee MET" if coverage >= target else "NO  - guarantee VIOLATED"
    print(f"  Empirical Coverage        : {coverage:.4f}  ({coverage:.2%})")
    print(f"  Target (1 - alpha=0.05)   : {target:.4f}  ({target:.2%})")
    print(f"  Guarantee satisfied?      : {met}")
    print(f"  (Coverage = accuracy of auto-decided predictions against true labels)")

    # ── COMMCP WRAPPED SYSTEM ACCURACY ─────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  commCP WRAPPED SYSTEM ACCURACY  (from results.stats)")
    print("=" * 65)
    stats = results.stats(y_test[:N])
    print(f"\n  Formula:")
    print(f"    = (Correct Automated + Total Human Escalated) / Total")
    print(f"    [assumes human oracle corrects ALL escalated cases]\n")
    for k, v in stats.items():
        if isinstance(v, float):
            print(f"  {k:<40} : {v:.4f}  ({v:.2%})" if v <= 1.0 else f"  {k:<40} : {v:.4f}")
        else:
            print(f"  {k:<40} : {v}")

    # ── FULL RECORDS SAMPLE ────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  SAMPLE RECORDS (first 5 auto-decided, first 5 escalated)")
    print("=" * 65)

    def show(records, label, n=5):
        print(f"\n  -- {label} --")
        if not records:
            print("  (none)")
            return
        for r in records[:n]:
            llm_tag = ""
            if r.get("llm_prediction") is not None:
                llm_tag = f"  | LLM={r['llm_prediction']}  reason: {str(r.get('llm_reasoning',''))[:50]}"
            print(f"  idx={r['sample_index']:4d} | pred={r['model_prediction']}"
                  f" | conf={r['confidence']:.3f} | route={r['route']:<14}"
                  f" | final={r.get('final_prediction','None')}{llm_tag}")

    show(results.auto_decided, "AUTO-DECIDED")
    show(results.escalated,    "ESCALATED (HUMAN_REVIEW)")

    # ── SUMMARY BOX ───────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  FINAL SUMMARY")
    print("=" * 65)
    print(f"  Raw model accuracy        : {raw_acc:.2%}")
    print(f"  Conformal cutoff          : {cutoff:.4f}")
    print(f"  Gray-zone                 : [{gray_low:.4f}, {cutoff:.4f})")
    print(f"  Samples in gray-zone      : {in_gray} / {N}")
    print(f"  LLM calls made            : {llm_n}")
    print(f"  Automation Rate           : {auto_rate:.2%}")
    print(f"  Empirical Coverage        : {coverage:.2%}  (target >= {target:.0%})")
    sys_acc_key = [k for k in stats if "system" in k.lower() or "wrapped" in k.lower()]
    if sys_acc_key:
        print(f"  commCP System Accuracy    : {stats[sys_acc_key[0]]:.2%}")
    print()
