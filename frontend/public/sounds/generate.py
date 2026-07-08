"""
Genera los sonidos cortos de la UI (success, beep, error, notify) como WAV.
Ejecutar una sola vez: python generate.py
No requiere dependencias externas (solo el modulo wave de la stdlib).
"""
import math
import struct
import wave

RATE = 44100


def note(freq, duration, vol=0.35, fade=0.012, shape='sine'):
    n = int(RATE * duration)
    fade_n = max(1, int(RATE * fade))
    samples = []
    for i in range(n):
        t = i / RATE
        if shape == 'sine':
            v = math.sin(2 * math.pi * freq * t)
        elif shape == 'triangle':
            phase = (freq * t) % 1.0
            v = 4 * abs(phase - 0.5) - 1
        else:
            v = math.sin(2 * math.pi * freq * t)
        # envelope (fade in/out para evitar clics)
        env = 1.0
        if i < fade_n:
            env = i / fade_n
        elif i > n - fade_n:
            env = (n - i) / fade_n
        samples.append(v * vol * env)
    return samples


def silence(duration):
    return [0.0] * int(RATE * duration)


def write_wav(path, samples):
    with wave.open(path, 'w') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        frames = b''.join(struct.pack('<h', max(-32767, min(32767, int(s * 32767)))) for s in samples)
        f.writeframes(frames)


# Venta completada: arpegio ascendente alegre y corto (estilo "cha-ching" sutil)
success = (
    note(880, 0.09, vol=0.30)
    + note(1108, 0.09, vol=0.32)
    + note(1320, 0.16, vol=0.34)
)
write_wav('success.wav', success)

# Beep de escaneo de codigo de barras: tono unico corto y agudo
beep = note(1500, 0.07, vol=0.28)
write_wav('beep.wav', beep)

# Error: dos tonos cortos descendentes, graves (no agresivo)
error = (
    note(380, 0.09, vol=0.30, shape='triangle')
    + silence(0.04)
    + note(280, 0.13, vol=0.30, shape='triangle')
)
write_wav('error.wav', error)

# Notificacion: campanita suave de dos notas
notify = (
    note(987, 0.08, vol=0.22)
    + note(1318, 0.14, vol=0.22)
)
write_wav('notify.wav', notify)

print('OK: success.wav, beep.wav, error.wav, notify.wav')
