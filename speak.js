// api/speak.js
// Calls ElevenLabs TTS with Aemu's voice and returns audio to the browser

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    res.status(500).json({ error: 'ElevenLabs credentials not configured' }); return;
  }

  const { text } = req.body;
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  // Trim to 500 chars max to keep latency and credit usage reasonable
  const trimmed = text.slice(0, 500);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: trimmed,
          model_id: 'eleven_turbo_v2_5', // fastest, lowest latency
          voice_settings: {
            stability: 0.52,         // balanced — not too rigid, not too variable
            similarity_boost: 0.88,  // stays true to Sael's voice
            style: 0.18,             // gentle warmth without overdoing it
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('ElevenLabs error:', err);
      res.status(500).json({ error: 'ElevenLabs TTS failed', detail: err }); return;
    }

    // Stream the audio back
    const audioBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(audioBuffer));

  } catch (err) {
    console.error('speak error:', err);
    res.status(500).json({ error: 'Voice synthesis disruption' });
  }
};
