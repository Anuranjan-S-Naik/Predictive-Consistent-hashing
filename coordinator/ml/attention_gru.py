"""
Attention-GRU Traffic Forecaster (P3.3)
=========================================
Enhanced GRU with a temporal attention mechanism that learns to weight
different time steps in the input window, improving burst prediction
by attending to recent spikes rather than just the last hidden state.

Architecture:
  Input (batch, 60, 1)
    -> 2-layer GRU (hidden=64)
    -> Temporal Attention (learns weights over 60 time steps)
    -> FC layers -> predicted heavy count

The attention mechanism computes:
  attention_weights = softmax(W_a * tanh(W_h * hidden_states))
  context = sum(attention_weights * hidden_states)

This allows the model to "look back" at burst onset patterns
instead of relying solely on the final hidden state.

Usage:
    from coordinator.ml.attention_gru import AttentionGRUForecaster
    model = AttentionGRUForecaster(input_size=1, hidden_size=64, num_layers=2)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class TemporalAttention(nn.Module):
    """Additive (Bahdanau-style) temporal attention over GRU hidden states.

    Given a sequence of hidden states H = (h_1, ..., h_T) of shape (batch, T, hidden),
    computes:
        score_t = v^T * tanh(W_h * h_t)
        alpha_t = softmax(score_t)
        context = sum(alpha_t * h_t)

    Returns context vector and attention weights.
    """

    def __init__(self, hidden_size: int, attention_size: int = 32):
        super().__init__()
        self.W_h = nn.Linear(hidden_size, attention_size, bias=False)
        self.v = nn.Linear(attention_size, 1, bias=False)

    def forward(self, hidden_states: torch.Tensor):
        """
        Args:
            hidden_states: (batch, seq_len, hidden_size)

        Returns:
            context: (batch, hidden_size) — attention-weighted sum
            weights: (batch, seq_len) — attention distribution
        """
        # (batch, seq_len, attention_size)
        energy = torch.tanh(self.W_h(hidden_states))
        # (batch, seq_len, 1) -> (batch, seq_len)
        scores = self.v(energy).squeeze(-1)
        # Softmax over time dimension
        weights = F.softmax(scores, dim=-1)
        # Weighted sum: (batch, 1, seq_len) @ (batch, seq_len, hidden) -> (batch, hidden)
        context = torch.bmm(weights.unsqueeze(1), hidden_states).squeeze(1)
        return context, weights


class AttentionGRUForecaster(nn.Module):
    """2-layer GRU with temporal attention for traffic forecasting.

    Compared to the base GRUForecaster which only uses the last hidden state,
    this model attends to ALL time steps, allowing it to better detect and
    respond to burst patterns that may start mid-window.
    """

    def __init__(
        self,
        input_size: int = 1,
        hidden_size: int = 64,
        num_layers: int = 2,
        attention_size: int = 32,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers

        self.gru = nn.GRU(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )

        self.attention = TemporalAttention(hidden_size, attention_size)

        # Combine attention context with last hidden state
        self.fc = nn.Sequential(
            nn.Linear(hidden_size * 2, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor):
        """
        Args:
            x: (batch, seq_len, input_size) — time-series input

        Returns:
            prediction: (batch, 1) — predicted next value
        """
        # GRU over full sequence
        gru_out, _ = self.gru(x)  # (batch, seq_len, hidden)

        # Attention: weighted combination of all time steps
        context, self._attention_weights = self.attention(gru_out)

        # Last hidden state
        last_hidden = gru_out[:, -1, :]

        # Concatenate context + last hidden
        combined = torch.cat([context, last_hidden], dim=-1)

        return self.fc(combined)

    def get_attention_weights(self) -> torch.Tensor:
        """Return the last computed attention weights for interpretability.

        Returns:
            (batch, seq_len) tensor of attention weights summing to 1.
        """
        if hasattr(self, '_attention_weights'):
            return self._attention_weights
        return None
