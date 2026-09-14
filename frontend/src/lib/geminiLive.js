const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

function pcm16Base64(samples) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64Pcm16(value) {
  const binary = atob(value);
  const evenLength = binary.length - (binary.length % 2);
  const samples = new Float32Array(evenLength / 2);
  for (let i = 0; i < evenLength; i += 2) {
    let pcm = binary.charCodeAt(i) | (binary.charCodeAt(i + 1) << 8);
    if (pcm >= 0x8000) pcm -= 0x10000;
    samples[i / 2] = pcm / 0x8000;
  }
  return samples;
}

function resamplePcm16(input, sourceRate) {
  if (sourceRate === INPUT_RATE) {
    return Int16Array.from(input, sample => Math.max(-32768, Math.min(32767, sample * 32768)));
  }
  const ratio = sourceRate / INPUT_RATE;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let total = 0;
    for (let j = start; j < end; j += 1) total += input[j];
    const sample = total / (end - start);
    output[i] = Math.max(-32768, Math.min(32767, sample * 32768));
  }
  return output;
}

function readableError(error) {
  const message = String(error?.message || 'No fue posible iniciar la llamada.');
  if (/permission|denied|notallowed/i.test(message)) return 'Necesito permiso para usar el micrófono.';
  if (/401|403|auth|token/i.test(message)) return 'La sesión de voz no pudo autenticarse.';
  return message;
}

export function supportsGeminiLive() {
  return Boolean(window.isSecureContext && (window.AudioContext || window.webkitAudioContext));
}

