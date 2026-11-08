self.addEventListener('message', ({ data }) => {
  const sampleRate = Number(data?.sampleRate) || 48_000;
  const ambient = createAmbientNoise(sampleRate);
  const birds = createBirdChirps(sampleRate);
  const piano = createPianoNote(sampleRate);
  self.postMessage({ ambient, birds, piano }, [ambient.buffer, birds.buffer, piano.buffer]);
});

function createAmbientNoise(sampleRate) {
  const samples = new Float32Array(Math.ceil(sampleRate * 12));
  let brownNoise = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const whiteNoise = Math.random() * 2 - 1;
    brownNoise = (brownNoise + .02 * whiteNoise) / 1.02;
    samples[index] = Math.max(-1, Math.min(1, brownNoise * 4.5));
  }
  return samples;
}

function createBirdChirps(sampleRate) {
  const duration = 6.8;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let cursor = .18;
  while (cursor < duration - .2) {
    const groupSize = 2 + Math.floor(Math.random() * 4);
    for (let chirp = 0; chirp < groupSize && cursor < duration - .2; chirp += 1) {
      const length = .085 + Math.random() * .13;
      const start = Math.floor(cursor * sampleRate);
      const count = Math.min(Math.floor(length * sampleRate), samples.length - start);
      const low = 1_850 + Math.random() * 1_250;
      const peak = low + 350 + Math.random() * 950;
      const end = low * (.78 + Math.random() * .38);
      let phase = Math.random() * Math.PI * 2;
      for (let index = 0; index < count; index += 1) {
        const progress = index / Math.max(1, count - 1);
        const frequency = progress < .48
          ? low + (peak - low) * (progress / .48)
          : peak + (end - peak) * ((progress - .48) / .52);
        phase += Math.PI * 2 * frequency / sampleRate;
        const envelope = Math.sin(Math.PI * progress) ** 1.35;
        samples[start + index] += (Math.sin(phase) + Math.sin(phase * 2.01) * .12) * envelope * .23;
      }
      cursor += length + .055 + Math.random() * .12;
    }
    cursor += .2 + Math.random() * .55;
  }
  normalizePeak(samples, .72);
  return samples;
}

function createPianoNote(sampleRate) {
  const duration = 5.15;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  const fundamental = 164.81 * .994;
  const partials = [
    { multiple: 1, gain: .46, decay: 1.75 },
    { multiple: 2, gain: .25, decay: 1.2 },
    { multiple: 3, gain: .14, decay: .82 },
    { multiple: 4, gain: .08, decay: .62 },
    { multiple: 5, gain: .045, decay: .48 },
  ].map(partial => ({
    ...partial,
    frequency: fundamental * partial.multiple * Math.sqrt(1 + .00016 * partial.multiple ** 2),
    phase: Math.random() * Math.PI * 2,
  }));
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const attack = 1 - Math.exp(-time / .006);
    const release = time < duration - .18
      ? 1 : .5 + .5 * Math.cos(Math.PI * (time - duration + .18) / .18);
    let sample = (Math.random() * 2 - 1) * .025 * Math.exp(-time * 110);
    for (const partial of partials) {
      sample += Math.sin(2 * Math.PI * partial.frequency * time + partial.phase)
        * partial.gain * Math.exp(-time / partial.decay);
    }
    samples[index] = sample * attack * release;
    peak = Math.max(peak, Math.abs(samples[index]));
  }
  if (peak > .78) {
    const scale = .78 / peak;
    for (let index = 0; index < samples.length; index += 1) samples[index] *= scale;
  }
  return samples;
}

function normalizePeak(samples, maximum) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak <= maximum) return;
  const scale = maximum / peak;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= scale;
}
