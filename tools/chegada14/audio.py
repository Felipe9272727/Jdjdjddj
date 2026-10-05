"""Deterministic original wind / portal / impact / breath sound design. No external audio."""
import numpy as np, wave, os, sys
sr=48000;duration=12;t=np.arange(sr*duration)/sr;rng=np.random.default_rng(14)
noise=rng.standard_normal(len(t));spectrum=np.fft.rfft(noise);freq=np.fft.rfftfreq(len(t),1/sr)
wind=np.fft.irfft(spectrum/(1+(freq/420)**2),len(t));wind/=np.std(wind)
hiss=np.fft.irfft(spectrum*np.exp(-((freq-1250)/1300)**2),len(t));hiss/=np.std(hiss)
a=.027*wind*(.7+.3*np.sin(t*.8))+.012*np.sin(2*np.pi*(37*t+.12*np.sin(t)))
# Portal closes behind the listener as the wide desert view cuts in.
env=np.exp(-((t-2.47)/.23)**2);a+=env*(.10*wind+.12*np.sin(2*np.pi*(72*t+30*t*t)))
# Cloth / sand impact, softly band limited.
u=np.maximum(0,t-5.92);hit=(t>=5.92)*np.exp(-u*14);a+=hit*(.25*wind+.24*np.sin(2*np.pi*55*u))
for start,length in [(4.8,.55),(6.65,.6),(7.6,.5),(9.0,.6),(10.4,.65)]:
 p=(t-start)/length;e=np.sin(np.clip(p,0,1)*np.pi)**2*((p>=0)&(p<=1));a+=e*(.10*hiss+.035*wind)
for start in [6.8,8.05,9.25,10.4,11.4]:
 for delay,amp in [(0,.10),(.16,.055)]:
  u=np.maximum(0,t-start-delay);e=(t>=start+delay)*np.exp(-u*30);a+=amp*e*np.sin(2*np.pi*52*u)
fade=np.minimum(1,t/.7)*np.minimum(1,(duration-t)/.4);a=np.tanh(a)*fade
stereo=np.column_stack([a, .985*a+.006*np.roll(wind,140)*fade]);stereo*=.82/max(.82,np.max(np.abs(stereo)))
out=sys.argv[1] if len(sys.argv)>1 else 'tools/chegada14/frames/arrival.wav';os.makedirs(os.path.dirname(out),exist_ok=True)
with wave.open(out,'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((stereo*32767).astype('<i2').tobytes())
print(out)
