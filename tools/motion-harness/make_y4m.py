"""Synthetic webcam feed for the Exorcise motion-detection harness.

sweep: a hand-sized blob sweeps left<->right through the vertical centre band
       (crosses the enemies' path toward the screen centre).
wave:  a hand-sized blob hovers over the 1 PLAYER motion button (raised-hand zone, screen left = raw right) and wiggles.
Background has static texture + per-frame sensor noise (sigma 2) so the
auto-calibration sees realistic noise. Hand luminance 170 vs bg 128 (diff 42):
detectable at the calibrated threshold (15-30) but not at the 60 clamp.
"""
import sys, numpy as np
mode, out = sys.argv[1], sys.argv[2]
W, H, FPS = 320, 180, 30
SECS = 40 if mode == 'sweep' else 25
rng = np.random.default_rng(1)
tex = rng.normal(0, 6, (H, W)).astype(np.int16)
HW, HH = 55, 70
hand_tex = rng.normal(0, 22, (HH, HW)).astype(np.int16)  # skin texture moves with the hand
U = np.full((H // 2, W // 2), 128, np.uint8).tobytes()
V = np.full((H // 2, W // 2), 120, np.uint8).tobytes()
with open(out, 'wb') as f:
    f.write(f"YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n".encode())
    for i in range(FPS * SECS):
        t = i / FPS
        y = 128 + tex + rng.normal(0, 2, (H, W)).astype(np.int16)
        if t >= 4.0:
            if mode == 'sweep':
                period = 1.5
                ph = ((t - 4.0) % period) / period
                frac = ph * 2 if ph < 0.5 else 2 - ph * 2
                cx, cy = int(-HW + frac * (W + 2 * HW)), H // 2
            else:  # wave side-to-side over the 1 PLAYER button, ~2 Hz. Display (12 %, 17 %) is mirrored: raw x = 88 %
                cx = int(0.88 * W + 8 * np.sin(2 * np.pi * 2 * t))
                cy = int(0.17 * H + 4 * np.sin(2 * np.pi * 1 * t))
            x0, x1 = max(0, cx - HW // 2), min(W, cx + HW // 2)
            y0, y1 = max(0, cy - HH // 2), min(H, cy + HH // 2)
            if x1 > x0 and y1 > y0:
                # texture slice aligned to the hand's own coordinates
                tx0, ty0 = x0 - (cx - HW // 2), y0 - (cy - HH // 2)
                patch = hand_tex[ty0:ty0 + (y1 - y0), tx0:tx0 + (x1 - x0)]
                y[y0:y1, x0:x1] = 170 + patch + rng.normal(0, 4, (y1 - y0, x1 - x0)).astype(np.int16)
        f.write(b"FRAME\n")
        f.write(np.clip(y, 0, 255).astype(np.uint8).tobytes())
        f.write(U); f.write(V)
print(mode, out, FPS * SECS, 'frames')
