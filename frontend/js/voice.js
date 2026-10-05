// =========================================================
// voice.js - Bolkar sawaal puchna (Speech to Text)
// Browser ki Web Speech API use hoti hai (Chrome / Edge mein chalti hai)
// =========================================================

function attachVoice(button, textarea, onChange) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    button.hidden = true; // browser support nahi karta
    return;
  }

  let rec = null;
  let listening = false;

  function setState(on) {
    listening = on;
    button.classList.toggle('is-listening', on);
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? 'Stop listening' : 'Speak your question';
  }

  button.addEventListener('click', () => {
    if (listening) { rec.stop(); return; }

    rec = new Recognition();
    rec.lang = speechLang();
    rec.interimResults = true;
    rec.continuous = false;

    const before = textarea.value ? textarea.value.trimEnd() + ' ' : '';

    rec.onresult = (event) => {
      let spoken = '';
      for (const result of event.results) spoken += result[0].transcript;
      textarea.value = before + spoken;
      if (onChange) onChange();
    };
    rec.onend = () => setState(false);
    rec.onerror = (event) => {
      if (event.error === 'not-allowed') {
        showToast('Microphone is blocked. Allow it from the lock icon in the address bar.', 'error');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        showToast('Voice input stopped: ' + event.error, 'error');
      }
    };

    rec.start();
    setState(true);
    textarea.focus();
  });
}

// ---------- Answer ko bolkar sunana (Text to Speech) ----------
let speakingButton = null;

function toggleSpeak(button, text) {
  if (!('speechSynthesis' in window)) {
    showToast('Read aloud is not supported in this browser.', 'error');
    return;
  }
  const wasThis = speakingButton === button;
  speechSynthesis.cancel();
  resetSpeakButton();
  if (wasThis) return; // dobara click = band

  const utter = new SpeechSynthesisUtterance(plainText(text));
  utter.lang = speechLang();
  utter.rate = 1;
  utter.onend = resetSpeakButton;
  speakingButton = button;
  button.classList.add('is-active');
  button.querySelector('span').textContent = 'Stop';
  speechSynthesis.speak(utter);
}

function resetSpeakButton() {
  if (speakingButton) {
    speakingButton.classList.remove('is-active');
    speakingButton.querySelector('span').textContent = 'Listen';
  }
  speakingButton = null;
}