export async function startGeminiLive(callbacks = {}) {
  if (!supportsGeminiLive()) throw new Error('La lectura con VALL AI requiere HTTPS y un navegador moderno.');
  const captureMicrophone = callbacks.captureMicrophone !== false;
  if (captureMicrophone && !navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar el micrófono.');

  let active = true;
  let session = null;
  let stream = null;
  let processor = null;
  let microphone = null;
  let silentGain = null;
  let outputGain = null;
  let nextPlaybackAt = 0;
  let turnCompleteReceived = false;
  let inputTranscript = '';
  let outputTranscript = '';
  let outputAudioReceived = false;
  let turnInterrupted = false;
  let turnFinalizeTimer = null;
  const playing = new Set();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioCtx({ latencyHint: 'interactive' });

  const emitState = (state, detail = '') => callbacks.onState?.(state, detail);
  const stopPlayback = () => {
    playing.forEach(source => {
      try { source.stop(); } catch { /* ya terminó */ }
    });
    playing.clear();
    nextPlaybackAt = audioContext.currentTime;
  };
  const finalizeTurn = () => {
    clearTimeout(turnFinalizeTimer);
    turnFinalizeTimer = null;
    const turn = {
      userText: inputTranscript.trim(),
      modelText: outputTranscript.trim(),
      audioMissing: Boolean(outputTranscript.trim() && !outputAudioReceived && !turnInterrupted),
    };
    if (turn.userText || turn.modelText) callbacks.onTurnComplete?.(turn);
    inputTranscript = '';
    outputTranscript = '';
    callbacks.onInputTranscript?.('');
    callbacks.onOutputTranscript?.('');
    outputAudioReceived = false;
    turnInterrupted = false;
  };

  const playAudio = (data) => {
    if (!active || !data) return;
    const samples = base64Pcm16(data);
    if (!samples.length) return;
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const beginsTurn = !outputAudioReceived;
    outputAudioReceived = true;
    const buffer = audioContext.createBuffer(1, samples.length, OUTPUT_RATE);
    buffer.copyToChannel(samples, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputGain || audioContext.destination);
    // Un pequeño colchón al inicio permite acumular los siguientes paquetes
    // y evita el sonido entrecortado/robótico causado por jitter de red.
    const startsAt = beginsTurn
      ? audioContext.currentTime + 0.14
      : Math.max(audioContext.currentTime + 0.015, nextPlaybackAt);
    nextPlaybackAt = startsAt + buffer.duration;
    playing.add(source);
    turnCompleteReceived = false;
    source.onended = () => {
      playing.delete(source);
      if (active && turnCompleteReceived && !playing.size) {
        nextPlaybackAt = audioContext.currentTime;
        emitState('listening');
      }
    };
    source.start(startsAt);
    emitState('speaking');
  };

  const stop = async ({ notify = true } = {}) => {
    if (!active) return;
    finalizeTurn();
    active = false;
    try { session?.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* socket cerrado */ }
    try { session?.close(); } catch { /* socket cerrado */ }
    processor?.disconnect();
    microphone?.disconnect();
    silentGain?.disconnect();
    outputGain?.disconnect();
    stream?.getTracks().forEach(track => track.stop());
    stopPlayback();
    await audioContext.close().catch(() => {});
    if (notify) emitState('ended');
  };

  try {
    emitState('connecting');
    await audioContext.resume();
    outputGain = audioContext.createGain();
    outputGain.gain.value = 1.08;
    outputGain.connect(audioContext.destination);

    const response = await fetch('/api/ai-live-token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const auth = await response.json().catch(() => ({}));
    if (!response.ok || !auth.token) throw new Error(auth.error || 'No fue posible crear la sesión de voz.');

    // El SDK pesa lo suficiente para no incluirlo en la carga inicial del sitio.
    // Solo se descarga cuando el usuario inicia una llamada.
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: auth.token, httpOptions: { apiVersion: 'v1alpha' } });
    session = await ai.live.connect({
      model: auth.model,
      config: auth.config,
      callbacks: {
        onopen: () => emitState('listening'),
        onmessage: (message) => {
          if (!active) return;
          const server = message?.serverContent;
          if (!server) return;

          if (server.interrupted) {
            turnInterrupted = true;
            stopPlayback();
            outputAudioReceived = false;
            turnCompleteReceived = false;
            emitState('listening', 'Te escucho…');
          }
          if (server.inputTranscription?.text) {
            inputTranscript += server.inputTranscription.text;
            callbacks.onInputTranscript?.(inputTranscript);
          }
          if (server.outputTranscription?.text) {
            outputTranscript += server.outputTranscription.text;
            callbacks.onOutputTranscript?.(outputTranscript);
          }
          server.modelTurn?.parts?.forEach(part => {
            if (part.inlineData?.data && /^audio\//i.test(part.inlineData.mimeType || 'audio/pcm')) playAudio(part.inlineData.data);
          });
          if (server.turnComplete) {
            turnCompleteReceived = true;
            // Las transcripciones no tienen orden garantizado respecto a
            // turnComplete; damos una ventana breve a los fragmentos finales.
            clearTimeout(turnFinalizeTimer);
            turnFinalizeTimer = setTimeout(finalizeTurn, 450);
            if (!playing.size) emitState('listening');
          }
        },
        onerror: (event) => {
          const error = event?.error || new Error('Se perdió la conexión de voz.');
          callbacks.onError?.(readableError(error));
          stop({ notify: false });
        },
        onclose: () => {
          if (active) {
            callbacks.onError?.('La llamada de voz terminó inesperadamente.');
            stop({ notify: false });
          }
        },
      },
    });

    if (captureMicrophone) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      microphone = audioContext.createMediaStreamSource(stream);
      // 1024 muestras son ~21 ms a 48 kHz, dentro del tamaño recomendado para Live.
      processor = audioContext.createScriptProcessor(1024, 1, 1);
      silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.onaudioprocess = event => {
        if (!active || !session) return;
        const pcm = resamplePcm16(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
        const level = Math.sqrt(pcm.reduce((sum, value) => sum + (value / 32768) ** 2, 0) / pcm.length);
        // Mientras habla la IA enviamos silencio si solo detectamos el eco de las
        // bocinas. Una voz humana cercana supera el umbral y conserva el barge-in.
        const outgoing = playing.size && level < 0.04 ? new Int16Array(pcm.length) : pcm;
        session.sendRealtimeInput({ audio: { data: pcm16Base64(outgoing), mimeType: `audio/pcm;rate=${INPUT_RATE}` } });
        callbacks.onLevel?.(Math.min(1, level * 8));
      };
      microphone.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
    }

    const speak = text => {
      const prompt = String(text || '').trim();
      if (!active || !session || !prompt) return;
      session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: prompt }] }], turnComplete: true });
    };
    return { stop, interrupt: stopPlayback, speak };
  } catch (error) {
    await stop({ notify: false });
    throw new Error(readableError(error));
  }
}
