"""
GRU Traffic Forecaster — Training Script (P5-T2)
===================================================
Generates synthetic heavy-request-count time-series with bursty patterns,
trains a 2-layer GRU (64 hidden units) to predict the next-10-second
heavy request count from a 60-point sliding window.

Run:  python -m coordinator.ml.train_forecaster
"""

import os
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

SEED = 42
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "forecaster_v1.pt")

WINDOW_SIZE = 60        # 60 data points (1 per second)
PREDICT_AHEAD = 10      # predict next 10 seconds aggregated
HIDDEN_SIZE = 64
NUM_LAYERS = 2
EPOCHS = 50
BATCH_SIZE = 64
LR = 0.001


class GRUForecaster(nn.Module):
    """2-layer GRU for time-series traffic forecasting."""

    def __init__(self, input_size=1, hidden_size=HIDDEN_SIZE, num_layers=NUM_LAYERS):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.gru = nn.GRU(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2 if num_layers > 1 else 0.0,
        )
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
        )

    def forward(self, x):
        """
        Args:
            x: (batch, seq_len, 1) — heavy request counts per second
        Returns:
            (batch, 1) — predicted count for next PREDICT_AHEAD seconds
        """
        out, _ = self.gru(x)
        # Take last time step's hidden state
        last = out[:, -1, :]
        return self.fc(last)


def generate_time_series(total_seconds: int = 36000, seed: int = SEED) -> np.ndarray:
    """Generate 10 hours of synthetic heavy-request-count-per-second data.

    Includes:
      - Base sinusoidal traffic (diurnal pattern)
      - Random Poisson bursts
      - Gaussian noise
    """
    rng = np.random.RandomState(seed)
    t = np.arange(total_seconds, dtype=np.float32)

    # Base: sinusoidal diurnal pattern (3-6 heavy requests/s average)
    base = 4.5 + 2.0 * np.sin(2 * np.pi * t / 3600)

    # Add random Poisson bursts (10-15 bursts, each 10-30s long, 3-8× spike)
    bursts = np.zeros(total_seconds)
    n_bursts = rng.randint(10, 16)
    for _ in range(n_bursts):
        start = rng.randint(100, total_seconds - 100)
        duration = rng.randint(10, 31)
        magnitude = rng.uniform(3, 8)
        end = min(start + duration, total_seconds)
        bursts[start:end] += magnitude

    # Gaussian noise
    noise = rng.normal(0, 0.8, total_seconds)

    series = np.clip(base + bursts + noise, 0, 30).astype(np.float32)
    return series


def create_windows(series: np.ndarray, window: int = WINDOW_SIZE, ahead: int = PREDICT_AHEAD):
    """Create sliding-window samples.

    Input:  series[i : i+window]      (60 points)
    Target: mean(series[i+window : i+window+ahead])  (avg of next 10)
    """
    X, y = [], []
    for i in range(len(series) - window - ahead):
        X.append(series[i:i + window])
        # Target: average heavy count over the next `ahead` seconds
        y.append(series[i + window:i + window + ahead].mean())

    X = np.array(X, dtype=np.float32).reshape(-1, window, 1)
    y = np.array(y, dtype=np.float32).reshape(-1, 1)
    return X, y


def train_and_save():
    """Train GRU forecaster and save to disk."""
    print("=" * 60)
    print("P5-T2: Training GRU Traffic Forecaster")
    print("=" * 60)

    torch.manual_seed(SEED)
    np.random.seed(SEED)

    # Generate synthetic time-series
    series = generate_time_series()
    print(f"Generated {len(series)} seconds of traffic data")
    print(f"  Range: [{series.min():.1f}, {series.max():.1f}] heavy reqs/s")

    # Normalize
    series_mean = series.mean()
    series_std = series.std()
    series_norm = (series - series_mean) / (series_std + 1e-8)

    # Create windows
    X, y = create_windows(series_norm)
    print(f"  Windows: {len(X)} samples (window={WINDOW_SIZE}, ahead={PREDICT_AHEAD})")

    # Split 80/20
    split = int(0.8 * len(X))
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    train_ds = TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y_train))
    val_ds = TensorDataset(torch.from_numpy(X_val), torch.from_numpy(y_val))
    train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_dl = DataLoader(val_ds, batch_size=BATCH_SIZE)

    # Build model
    model = GRUForecaster(input_size=1, hidden_size=HIDDEN_SIZE, num_layers=NUM_LAYERS)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    criterion = nn.MSELoss()
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

    print(f"\nModel parameters: {sum(p.numel() for p in model.parameters()):,}")
    print(f"Training for {EPOCHS} epochs...\n")

    best_val_loss = float("inf")
    best_state = None

    for epoch in range(1, EPOCHS + 1):
        # Train
        model.train()
        train_loss = 0
        for xb, yb in train_dl:
            pred = model(xb)
            loss = criterion(pred, yb)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item() * len(xb)
        train_loss /= len(train_ds)

        # Validate
        model.eval()
        val_loss = 0
        with torch.no_grad():
            for xb, yb in val_dl:
                pred = model(xb)
                val_loss += criterion(pred, yb).item() * len(xb)
        val_loss /= len(val_ds)

        scheduler.step(val_loss)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

        if epoch % 10 == 0 or epoch == 1:
            print(f"  Epoch {epoch:3d}: train_loss={train_loss:.6f}  val_loss={val_loss:.6f}")

    # Load best model
    model.load_state_dict(best_state)

    # Compute MAE on validation set (denormalized)
    model.eval()
    preds, actuals = [], []
    with torch.no_grad():
        for xb, yb in val_dl:
            pred = model(xb)
            preds.append(pred.numpy())
            actuals.append(yb.numpy())
    preds = np.concatenate(preds) * series_std + series_mean
    actuals = np.concatenate(actuals) * series_std + series_mean

    mae = np.abs(preds - actuals).mean()
    actual_mean = np.abs(actuals).mean()
    mae_pct = (mae / (actual_mean + 1e-8)) * 100

    print(f"\nValidation MAE: {mae:.3f} heavy reqs/s ({mae_pct:.1f}% of mean)")
    print(f"Validation MSE: {best_val_loss:.6f}")

    # Save model + metadata
    os.makedirs(MODEL_DIR, exist_ok=True)
    torch.save({
        "model_state_dict": model.state_dict(),
        "input_size": 1,
        "hidden_size": HIDDEN_SIZE,
        "num_layers": NUM_LAYERS,
        "window_size": WINDOW_SIZE,
        "predict_ahead": PREDICT_AHEAD,
        "series_mean": float(series_mean),
        "series_std": float(series_std),
    }, MODEL_PATH)

    model_size = os.path.getsize(MODEL_PATH) / 1024
    print(f"\nModel saved to: {MODEL_PATH} ({model_size:.1f} KB)")
    print("=" * 60)

    return mae_pct


if __name__ == "__main__":
    pct = train_and_save()
    if pct > 15:
        print(f"[WARN] MAE {pct:.1f}% exceeds 15% target!")
    else:
        print(f"[OK] MAE {pct:.1f}% within 15% target!")

